import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { reason } = await request.json();

    // 반려 사유 없이는 반려할 수 없다 — 담당자가 왜 배정이 취소됐는지 알아야
    // 재배정 논의를 할 수 있으므로 사유 입력을 강제한다.
    if (!reason || !reason.trim()) {
      return NextResponse.json({ success: false, error: "반려 사유는 필수입니다." }, { status: 400 });
    }

    // 배분 반려: 제안된 담당자 배정을 거부 — 담당자 배정을 해제하고 대기 풀로 되돌림(FR-05-019)
    // approve와 대칭 구조: PENDING_APPROVAL -> IN_PROGRESS가 아니라 BACKLOG로 되돌아가며,
    // assigneeId를 비워 처음부터 다시 담당자를 배정받아야 한다.
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
