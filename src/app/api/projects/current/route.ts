import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAndNotifyOverdueTasks } from "@/lib/overdueCheck";
import { requireAuth } from "@/lib/requireAuth";

// 이 앱은 "프로젝트가 항상 1개"라는 단일 프로젝트 전제로 동작해서, 여러 화면(문서생성/히스토리/
// 설정 등)이 매번 "목록 조회 → 첫 번째 id로 상세 조회" 2단계를 거쳤다. 원격 Postgres(Neon)라
// 라운드트립 하나하나가 체감 지연으로 이어져서, 그 2번의 요청을 이 라우트 하나로 합친다 —
// /api/projects/[id] GET과 정확히 같은 select 모양을 최신 프로젝트 1개에 바로 적용한 것.
export async function GET() {
  try {
    const { error: authError } = await requireAuth();
    if (authError) return authError;

    // 대시보드가 가장 자주 열리는 첫 화면이라, 여기서도 지연 업무 감지를 얹는다(자세한 이유는
    // /api/tasks GET의 동일 호출 참고 — 백그라운드 스케줄러가 없어 조회 요청에 편승시키는 구조).
    checkAndNotifyOverdueTasks().catch(err => console.error("Overdue check failed:", err));

    const project = await prisma.project.findFirst({
      orderBy: { createdAt: "desc" },
      include: {
        tasks: {
          include: {
            assignee: { select: { id: true, name: true, email: true } }
          },
          orderBy: { createdAt: "desc" }
        },
        documents: {
          // 검토요청/승인/반려처럼 방금 액션이 있었던 문서가 항상 목록 맨 위로 오도록 생성일이 아닌
          // 최근 수정일 기준으로 정렬한다(ProjectDocument.updatedAt은 @updatedAt이라 상태 변경마다 갱신됨).
          orderBy: { updatedAt: "desc" },
          // 화면에 "작성자: 이름" 배지를 보여주기 위함(PM이 남의 회의록을 대신 생성하면 안 되는
          // 규칙을 사람이 눈으로도 바로 확인할 수 있어야 한다는 피드백으로 추가).
          include: { author: { select: { id: true, name: true, email: true } } },
        },
        assigneeRecommendations: {
          orderBy: { createdAt: "desc" }
        },
      }
    });

    return NextResponse.json({ success: true, data: project });
  } catch (error: any) {
    console.error("Current project fetch error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch project" }, { status: 500 });
  }
}
