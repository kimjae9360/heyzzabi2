import { NextResponse } from "next/server";
import { getSession, type SessionPayload } from "@/lib/session";

type Guard = { session: SessionPayload | null; error: NextResponse | null };

// 로그인만 되어 있으면 통과 — 세션이 없으면(로그인 안 함/쿠키 만료) 401.
export async function requireAuth(): Promise<Guard> {
  const session = await getSession();
  if (!session) {
    return { session: null, error: NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 }) };
  }
  return { session, error: null };
}

// PM 전용 API 가드 — 지금까지는 클라이언트의 isPM 불리언만으로 버튼을 숨겼을 뿐, API 자체에는
// 검증이 없어서 EMPLOYEE 계정이 직접 이 API를 호출하면 (URL만 알면) 막을 방법이 없었다
// (PROJECT_STATUS.md에 기록된 알려진 문제). 세션의 role은 로그인 시 서버가 DB에서 읽어 서명한
// 값이라 클라이언트가 조작할 수 없다 — 프론트의 DEV 롤 토글(localStorage)과 달리 이건 실제 계정
// 권한을 반영한다.
export async function requirePM(): Promise<Guard> {
  const { session, error } = await requireAuth();
  if (error) return { session, error };
  if (session!.role !== "PM") {
    return { session, error: NextResponse.json({ error: "PM 권한이 필요합니다." }, { status: 403 }) };
  }
  return { session, error: null };
}
