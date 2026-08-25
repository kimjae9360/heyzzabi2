import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/requireAuth";

// 클라이언트(auth.tsx)가 주기적으로 호출해 "지금도 여전히 로그인 상태를 유지해도 되는지"
// 확인하는 용도. requireAuth가 세션 쿠키뿐 아니라 DB의 현재 계정 상태(status)까지 확인하므로,
// 로그인해 있는 동안 PM이 이 계정을 휴직/퇴사/잠금 처리하면 다음 폴링 때 401이 오고,
// 클라이언트는 그걸 신호로 강제 로그아웃시킨다.
export async function GET() {
  const { session, error } = await requireAuth();
  if (error) return error;

  const user = await prisma.user.findUnique({
    where: { id: session!.userId },
    select: { id: true, email: true, name: true, role: true, mustChangePassword: true },
  });
  if (!user) {
    return NextResponse.json({ error: "계정을 찾을 수 없습니다." }, { status: 401 });
  }

  const isPM = user.role === "PM" || user.role === "ADMIN";
  return NextResponse.json({
    id: user.id, email: user.email, name: user.name,
    role: isPM ? "PM" : "MEMBER",
    isFirstLogin: user.mustChangePassword,
  });
}
