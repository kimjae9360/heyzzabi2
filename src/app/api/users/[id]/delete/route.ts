import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 사용자 계정을 완전히 삭제한다 (상태를 RESIGNED 등으로 바꾸는 소프트 삭제가 아니라 row 자체를 제거).
// Task.assignee 관계는 optional이라 별도 onDelete 설정이 없으면 Prisma가 관련 Task의
// assigneeId를 null로 정리해준다 — 즉 이 사용자가 담당하던 업무는 삭제되지 않고 "담당자 없음" 상태가 된다.
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.user.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: "계정 삭제 실패" }, { status: 500 });
  }
}