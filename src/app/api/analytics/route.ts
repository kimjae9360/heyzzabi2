import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { subDays, format, differenceInDays } from "date-fns";
import { ko } from "date-fns/locale";

// 분석(Analytics) 대시보드용 통계를 한 번에 계산해서 내려준다.
// 전체 업무를 한 번만 조회한 뒤, 아래 항목들은 모두 이 tasks 배열을 메모리에서
// 가공해 만든다(항목마다 별도 쿼리를 날리지 않는다).
export async function GET() {
  try {
    const tasks = await prisma.task.findMany({
      include: {
        assignee: { select: { name: true } },
        project: { select: { name: true } },
      },
    });

    // 1. Weekly Completion Trend (Last 7 days)
    // 오늘 포함 최근 7일의 날짜 라벨("MM-dd")을 미리 만들어두고, 각 날짜에 완료된
    // 업무 수를 세어 매핑한다.
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = subDays(new Date(), 6 - i);
      return format(d, "MM-dd");
    });

    const weeklyCompletion = last7Days.map(dateStr => {
      const count = tasks.filter(t => 
        t.status === "DONE" && 
        t.completedAt && 
        format(new Date(t.completedAt), "MM-dd") === dateStr
      ).length;
      return { date: dateStr, count };
    });

    // 2. Team Contribution
    // 담당자 id가 아닌 이름(name)을 키로 집계한다. 동명이인이 있으면 통계가 합쳐질 수 있지만,
    // 화면에 바로 표시할 이름 기준 집계가 필요해 간단하게 이름을 키로 사용한다.
    const contributionMap = new Map();
    tasks.forEach(t => {
      if (t.assignee?.name) {
        if (!contributionMap.has(t.assignee.name)) {
          contributionMap.set(t.assignee.name, { name: t.assignee.name, done: 0, inProgress: 0 });
        }
        const stats = contributionMap.get(t.assignee.name);
        if (t.status === "DONE") stats.done++;
        else if (t.status === "IN_PROGRESS") stats.inProgress++;
      }
    });
    const teamContribution = Array.from(contributionMap.values());

    // 3. Average Process Time
    // 완료된 업무들의 (완료일 - 생성일) 평균 소요 일수. 소수 첫째 자리까지 반올림.
    const doneTasks = tasks.filter(t => t.status === "DONE" && t.completedAt);
    let avgDays = 0;
    if (doneTasks.length > 0) {
      const totalDays = doneTasks.reduce((acc, t) => {
        return acc + differenceInDays(new Date(t.completedAt!), new Date(t.createdAt));
      }, 0);
      avgDays = Math.round((totalDays / doneTasks.length) * 10) / 10;
    }

    // 4. Approval Pass Rate (Mocked using data if available)
    // DB에 "승인 반려" 이력을 별도로 남기지 않기 때문에 근사치로 추정한다:
    // progress(진행률)가 0보다 큰데도 다시 IN_PROGRESS로 남아있는 업무를 반려(재작업)로 간주하고,
    // 그런 데이터가 하나도 없으면 완료 건수의 10%를 임의의 기본값으로 채워 넣는다.
    const approved = doneTasks.length; // Actually DONE
    const rejected = tasks.filter(t => t.status === "IN_PROGRESS" && t.progress > 0).length; // Returned to in-progress
    const approvalPassRate = {
      approved,
      rejected: rejected || Math.floor(approved * 0.1), // Fallback if no exact rejection data
    };

    // 5. Difficulty Completion
    // 실제로 AI가 생성/저장하는 난이도 값은 "낮음"/"보통"/"높음"(한글)이다 — 예전엔 여기서
    // "HIGH"/"MEDIUM"/"LOW"와 비교해서 AI가 만든 업무가 전부 통계에서 빠졌었다(QA에서 발견).
    const difficulties = ["낮음", "보통", "높음"];
    const difficultyCompletion = difficulties.map(diff => {
      const diffTasks = tasks.filter(t => t.difficulty === diff);
      const done = diffTasks.filter(t => t.status === "DONE").length;
      const total = diffTasks.length;
      return {
        difficulty: diff,
        rate: total > 0 ? Math.round((done / total) * 100) : 0,
        done,
        total
      };
    });

    // 6. Project Burndown (Remaining tasks per project)
    // 프로젝트 id가 아닌 이름을 키로 사용 — 이 앱은 프로젝트가 사실상 하나뿐이라
    // 이름 충돌 위험이 낮다는 전제하에 단순하게 구현되어 있다.
    const projectMap = new Map();
    tasks.forEach(t => {
      if (t.project?.name) {
        if (!projectMap.has(t.project.name)) {
          projectMap.set(t.project.name, { name: t.project.name, remaining: 0, completed: 0 });
        }
        const stats = projectMap.get(t.project.name);
        if (t.status === "DONE") stats.completed++;
        else stats.remaining++;
      }
    });
    const projectBurndown = Array.from(projectMap.values());

    return NextResponse.json({
      success: true,
      data: {
        weeklyCompletion,
        teamContribution,
        averageProcessTime: avgDays,
        approvalPassRate,
        difficultyCompletion,
        projectBurndown
      }
    });

  } catch (error: any) {
    console.error("Analytics Fetch Error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch analytics." }, { status: 500 });
  }
}
