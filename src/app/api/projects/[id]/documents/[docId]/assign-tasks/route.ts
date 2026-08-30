import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePM } from "@/lib/requireAuth";
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
    // AI 배분 추천 생성은 업무분배 탭에서 PM에게만 노출되는 액션이다 — 가드가 없으면
    // 일반유저가 API를 직접 호출해도 막을 방법이 없었다.
    const { error: authError } = await requirePM();
    if (authError) return authError;

    // 모듈 스코프에서 만들면 빌드 시점 페이지 데이터 수집 단계에 환경변수가 없을 때 빌드가 깨진다
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const { id: projectId, docId } = await params;

    const doc = await prisma.projectDocument.findUnique({ where: { id: docId }, select: { proposalContent: true } });

    const tasks = await prisma.task.findMany({
      where: { sourceDocumentId: docId, assigneeId: null },
      orderBy: { createdAt: "asc" },
    });
    if (tasks.length === 0) {
      return NextResponse.json({ error: "배정할 업무가 없습니다." }, { status: 400 });
    }

    // PM은 업무를 배정받는 대상이 아니라 배분을 승인하는 역할이므로 후보에서 제외한다
    // (업무분배 탭의 담당자 재배정 드롭다운도 EMPLOYEE만 보여준다 — 후보 풀을 맞추지 않으면
    // AI가 PM을 추천했을 때 그 드롭다운에 없는 값이 선택된 것처럼 보이는 문제가 생긴다).
    // 아직 온보딩 전이라 이름이 비어있는 계정도 제외한다(이름 없는 후보로 추천되면 UI에서 빈 옵션이 된다).
    const membersRaw = await prisma.user.findMany({
      where: { status: "ACTIVE", role: "EMPLOYEE" },
      select: { id: true, name: true, techStack: true, certifications: true, pastProjects: true, department: true, jobTitle: true },
    });
    const members = membersRaw.filter(m => m.name?.trim());
    // 현재 업무량: 진행 중 + 배분승인대기 상태의 업무 수를 담당자별로 집계해서
    // AI 프롬프트의 "업무 여유도" 판단 근거(currentActiveTasks)로 넘긴다.
    // projectId로 반드시 좁혀야 한다 — 안 그러면 다른 프로젝트의 업무량까지 섞여서
    // "이 프로젝트에서 여유 있는 사람"이 아니라 "전체적으로 바쁜 사람"을 기준으로 배정하게 된다.
    const activeCounts = await prisma.task.groupBy({
      by: ["assigneeId"],
      _count: { assigneeId: true },
      where: { projectId, assigneeId: { not: null }, status: { in: ["IN_PROGRESS", "PENDING_APPROVAL"] } },
    });
    const workloadMap: Record<string, number> = {};
    activeCounts.forEach(c => { if (c.assigneeId) workloadMap[c.assigneeId] = c._count.assigneeId; });

    const candidates = members.map((m, index) => ({
      index, // LLM이 UUID를 그대로 못 옮겨적는 경우가 많아 인덱스로 참조시킨다
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
      model: "gpt-4o",
      response_format: { type: "json_object" },
      temperature: 0.0, // 배치를 재실행해도 같은 입력이면 같은 배정이 나오도록 결정성을 최대화
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
            tasks: tasks.map((t, taskIndex) => ({ taskIndex, title: t.title, description: t.description })),
            candidates: candidates.map(({ userId, ...rest }) => rest), // UUID는 굳이 노출하지 않음 — index로만 참조
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
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    while (now.getDay() === 0 || now.getDay() === 6) now.setDate(now.getDate() + 1);

    // 기획서 원본에 명시된 프로젝트 시작일이 있고 아직 안 지났으면 그날부터 잡는다(오늘이 아니라).
    // 이미 지난 날짜라면(예: 프로젝트 기간이 이미 시작됨) 오늘부터 — 과거로 스케줄링하지 않는다.
    let today = now;
    try {
      const proposal = doc?.proposalContent ? JSON.parse(doc.proposalContent) : null;
      const specifiedStart: string | undefined = proposal?.projectPeriod?.start;
      if (specifiedStart) {
        const specified = new Date(specifiedStart);
        specified.setHours(0, 0, 0, 0);
        while (specified.getDay() === 0 || specified.getDay() === 6) specified.setDate(specified.getDate() + 1);
        if (specified > now) today = specified;
      }
    } catch {
      // 파싱 실패해도 오늘 날짜로 계속 진행 — 스케줄링 자체를 막을 이유는 아니다
    }

    // 이 배치만 보고 오늘부터 다시 쌓으면, 이미 확정된 다른 업무와 일정이 겹칠 수 있다 —
    // 담당자별로 이미 배정된(진행중/배분승인대기) 업무의 가장 늦은 종료일 다음부터 이어서 쌓는다.
    // 이것도 projectId로 좁혀야 한다 — 안 그러면 다른 프로젝트의 일정 때문에 이 프로젝트의
    // WBS 시작일이 엉뚱하게 밀린다(사람은 같아도 프로젝트별로 일정을 따로 잡는 게 맞다).
    const existingSchedule = await prisma.task.groupBy({
      by: ["assigneeId"],
      _max: { wbsEnd: true },
      where: { projectId, assigneeId: { not: null }, wbsEnd: { not: null }, status: { in: ["IN_PROGRESS", "PENDING_APPROVAL"] } },
    });
    const cursorByAssignee: Record<string, Date> = {};
    existingSchedule.forEach(s => {
      // 가장 늦은 종료일이 이미 오늘보다 과거라면 그 담당자는 지금 진행 중인 업무가 없다는
      // 뜻이므로 커서를 세팅하지 않는다 — 아래에서 today가 기본값으로 쓰인다.
      if (s.assigneeId && s._max.wbsEnd && s._max.wbsEnd >= today) {
        cursorByAssignee[s.assigneeId] = nextBusinessDay(s._max.wbsEnd);
      }
    });

    const suggestions = tasks.map((task, taskIndex) => {
      const a = assignments.find(x => x.taskIndex === taskIndex);
      const candidate = a ? byCandidateIndex[a.candidateIndex] : undefined;
      if (!a || !candidate) {
        // AI가 이 업무에 대해 추천을 못 준 경우(모델 응답 누락 등) — 배정 없이 그대로 반환하고
        // PM이 업무분배 탭에서 수동으로 채워 넣도록 한다.
        return { taskId: task.id, title: task.title, estimatedHours: task.estimatedHours, suggestedAssigneeId: null, fitScore: null, techFit: null, workloadFit: null, experienceFit: null, suggestedWbsStart: null, suggestedWbsEnd: null };
      }
      // 예상 소요시간을 8시간=1영업일 기준으로 올림해서 필요한 영업일수를 구한다(예: 10시간 -> 2일).
      const days = Math.max(1, Math.ceil((task.estimatedHours ?? 8) / 8));
      // 이 담당자가 이번 배치에서 이미 앞선 업무를 받았다면 그 커서(다음 시작 가능일)부터,
      // 처음 받는 것이라면 today(프로젝트 시작일 또는 오늘)부터 시작한다.
      const start = cursorByAssignee[candidate.userId] ?? today;
      const end = new Date(start);
      // start 당일이 이미 1일째이므로, 남은 (days - 1)일만큼 하루씩 전진시키되
      // 주말(토/일)은 세지 않고 건너뛰어 실제 영업일 기준으로 종료일을 맞춘다.
      for (let i = 1; i < days; i++) {
        let d = new Date(end);
        do { d.setDate(d.getDate() + 1); } while (d.getDay() === 0 || d.getDay() === 6);
        end.setTime(d.getTime());
      }
      // 이 담당자의 다음 업무는 방금 끝난 업무의 다음 영업일부터 시작하도록 커서를 갱신 —
      // 같은 배치 안에서 한 사람에게 여러 업무가 배정돼도 일정이 겹치지 않게 한다.
      cursorByAssignee[candidate.userId] = nextBusinessDay(end);

      return {
        taskId: task.id,
        title: task.title,
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

    // recommend-assignees(단건)와 같은 이유로 배치 추천도 확정 여부와 무관하게 이력을 남긴다.
    // 이 경로는 업무마다 후보 1명씩만 추천하는 구조라 candidateData도 그 1명만 담는다.
    const logRows = suggestions
      .filter(s => s.suggestedAssigneeId)
      .map(s => ({
        taskId: s.taskId,
        projectId,
        candidateData: JSON.stringify([{
          userId: s.suggestedAssigneeId, name: s.suggestedAssigneeName,
          fitScore: s.fitScore, techFit: s.techFit, workloadFit: s.workloadFit, experienceFit: s.experienceFit,
        }]),
      }));
    if (logRows.length > 0) {
      prisma.assigneeRecommendation.createMany({ data: logRows }).catch(err => console.error("Recommendation log save failed:", err));
    }

    return NextResponse.json({ suggestions, candidates: candidates.map(({ index, ...c }) => c) });
  } catch (error: any) {
    console.error("Batch assignment error:", error);
    return NextResponse.json({ error: "배정 추천 생성 실패: " + error.message }, { status: 500 });
  }
}
