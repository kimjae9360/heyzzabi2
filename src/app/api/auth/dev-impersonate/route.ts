import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSessionToken, SESSION_COOKIE } from "@/lib/session";
import { requirePM } from "@/lib/requireAuth";

// DEV 전용 — 좌측 사이드바 "DEV 롤 토글"이 재로그인 없이 팀원 화면/권한을 그대로 미리보기 위해
// 쓰는 라우트. 이전엔 클라이언트(localStorage)만 바꿔서 화면 라벨은 바뀌어도 실제 API 호출은
// 여전히 PM 권한으로 처리됐다 — "일반유저가 만든 회의록을 PM이 대신 생성하면 안 된다" 같은
// 서버 권한 규칙을 빠르게 테스트하려면 진짜로 세션이 바뀌어야 한다는 요청으로 추가했다.
// 프로덕션에서는 절대 열리면 안 되므로 NODE_ENV로 강하게 막는다 — PM이 이미 가진 권한 밖의
// 일을 할 수 있게 해주는 건 아니지만(오히려 낮은 권한으로 전환), 비밀번호 없이 다른 계정의
// 서명된 세션을 발급하는 기능이라 개발 환경 밖에서는 존재 자체가 위험하다.
export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
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
        // 이 라우트 자체가 함수 맨 위에서 프로덕션이면 이미 막히므로(NODE_ENV==='production' 도달 불가),
        // 여기 도달했다는 건 항상 개발 환경이라는 뜻이라 secure는 고정으로 false.
        secure: false,
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
