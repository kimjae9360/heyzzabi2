import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAndNotifyOverdueTasks } from "@/lib/overdueCheck";

// 전체 업무 목록 조회 — assigneeId/status 쿼리 파라미터로 선택적으로 필터링한다
// (예: "내 업무만 보기", 칸반보드의 특정 상태 컬럼만 보기).
export async function GET(req: Request) {
  try {
    // 백그라운드 스케줄러가 없어 지연 업무 감지를 이 요청에 얹어서 돈다 — 응답을 늦추면 안 되므로
    // 기다리지 않고(fire-and-forget) 실패해도 무시한다(목록 조회 자체를 막을 이유는 아니다).
    checkAndNotifyOverdueTasks().catch(err => console.error("Overdue check failed:", err));

    const { searchParams } = new URL(req.url);
    const assigneeId = searchParams.get('assigneeId');

    const status = searchParams.get('status');

    // 전달된 파라미터만 where 절에 추가 — 둘 다 없으면 where가 빈 객체가 되므로
    // 아래에서 undefined로 바꿔 Prisma가 조건 없이 전체를 조회하게 한다.
    const where: any = {};
    if (assigneeId) where.assigneeId = assigneeId;
    if (status) where.status = status;

    const tasks = await prisma.task.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      // 화면(담당자 이름/이메일, 프로젝트명)에 바로 쓸 수 있도록 연관 데이터를 함께 가져온다.
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

// 새 업무를 최소 정보로 생성한다. description/assigneeId/difficulty/wbsStart/wbsEnd는
// 요청 바디에서 구조분해만 될 뿐 실제로는 저장되지 않는다 — 상세 정보는
// 생성 후 tasks/[id] PATCH로 채워 넣는 흐름(난이도는 일단 "보통"으로 고정, 진행률 0에서 시작).
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
// 상태값만 바꾸는 범용 엔드포인트 — 배분승인(approve)/반려(reject)처럼 파이프라인 규칙을
// 강제하지 않으므로, 아무 상태로나 자유롭게 옮길 수 있는 관리자용/드래그앤드롭용 경로다.
// 이 화이트리스트는 tasks/[id]/route.ts의 VALID_TASK_STATUSES와 항상 같게 유지해야 한다.
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

    // DONE으로 갈 때만 완료 시각을 기록하고, 그 외 모든 상태로는 completedAt을 비운다 —
    // 완료 취소 후 다시 옮기더라도 예전 완료 시각이 남아있지 않도록 하기 위함.
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
