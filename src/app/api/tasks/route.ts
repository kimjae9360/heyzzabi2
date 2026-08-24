import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const assigneeId = searchParams.get('assigneeId');

    const status = searchParams.get('status');

    const where: any = {};
    if (assigneeId) where.assigneeId = assigneeId;
    if (status) where.status = status;

    const tasks = await prisma.task.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        project: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ success: true, data: tasks });
  } catch (error: any) {
    console.error("Task Fetch Error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch tasks." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { title, status, projectId, description, assigneeId, difficulty, wbsStart, wbsEnd } = body;

    if (!title || !status || !projectId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const newTask = await prisma.task.create({
      data: {
        title,
        status,
        projectId,
        difficulty: "보통",
        progress: 0,
      }
    });

    return NextResponse.json(newTask);
  } catch (error: any) {
    console.error("Create Task Error:", error);
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
  }
}

// PATCH: update task status
export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const taskId = body.id || body.taskId;
    const newStatus = body.status || body.newStatus;

    if (!taskId || !newStatus) {
      return NextResponse.json({ error: "id and status are required." }, { status: 400 });
    }

    const validStatuses = ["BACKLOG", "PENDING_APPROVAL", "IN_PROGRESS", "DONE", "CANCELLED"];
    if (!validStatuses.includes(newStatus)) {
      return NextResponse.json({ error: "Invalid status value." }, { status: 400 });
    }

    const isDone = newStatus === "DONE";
    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: { 
        status: newStatus as any,
        completedAt: isDone ? new Date() : null 
      },
    });

    return NextResponse.json({ success: true, data: updatedTask });
  } catch (error: any) {
    console.error("Task Update Error:", error);
    return NextResponse.json({ success: false, error: "Failed to update task." }, { status: 500 });
  }
}
