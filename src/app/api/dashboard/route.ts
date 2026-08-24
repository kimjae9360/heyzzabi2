import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 대시보드 통계 조회. scope=me&userId=... 로 호출하면 "내가 담당한 업무"만 집계하는
// 개인용(팀원) 대시보드가 되고, 파라미터가 없으면 프로젝트 전체를 집계하는 PM용
// 팀 대시보드가 된다. 이후 로직 전반에서 taskWhere를 공통으로 재사용해 두 모드를 분기한다.
export async function GET(request: Request) {
  try {
    const now = new Date();
    const { searchParams } = new URL(request.url);
    const scope = searchParams.get("scope"); // "me" for personal (non-PM) view
    const userId = searchParams.get("userId");
    const isPersonal = scope === "me" && !!userId;
    const taskWhere = isPersonal ? { assigneeId: userId } : {};

    // 아래 쿼리들은 서로 의존성이 없으므로 Promise.all로 병렬 실행해 응답 시간을 줄인다.
    const [
      totalTasks,
      tasksByStatus,
      workloadByUser,
      recentTasks,
      projects,
      overdueCount,
    ] = await Promise.all([
      prisma.task.count({ where: taskWhere }),
      // 상태별 업무 개수를 DB에서 groupBy로 한 번에 집계 (BACKLOG/PENDING_APPROVAL/IN_PROGRESS/DONE 등)
      prisma.task.groupBy({ by: ["status"], _count: { status: true }, where: taskWhere }),
      // 담당자별 업무 분포(워크로드)는 팀 전체를 조망하는 PM 대시보드에서만 의미가 있으므로,
      // 개인 모드에서는 굳이 쿼리를 날리지 않고 빈 배열로 자리만 채워 Promise.all 튜플 형태를 유지한다.
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

    // groupBy 결과(배열)를 상태값 -> 개수 맵으로 펼쳐서 아래에서 바로 꺼내 쓸 수 있게 한다.
    const statusMap: Record<string, number> = {};
    tasksByStatus.forEach((s) => { statusMap[s.status] = s._count.status; });

    const done = statusMap["DONE"] ?? 0;
    // PENDING_APPROVAL은 "업무 완료 승인 대기"가 아니라 "담당자 배분 승인 대기" 상태다.
    // 파이프라인 순서: BACKLOG -> PENDING_APPROVAL(배분 승인) -> IN_PROGRESS -> DONE.
    const pendingApproval = statusMap["PENDING_APPROVAL"] ?? 0;
    const inProgress = statusMap["IN_PROGRESS"] ?? 0;
    const backlog = statusMap["BACKLOG"] ?? 0;
    const completionRate = totalTasks > 0 ? Math.round((done / totalTasks) * 100) : 0;

    // Workload
    // groupBy는 assigneeId만 주므로, 실제 이름을 보여주기 위해 별도로 사용자 정보를 조회해 매핑한다.
    const assigneeIds = workloadByUser.filter((w) => w.assigneeId).map((w) => w.assigneeId as string);
    const users = await prisma.user.findMany({
      where: { id: { in: assigneeIds } },
      select: { id: true, name: true },
    });
    const userMap: Record<string, string> = {};
    users.forEach((u) => (userMap[u.id] = u.name));
    // 담당자별 업무 비중(percentage)을 계산하고, 업무가 가장 많은 상위 6명만 노출한다.
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
    // 화면에 그대로 표시할 상태별 한글 라벨. "배분 승인 대기중"은 완료 승인이 아니라
    // 담당자 지정에 대한 승인 대기를 의미하므로 실제 업무 완료(DONE)와 혼동하지 않도록 주의.
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
          // 프로젝트 진행률 = 완료 업무 수 / 전체 업무 수 (백분율, 반올림)
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