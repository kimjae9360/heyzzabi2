import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// tasks/route.ts(일괄 수정)의 화이트리스트와 동일해야 한다 — 여기 없으면 "TODO" 같은 값이
// 그대로 저장돼서 칸반보드의 어느 컬럼에도 안 걸리는 유령 업무가 생긴다(QA에서 발견).
const VALID_TASK_STATUSES = ["BACKLOG", "PENDING_APPROVAL", "IN_PROGRESS", "DONE", "CANCELLED"];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    // Extract updateable fields
    const { title, description, status, difficulty, progress, wbsStart, wbsEnd, assigneeId, gitStatus, estimatedHours, assignmentReason } = body;

    if (status !== undefined && !VALID_TASK_STATUSES.includes(status)) {
      return NextResponse.json({ success: false, error: "잘못된 status 값입니다." }, { status: 400 });
    }

    const updateData: any = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (status !== undefined) {
      updateData.status = status;
      if (status === "DONE") updateData.completedAt = new Date();
      else if (status === "BACKLOG") updateData.completedAt = null;
    }
    if (difficulty !== undefined) updateData.difficulty = difficulty;
    if (progress !== undefined) updateData.progress = Number(progress);
    if (wbsStart !== undefined) updateData.wbsStart = wbsStart ? new Date(wbsStart) : null;
    if (wbsEnd !== undefined) updateData.wbsEnd = wbsEnd ? new Date(wbsEnd) : null;
    if (assigneeId !== undefined) updateData.assigneeId = assigneeId || null;
    if (gitStatus !== undefined) updateData.gitStatus = gitStatus;
    if (estimatedHours !== undefined) updateData.estimatedHours = estimatedHours === null ? null : Number(estimatedHours);
    if (assignmentReason !== undefined) updateData.assignmentReason = assignmentReason;

    const updated = await prisma.task.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    // assigneeId가 존재하지 않는 유저를 가리키면 Prisma가 FK 제약(P2003)으로 던진다 —
    // 그대로 흘려보내면 원인 불명 500이 되니 여기서 잡아 400으로 명확히 응답한다(QA에서 발견).
    if (error?.code === "P2003") {
      return NextResponse.json({ success: false, error: "존재하지 않는 담당자입니다." }, { status: 400 });
    }
    console.error("Task patch error:", error);
    return NextResponse.json({ success: false, error: "Failed to update task" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.task.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: "Failed to delete task" }, { status: 500 });
  }
}