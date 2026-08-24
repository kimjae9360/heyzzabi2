import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.user.update({
      where: { id },
      data: { password: "1111", mustChangePassword: true },
    });
    return NextResponse.json({ success: true, message: "비밀번호가 1111로 초기화되었습니다." });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: "비밀번호 초기화 실패" }, { status: 500 });
  }
}