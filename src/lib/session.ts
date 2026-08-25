import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "hz_auth";

// 별도 세션 스토어(Redis 등) 없이, 페이로드에 HMAC 서명만 붙여 위변조를 막는 자체 서명 토큰
// 방식을 쓴다 — jsonwebtoken/iron-session 같은 라이브러리를 새로 추가하지 않고도 필요한 만큼
// (userId+role 검증)을 충족한다. .env에 이미 이 목적으로 만들어뒀던 JWT_SECRET을 그대로 쓴다
// (실제 JWT 라이브러리를 쓰진 않지만 "서명용 시크릿"이라는 용도는 같다). 없으면(로컬 개발 등)
// 콘솔에 경고만 남기고 개발용 기본값으로 동작한다 — 배포 전에는 반드시 실제 시크릿으로 바꿔야 한다.
const SECRET = process.env.JWT_SECRET || "dev-only-insecure-secret-change-before-deploy";
if (!process.env.JWT_SECRET && process.env.NODE_ENV !== "test") {
  console.warn("[session] JWT_SECRET 환경변수가 설정되지 않아 개발용 기본 시크릿을 사용합니다. 배포 전 반드시 설정하세요.");
}

export type SessionPayload = { userId: string; role: "PM" | "EMPLOYEE"; iat: number };

function sign(body: string): string {
  return createHmac("sha256", SECRET).update(body).digest("base64url");
}

export function createSessionToken(userId: string, role: string): string {
  const payload: SessionPayload = { userId, role: role === "PM" ? "PM" : "EMPLOYEE", iat: Date.now() };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifySessionToken(token: string | undefined | null): SessionPayload | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expectedSig = sign(body);
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  // 길이가 다르면 timingSafeEqual이 바로 예외를 던지므로 먼저 걸러낸다.
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString()) as SessionPayload;
  } catch {
    return null;
  }
}

// Route Handler 안에서 현재 로그인 사용자를 읽는다. next/headers의 cookies()는 Next 15+부터
// Route Handler/Server Component 어디서든 읽기는 가능하고, 쓰기(set)는 Route Handler와
// Server Action에서만 가능하다 — 로그인/로그아웃 라우트는 NextResponse.cookies.set/delete를 쓴다.
export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}
