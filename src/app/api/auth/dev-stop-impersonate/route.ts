import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSessionToken, SESSION_COOKIE } from "@/lib/session";
import { requireAuth } from "@/lib/requireAuth";
import { isDevToolsEnabled } from "@/lib/devTools";

// DEV 전용 — dev-impersonate로 다른 계정을 미리보던 세션을 원래 PM 계정으로 되돌린다.
// impersonatedBy에 남겨둔 원래 PM의 id로 새 세션 쿠키를 발급한다(비밀번호 재입력 없이).
export async function POST() {
  if (!isDevToolsEnabled()) {
    return NextResponse.json({ error: "이 기능은 개발 환경에서만 사용할 수 있습니다." }, { status: 403 });
  }

  const { session, error: authError } = await requireAuth();
  if (authError) return authError;

  const originalPmId = session!.impersonatedBy;
  if (!originalPmId) {
    return NextResponse.json({ error: "미리보기 중인 세션이 아닙니다." }, { status: 400 });
  }

  try {
    const pm = await prisma.user.findUnique({ where: { id: originalPmId } });
    if (!pm || pm.status !== "ACTIVE") {
      return NextResponse.json({ error: "원래 계정을 복원할 수 없습니다. 다시 로그인해주세요." }, { status: 404 });
    }

    const isPM = pm.role === "PM" || pm.role === "ADMIN";
    const response = NextResponse.json({ id: pm.id, email: pm.email, name: pm.name, role: isPM ? "PM" : "MEMBER" });
    response.cookies.set(SESSION_COOKIE, createSessionToken(pm.id, isPM ? "PM" : "EMPLOYEE"), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    return response;
  } catch (error) {
    console.error("Dev stop-impersonate error:", error);
    return NextResponse.json({ error: "계정 복원에 실패했습니다." }, { status: 500 });
  }
}
