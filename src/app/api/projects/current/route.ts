import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAndNotifyOverdueTasks } from "@/lib/overdueCheck";

// 이 앱은 "프로젝트가 항상 1개"라는 단일 프로젝트 전제로 동작해서, 여러 화면(문서생성/히스토리/
// 설정 등)이 매번 "목록 조회 → 첫 번째 id로 상세 조회" 2단계를 거쳤다. 원격 Postgres(Neon)라
// 라운드트립 하나하나가 체감 지연으로 이어져서, 그 2번의 요청을 이 라우트 하나로 합친다 —
// /api/projects/[id] GET과 정확히 같은 select 모양을 최신 프로젝트 1개에 바로 적용한 것.
export async function GET() {
  try {
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
          orderBy: { createdAt: "desc" }
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
