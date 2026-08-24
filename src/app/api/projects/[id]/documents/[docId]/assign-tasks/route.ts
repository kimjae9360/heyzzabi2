import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import OpenAI from "openai";

const toList = (s: string | null) => (s ? s.split(",").map(v => v.trim()).filter(Boolean) : []);

// 업무 하나씩이 아니라 이 문서에서 나온 업무 전체를 한 번에 보고 배정을 추천한다 —
// 그래야 한 사람에게 몰리지 않게 배치 전체를 보고 워크로드를 분산시킬 수 있다.
// 날짜(WBS)는 AI가 지어내면 신뢰도가 떨어지므로 코드에서 결정적으로 계산한다(NO_HALLUCINATION_RULE과 같은 맥락).
// 이 라우트는 추천만 반환하고 저장하지 않는다 — PM이 업무분배 탭에서 검토/조정 후 확정(PATCH)해야 반영된다.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  try {
    // 모듈 스코프에서 만들면 빌드 시점 페이지 데이터 수집 단계에 환경변수가 없을 때 빌드가 깨진다
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const { docId } = await params;

    const tasks = await prisma.task.findMany({
      where: { sourceDocumentId: docId, assigneeId: null },
      orderBy: { createdAt: "asc" },
    });
    if (tasks.length === 0) {
      return NextResponse.json({ error: "배정할 업무가 없습니다." }, { status: 400 });
    }

    // PM은 업무를 배정받는 대상이 아니라 배분을 승인하는 역할이므로 후보에서 제외한다
    // (업무분배 탭의 담당자 재배정 드롭다운도 EMPLOYEE만 보여준다 — 후보 풀을 맞추지 않으면
    // AI가 PM을 추천했을 때 그 드롭다운에 없는 값이 선택된 것처럼 보이는 문제가 생긴다)
    const members = await prisma.user.findMany({
      where: { status: "ACTIVE", role: "EMPLOYEE" },
      select: { id: true, name: true, techStack: true, certifications: true, pastProjects: true, department: true, jobTitle: true },
    });
    const activeCounts = await prisma.task.groupBy({
      by: ["assigneeId"],
      _count: { assigneeId: true },
      where: { assigneeId: { not: null }, status: { in: ["IN_PROGRESS", "PENDING_APPROVAL"] } },
    });
    const workloadMap: Record<string, number> = {};
    activeCounts.forEach(c => { if (c.assigneeId) workloadMap[c.assigneeId] = c._count.assigneeId; });

    const candidates = members.map((m, index) => ({
      index,
      userId: m.id,
      name: m.name,
      department: m.department,
      jobTitle: m.jobTitle,
      techStack: toList(m.techStack),
      certifications: toList(m.certifications),
      pastProjects: toList(m.pastProjects),
      currentActiveTasks: workloadMap[m.id] ?? 0,
    }));

    if (candidates.length === 0) {
      return NextResponse.json({ error: "배정 가능한 팀원이 없습니다." }, { status: 400 });
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      temperature: 0.0,
      messages: [
        {
          role: "system",
          content:
            "당신은 팀의 업무 배분을 돕는 어시스턴트입니다. 주어진 업무 목록과 후보자 목록(JSON)만 근거로 " +
            "각 업무에 가장 적합한 담당자 1명씩을 추천합니다.\n\n" +
            "[절대 규칙] 후보자 목록에 없는 사람을 추천하거나, 후보자 데이터에 없는 기술/경력을 지어내지 마라. " +
            "제공된 techStack/certifications/pastProjects/currentActiveTasks만 근거로 판단하라. " +
            "각 후보는 반드시 candidateIndex(정수, 후보자 목록의 index 값)로만 지칭하라 — 이름이나 userId 문자열을 쓰지 마라.\n\n" +
            "평가 기준: (1) 기술 적합도 — techStack이 업무 내용과 얼마나 맞는지, " +
            "(2) 업무 여유도 — currentActiveTasks가 낮을수록, 그리고 이번 배치에서 이미 이 사람에게 배정한 업무 수가 적을수록 여유 있음, " +
            "(3) 유사 업무 경험 — pastProjects 중 이 업무와 유사한 것이 있는지.\n" +
            "업무 목록 전체를 한 번에 보고 판단하므로, 같은 사람에게 몰아주지 말고 적합도가 비슷하다면 " +
            "후보 간에 업무량을 분산시켜라(단, 기술 적합도가 명백히 낮은 사람에게 억지로 분산시키지는 마라).\n\n" +
            "다음 JSON 스키마로만 응답하라 (다른 텍스트 금지):\n" +
            `{"assignments": [{"taskIndex": 0, "candidateIndex": 0, "fitScore": 0-100, "techFit": "기술 적합도 근거 한 문장", "workloadFit": "업무 여유도 근거 한 문장", "experienceFit": "유사 업무 경험 근거 한 문장(없으면 '유사 경험 없음')"}]}\n` +
            "모든 업무(taskIndex)에 대해 반드시 1건씩 추천하라 — 완벽히 들어맞지 않아도 상대적으로 가장 근접한 후보를 fitScore를 낮게 매겨서라도 포함한다."
        },
        {
          role: "user",
          content: JSON.stringify({
            tasks: tasks.map((t, taskIndex) => ({ taskIndex, title: t.title, description: t.description, difficulty: t.difficulty })),
            candidates: candidates.map(({ userId, ...rest }) => rest),
          }),
        },
      ],
    });

    const parsed = JSON.parse(completion.choices[0].message.content || "{}");
    const assignments = (parsed.assignments || []) as Array<{ taskIndex: number; candidateIndex: number; fitScore: number; techFit: string; workloadFit: string; experienceFit: string }>;

    const byCandidateIndex: Record<number, typeof candidates[number]> = {};
    candidates.forEach(c => { byCandidateIndex[c.index] = c; });

    // WBS 일정: 결정적으로 계산 — 담당자별로 이번 배치에서 받은 업무를 순서대로 쌓고,
    // estimatedHours(없으면 8시간=1일 가정)를 하루 8시간 기준 영업일수로 환산해 배치한다.
    // 날짜만 의미가 있으므로 toISOString()(UTC 기준)을 쓰면 서버 타임존에 따라 하루가 밀릴 수 있다 —
    // 항상 로컬 달력 기준 yyyy-mm-dd로 직접 포맷한다.
    const toDateStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const nextBusinessDay = (d: Date) => {
      const next = new Date(d);
      next.setDate(next.getDate() + 1);
      while (next.getDay() === 0 || next.getDay() === 6) next.setDate(next.getDate() + 1);
      return next;
    };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    while (today.getDay() === 0 || today.getDay() === 6) today.setDate(today.getDate() + 1);

    // 이 배치만 보고 오늘부터 다시 쌓으면, 이미 확정된 다른 업무와 일정이 겹칠 수 있다 —
    // 담당자별로 이미 배정된(진행중/배분승인대기) 업무의 가장 늦은 종료일 다음부터 이어서 쌓는다
    const existingSchedule = await prisma.task.groupBy({
      by: ["assigneeId"],
      _max: { wbsEnd: true },
      where: { assigneeId: { not: null }, wbsEnd: { not: null }, status: { in: ["IN_PROGRESS", "PENDING_APPROVAL"] } },
    });
    const cursorByAssignee: Record<string, Date> = {};
    existingSchedule.forEach(s => {
      if (s.assigneeId && s._max.wbsEnd && s._max.wbsEnd >= today) {
        cursorByAssignee[s.assigneeId] = nextBusinessDay(s._max.wbsEnd);
      }
    });

    const suggestions = tasks.map((task, taskIndex) => {
      const a = assignments.find(x => x.taskIndex === taskIndex);
      const candidate = a ? byCandidateIndex[a.candidateIndex] : undefined;
      if (!a || !candidate) {
        return { taskId: task.id, title: task.title, difficulty: task.difficulty, estimatedHours: task.estimatedHours, suggestedAssigneeId: null, fitScore: null, techFit: null, workloadFit: null, experienceFit: null, suggestedWbsStart: null, suggestedWbsEnd: null };
      }
      const days = Math.max(1, Math.ceil((task.estimatedHours ?? 8) / 8));
      const start = cursorByAssignee[candidate.userId] ?? today;
      const end = new Date(start);
      for (let i = 1; i < days; i++) {
        let d = new Date(end);
        do { d.setDate(d.getDate() + 1); } while (d.getDay() === 0 || d.getDay() === 6);
        end.setTime(d.getTime());
      }
      cursorByAssignee[candidate.userId] = nextBusinessDay(end);

      return {
        taskId: task.id,
        title: task.title,
        difficulty: task.difficulty,
        estimatedHours: task.estimatedHours,
        suggestedAssigneeId: candidate.userId,
        suggestedAssigneeName: candidate.name,
        fitScore: a.fitScore,
        techFit: a.techFit,
        workloadFit: a.workloadFit,
        experienceFit: a.experienceFit,
        suggestedWbsStart: toDateStr(start),
        suggestedWbsEnd: toDateStr(end),
      };
    });

    return NextResponse.json({ suggestions, candidates: candidates.map(({ index, ...c }) => c) });
  } catch (error: any) {
    console.error("Batch assignment error:", error);
    return NextResponse.json({ error: "배정 추천 생성 실패: " + error.message }, { status: 500 });
  }
}
