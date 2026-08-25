import { prisma } from "@/lib/prisma";
import { notifyUser, notifyAllPMs } from "@/lib/notify";

// 배경 스케줄러(cron)가 없는 앱이라 "자동 감지"를 진짜 백그라운드 잡으로 돌릴 수 없다 —
// 대신 업무 목록을 조회하는 API가 호출될 때마다(가장 자주 열리는 화면이 곧 감지 주기가 된다)
// 이번에 새로 마감일을 넘긴 업무가 있는지 훑어서 알림을 보낸다.
// overdueNotifiedAt으로 한 번 보낸 업무는 다시 훑지 않게 막아, 매 조회마다 재알림하지 않는다.
// 실패해도 원래 요청(업무 목록 조회 등)을 막을 이유가 없으므로 항상 fire-and-forget으로 호출한다.
//
// SELECT로 대상을 찾은 뒤 따로 UPDATE로 표시하면, 이 함수가 짧은 간격으로 여러 번 동시에
// 호출됐을 때(예: 대시보드+업무관리 페이지를 거의 동시에 열었을 때) 둘 다 "아직 안 보냄" 상태를
// 보고 같은 업무에 대해 중복 알림을 보낼 수 있다(실제로 테스트 중 재현됨). UPDATE ... WHERE
// overdueNotifiedAt IS NULL ... RETURNING으로 "아직 안 보낸 업무만" 한 SQL문에서 원자적으로
// 선점해 이 경쟁 상태를 없앤다.
// date_trunc('day', now())와 비교하는 이유는 taskOverdue.ts의 isTaskOverdue와 같다 — wbsEnd가
// "그날 00:00 UTC"로 저장돼 있어서 그냥 now()와 비교하면 마감일 당일 자정이 지나자마자
// 지연으로 잘못 판정된다. 마감일 당일은 통째로 인정하고 다음날 UTC 자정부터만 지연으로 본다.
export async function checkAndNotifyOverdueTasks() {
  const claimed = await prisma.$queryRaw<Array<{
    id: string; title: string; wbsEnd: Date; assigneeId: string | null;
  }>>`
    UPDATE "Task"
    SET "overdueNotifiedAt" = now()
    WHERE "overdueNotifiedAt" IS NULL
      AND "wbsEnd" < date_trunc('day', now())
      AND "status" IN ('BACKLOG', 'PENDING_APPROVAL', 'IN_PROGRESS')
    RETURNING id, title, "wbsEnd", "assigneeId"
  `;
  if (claimed.length === 0) return;

  // RETURNING에는 담당자 이름까지 못 담기 때문에(users 테이블 조인 아님) 필요한 만큼만 별도 조회.
  const assigneeIds = claimed.map((t) => t.assigneeId).filter((id): id is string => !!id);
  const assignees = assigneeIds.length > 0
    ? await prisma.user.findMany({ where: { id: { in: assigneeIds } }, select: { id: true, name: true } })
    : [];
  const nameById = new Map(assignees.map((a) => [a.id, a.name]));

  for (const task of claimed) {
    const dateLabel = new Date(task.wbsEnd).toLocaleDateString("ko-KR");
    if (task.assigneeId) {
      await notifyUser(task.assigneeId, `"${task.title}" 업무가 마감일(${dateLabel})을 지났습니다.`, { type: "warning", link: "/tasks" });
    }
    const assigneeName = task.assigneeId ? nameById.get(task.assigneeId) ?? "알 수 없음" : "미배정";
    await notifyAllPMs(`"${task.title}" 업무가 지연되었습니다 (담당: ${assigneeName}, 마감 ${dateLabel}).`, { type: "warning", link: "/tasks" });
  }
}
