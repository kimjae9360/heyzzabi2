import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { currentPassword, newPassword } = await request.json();

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ success: false, error: "현재 비밀번호와 새 비밀번호를 모두 입력해주세요." }, { status: 400 });
    }
    if (newPassword.length < 6) {
      return NextResponse.json({ success: false, error: "새 비밀번호는 최소 6자리 이상이어야 합니다." }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return NextResponse.json({ success: false, error: "사용자를 찾을 수 없습니다." }, { status: 404 });
    }
    if (user.password !== currentPassword) {
      return NextResponse.json({ success: false, error: "현재 비밀번호가 일치하지 않습니다." }, { status: 401 });
    }

    await prisma.user.update({
      where: { id },
      data: { password: newPassword, mustChangePassword: false },
    });

    return NextResponse.json({ success: true, message: "비밀번호가 변경되었습니다." });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: "비밀번호 변경 실패" }, { status: 500 });
  }
}
