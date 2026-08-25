import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/passwordHash";
import { requirePM } from "@/lib/requireAuth";

// 관리자가 다른 사용자의 비밀번호를 강제로 초기화한다 (비밀번호를 잊었을 때 등).
// 신규 계정 생성 때와 동일하게 고정 초기값("1111")으로 되돌리고, mustChangePassword를 다시 true로
// 세팅해 다음 로그인 시 사용자가 반드시 새 비밀번호로 바꾸도록 강제한다.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error: authError } = await requirePM();
    if (authError) return authError;

    const { id } = await params;
    await prisma.user.update({
      where: { id },
      data: { password: await hashPassword("1111"), mustChangePassword: true },
    });
    return NextResponse.json({ success: true, message: "비밀번호가 1111로 초기화되었습니다." });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: "비밀번호 초기화 실패" }, { status: 500 });
  }
}