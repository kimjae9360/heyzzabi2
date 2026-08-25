import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notifyUser } from "@/lib/notify";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // 배분 승인: PM이 이 담당자에게 업무를 배정하는 것을 승인 — 작업이 이제 시작됨(FR-05-018)
    // 주의: 업무 완료 승인이 아니다. 완료(DONE) 처리는 담당자가 스스로 상태를 바꾸며,
    // 이 라우트는 오직 "배정된 담당자가 이 업무를 맡는 것"만 승인/거부 대상으로 삼는다.
    // 현재 status가 PENDING_APPROVAL인지는 별도로 검증하지 않고 무조건 IN_PROGRESS로 옮긴다.
    const task = await prisma.task.update({
      where: { id },
      data: {
        status: "IN_PROGRESS",
        // 예전에 반려됐다가 다시 배정 요청이 올라온 경우를 대비해 과거 반려 사유를 초기화한다.
        rejectReason: null,
      },
      include: {
        assignee: { select: { name: true, email: true } },
        project: { select: { name: true } },
      }
    });

    if (task.assigneeId) {
      await notifyUser(task.assigneeId, `"${task.title}" 업무 배분이 승인되었습니다.`, { type: "success", link: "/tasks" });
    }

    return NextResponse.json({ success: true, data: task });
  } catch (error: any) {
    console.error("Approve Task Error:", error);
    return NextResponse.json({ success: false, error: "승인 처리에 실패했습니다." }, { status: 500 });
  }
}
