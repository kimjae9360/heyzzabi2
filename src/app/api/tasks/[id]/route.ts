import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    
    // Extract updateable fields
    const { title, description, status, difficulty, progress, wbsStart, wbsEnd, assigneeId, gitStatus, estimatedHours, assignmentReason } = body;

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