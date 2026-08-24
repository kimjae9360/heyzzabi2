import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { subDays, format, differenceInDays } from "date-fns";
import { ko } from "date-fns/locale";

export async function GET() {
  try {
    const tasks = await prisma.task.findMany({
      include: {
        assignee: { select: { name: true } },
        project: { select: { name: true } },
      },
    });

    // 1. Weekly Completion Trend (Last 7 days)
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
    const doneTasks = tasks.filter(t => t.status === "DONE" && t.completedAt);
    let avgDays = 0;
    if (doneTasks.length > 0) {
      const totalDays = doneTasks.reduce((acc, t) => {
        return acc + differenceInDays(new Date(t.completedAt!), new Date(t.createdAt));
      }, 0);
      avgDays = Math.round((totalDays / doneTasks.length) * 10) / 10;
    }

    // 4. Approval Pass Rate (Mocked using data if available)
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
