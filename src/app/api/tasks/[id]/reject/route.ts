import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { reason } = await request.json();

    if (!reason || !reason.trim()) {
      return NextResponse.json({ success: false, error: "반려 사유는 필수입니다." }, { status: 400 });
    }

    // 배분 반려: 제안된 담당자 배정을 거부 — 담당자 배정을 해제하고 대기 풀로 되돌림(FR-05-019)
    const task = await prisma.task.update({
      where: { id },
      data: {
        status: "BACKLOG",
        assigneeId: null,
        rejectReason: reason,
        completedAt: null,
      },
      include: {
        assignee: { select: { name: true, email: true } },
        project: { select: { name: true } },
      }
    });

    return NextResponse.json({ success: true, data: task });
  } catch (error: any) {
    console.error("Reject Task Error:", error);
    return NextResponse.json({ success: false, error: "반려 처리에 실패했습니다." }, { status: 500 });
  }
}
