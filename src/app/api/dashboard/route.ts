import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const now = new Date();
    const { searchParams } = new URL(request.url);
    const scope = searchParams.get("scope"); // "me" for personal (non-PM) view
    const userId = searchParams.get("userId");
    const isPersonal = scope === "me" && !!userId;
    const taskWhere = isPersonal ? { assigneeId: userId } : {};

    const [
      totalTasks,
      tasksByStatus,
      workloadByUser,
      recentTasks,
      projects,
      overdueCount,
    ] = await Promise.all([
      prisma.task.count({ where: taskWhere }),
      prisma.task.groupBy({ by: ["status"], _count: { status: true }, where: taskWhere }),
      isPersonal
        ? Promise.resolve([])
        : prisma.task.groupBy({
            by: ["assigneeId"],
            _count: { assigneeId: true },
            where: { assigneeId: { not: null } },
          }),
      prisma.task.findMany({
        take: 8,
        where: taskWhere,
        orderBy: { updatedAt: "desc" },
        include: {
          project: { select: { id: true, name: true } },
          assignee: { select: { name: true } },
        },
      }),
      prisma.project.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          _count: { select: { tasks: true } },
          tasks: {
            select: { status: true, assigneeId: true },
          },
        },
      }),
      // Overdue: wbsEnd is set, past due, and not done/cancelled
      prisma.task.count({
        where: {
          ...taskWhere,
          wbsEnd: { lt: now },
          status: { notIn: ["DONE", "CANCELLED"] },
        },
      }),
    ]);

    const statusMap: Record<string, number> = {};
    tasksByStatus.forEach((s) => { statusMap[s.status] = s._count.status; });

    const done = statusMap["DONE"] ?? 0;
    const pendingApproval = statusMap["PENDING_APPROVAL"] ?? 0;
    const inProgress = statusMap["IN_PROGRESS"] ?? 0;
    const backlog = statusMap["BACKLOG"] ?? 0;
    const completionRate = totalTasks > 0 ? Math.round((done / totalTasks) * 100) : 0;

    // Workload
    const assigneeIds = workloadByUser.filter((w) => w.assigneeId).map((w) => w.assigneeId as string);
    const users = await prisma.user.findMany({
      where: { id: { in: assigneeIds } },
      select: { id: true, name: true },
    });
    const userMap: Record<string, string> = {};
    users.forEach((u) => (userMap[u.id] = u.name));
    const workload = workloadByUser
      .filter((w) => w.assigneeId)
      .map((w) => ({
        name: userMap[w.assigneeId as string] ?? "Unknown",
        taskCount: w._count.assigneeId,
        percentage: totalTasks > 0 ? Math.round((w._count.assigneeId / totalTasks) * 100) : 0,
      }))
      .sort((a, b) => b.taskCount - a.taskCount)
      .slice(0, 6);

    // Status chart
    const statusChart = [
      { name: "대기", value: backlog, color: "#94a3b8" },
      { name: "배분승인대기", value: pendingApproval, color: "#f97316" },
      { name: "진행 중", value: inProgress, color: "#3b82f6" },
      { name: "완료", value: done, color: "#10b981" },
    ].filter((s) => s.value > 0);

    // Activity log
    const statusLabels: Record<string, string> = {
      BACKLOG: "대기중으로 변경됨",
      IN_PROGRESS: "진행 중으로 변경됨",
      PENDING_APPROVAL: "배분 승인 대기중",
      DONE: "최종 완료됨",
      CANCELLED: "취소됨",
    };
    const activityLog = recentTasks.map((t) => ({
      taskTitle: t.title,
      projectName: t.project.name,
      projectId: t.project.id,
      assigneeName: t.assignee?.name ?? null,
      status: t.status,
      statusLabel: statusLabels[t.status] ?? t.status,
      updatedAt: t.updatedAt,
    }));

    // Project list with progress — personal view only surfaces projects the user has tasks in
    const projectList = projects
      .filter((p) => !isPersonal || p.tasks.some((t) => t.assigneeId === userId))
      .map((p) => {
        const total = p.tasks.length;
        const doneCount = p.tasks.filter((t) => t.status === "DONE").length;
        const progress = total > 0 ? Math.round((doneCount / total) * 100) : 0;
        return {
          id: p.id,
          name: p.name,
          totalTasks: total,
          doneTasks: doneCount,
          progress,
          createdAt: p.createdAt,
        };
      });

    return NextResponse.json({
      isPersonal,
      summary: {
        totalTasks,
        totalProjects: projects.length,
        done,
        inProgress,
        pendingApproval,
        backlog,
        completionRate,
        overdueCount,
      },
      statusChart,
      workload,
      activityLog,
      projectList,
    });
  } catch (error: any) {
    console.error("Dashboard Stats Error:", error);
    return NextResponse.json({ error: "Stats fetch failed" }, { status: 500 });
  }
}