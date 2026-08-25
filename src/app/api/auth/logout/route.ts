import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

// 로그인 시 심어둔 서명 세션 쿠키를 지운다. 클라이언트 쪽 localStorage(hz_session) 정리는
// auth.tsx의 logout()이 별도로 처리한다 — 여기는 서버가 실제 권한 판단에 쓰는 쿠키만 담당.
export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return response;
}
