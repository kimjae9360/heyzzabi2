import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSessionToken, SESSION_COOKIE } from "@/lib/session";
import { requirePM } from "@/lib/requireAuth";
import { isDevToolsEnabled } from "@/lib/devTools";

// DEV 전용 — 좌측 사이드바 "DEV 롤 토글"이 재로그인 없이 팀원 화면/권한을 그대로 미리보기 위해
// 쓰는 라우트. 이전엔 클라이언트(localStorage)만 바꿔서 화면 라벨은 바뀌어도 실제 API 호출은
// 여전히 PM 권한으로 처리됐다 — "일반유저가 만든 회의록을 PM이 대신 생성하면 안 된다" 같은
// 서버 권한 규칙을 빠르게 테스트하려면 진짜로 세션이 바뀌어야 한다는 요청으로 추가했다.
// 기본적으로 프로덕션 빌드에서는 막혀 있다 — 비밀번호 없이 다른 계정의 서명된 세션을 발급하는
// 기능이라 아무 배포에나 기본으로 열려있으면 위험하기 때문. 배포 환경에서도 로그인 없이 빠르게
// 테스트하고 싶다면, 그 환경변수에 NEXT_PUBLIC_ENABLE_DEV_TOOLS=true를 명시적으로 설정해야 한다
// (src/lib/devTools.ts 참고 — 이 값을 켠 배포는 PM 계정이 다른 계정을 마음대로 사칭할 수 있다는
// 뜻이므로, 실제 고객 데이터가 있는 배포에는 절대 켜면 안 된다).
export async function POST(request: Request) {
  if (!isDevToolsEnabled()) {
    return NextResponse.json({ error: "이 기능은 개발 환경에서만 사용할 수 있습니다." }, { status: 403 });
  }

  const { session, error: authError } = await requirePM();
  if (authError) return authError;

  // 이미 다른 계정을 미리보기 중인 상태에서 또 impersonate를 시작하면 원래 PM 신원을 잃어버린다 —
  // 먼저 /api/auth/dev-stop-impersonate로 복귀한 뒤에만 새로 시작할 수 있게 막는다.
  if (session!.impersonatedBy) {
    return NextResponse.json({ error: "이미 다른 계정을 미리보기 중입니다. 먼저 PM으로 돌아가주세요." }, { status: 400 });
  }

  try {
    const { targetUserId } = await request.json();
    if (!targetUserId) {
      return NextResponse.json({ error: "targetUserId가 필요합니다." }, { status: 400 });
    }

    const target = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!target || target.status !== "ACTIVE") {
      return NextResponse.json({ error: "미리볼 계정을 찾을 수 없습니다." }, { status: 404 });
    }

    const isPM = target.role === "PM" || target.role === "ADMIN";
    const response = NextResponse.json({
      id: target.id,
      email: target.email,
      name: target.name,
      role: isPM ? "PM" : "MEMBER",
    });
    response.cookies.set(
      SESSION_COOKIE,
      // impersonatedBy에 "지금 실제로 로그인한 PM"의 id를 남겨야 나중에 정확히 복원할 수 있다.
      createSessionToken(target.id, isPM ? "PM" : "EMPLOYEE", session!.userId),
      {
        httpOnly: true,
        sameSite: "lax",
        // opt-in으로 프로덕션(HTTPS)에서도 이 라우트가 열릴 수 있으므로, secure는 로그인 라우트와
        // 동일하게 NODE_ENV 기준으로 정확히 맞춘다(로컬 HTTP에서는 false, 배포 HTTPS에서는 true).
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
      }
    );
    return response;
  } catch (error) {
    console.error("Dev impersonate error:", error);
    return NextResponse.json({ error: "계정 전환에 실패했습니다." }, { status: 500 });
  }
}
