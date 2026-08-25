import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import OpenAI from "openai";

const toList = (s: string | null) => (s ? s.split(",").map(v => v.trim()).filter(Boolean) : []);

// FR-05-016 / FR-05-017: 기술스택 · 현재 업무량 · 유사 업무 경험 · 난이도를 근거로 담당자를 추천하고,
// 추천마다 기술 적합도 / 업무 여유도 / 유사 업무 경험 근거를 함께 제공한다.
// 문서 단위로 한 번에 배정하는 assign-tasks와 달리 이 라우트는 업무 1건만 대상으로 한다 —
// 칸반 보드에서 담당자를 드래그로 배정할 때 쓰이며, 단건이라 배치 컨텍스트가 없으므로
// WBS 날짜는 계산하지 않고 후보 추천(최대 3명)까지만 반환한다.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 모듈 스코프에서 만들면 빌드 시점 페이지 데이터 수집 단계에 환경변수가 없을 때 빌드가 깨진다
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const { id } = await params;

    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) {
      return NextResponse.json({ error: "업무를 찾을 수 없습니다." }, { status: 404 });
    }

    // PM은 업무를 배정받는 대상이 아니라 배분을 승인하는 역할이므로 후보에서 제외한다.
    // 아직 온보딩(첫 로그인)을 안 마친 계정은 name이 빈 문자열이라 후보로 추천해도 이름 없는
    // 사람으로 뜨고 실제로 일을 시작할 수도 없으므로 같이 제외한다.
    const membersRaw = await prisma.user.findMany({
      where: { status: "ACTIVE", role: "EMPLOYEE" },
      select: { id: true, name: true, techStack: true, certifications: true, pastProjects: true, department: true, jobTitle: true },
    });
    const members = membersRaw.filter(m => m.name?.trim());

    // 현재 업무량: 진행 중 + 배분승인대기 상태의 업무 수 (FR-05-016 "현재 업무량")
    // projectId로 좁힌다 — 안 그러면 다른 프로젝트의 업무량까지 섞여서 "이 프로젝트 기준 여유도"가 아니게 된다
    const activeCounts = await prisma.task.groupBy({
      by: ["assigneeId"],
      _count: { assigneeId: true },
      where: { projectId: task.projectId, assigneeId: { not: null }, status: { in: ["IN_PROGRESS", "PENDING_APPROVAL"] } },
    });
    const workloadMap: Record<string, number> = {};
    activeCounts.forEach(c => { if (c.assigneeId) workloadMap[c.assigneeId] = c._count.assigneeId; });

    const candidates = members
      .filter(m => m.id !== task.assigneeId) // 이미 이 업무를 맡고 있는 사람은 재추천할 필요가 없으므로 제외
      .map((m, index) => ({
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
      return NextResponse.json({ recommendations: [] });
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      temperature: 0.0,
      messages: [
        {
          role: "system",
          content:
            "당신은 팀의 업무 배분을 돕는 어시스턴트입니다. 주어진 업무와 후보자 목록(JSON)만 근거로 " +
            "가장 적합한 담당자 최대 3명을 추천합니다.\n\n" +
            "[절대 규칙] 후보자 목록에 없는 사람을 추천하거나, 후보자 데이터에 없는 기술/경력을 지어내지 마라. " +
            "제공된 techStack/certifications/pastProjects/currentActiveTasks만 근거로 판단하라. " +
            "각 후보는 반드시 candidateIndex(정수, 후보자 목록의 index 값)로만 지칭하라 — 이름이나 userId 문자열을 쓰지 마라.\n\n" +
            "평가 기준: (1) 기술 적합도 — techStack이 업무 내용과 얼마나 맞는지, " +
            "(2) 업무 여유도 — currentActiveTasks가 낮을수록 여유 있음, " +
            "(3) 유사 업무 경험 — pastProjects 중 이 업무와 유사한 것이 있는지.\n\n" +
            "다음 JSON 스키마로만 응답하라 (다른 텍스트 금지):\n" +
            `{"recommendations": [{"candidateIndex": 0, "fitScore": 0-100, "techFit": "기술 적합도 근거 한 문장", "workloadFit": "업무 여유도 근거 한 문장", "experienceFit": "유사 업무 경험 근거 한 문장(없으면 '유사 경험 없음')"}]}\n` +
            "후보자가 1명 이상 있다면 반드시 최소 1명 이상 추천하라 — 완벽히 들어맞지 않아도 '후보 중 상대적으로 가장 근접한 사람'을 fitScore를 낮게 매겨서라도 포함한다. " +
            "정말 근거가 전무한 경우에만(예: techStack이 완전히 무관하고 pastProjects도 없음) 해당 후보를 제외하라. fitScore 높은 순으로 정렬한다."
        },
        {
          role: "user",
          content: JSON.stringify({
            task: { title: task.title, description: task.description, difficulty: task.difficulty },
            candidates: candidates.map(({ userId, ...rest }) => rest), // UUID는 굳이 노출하지 않음 — index로만 참조
          }),
        },
      ],
    });

    const parsed = JSON.parse(completion.choices[0].message.content || "{}");
    const recs = (parsed.recommendations || []) as Array<{ candidateIndex: number; fitScore: number; techFit: string; workloadFit: string; experienceFit: string }>;

    const byIndex: Record<number, typeof candidates[number]> = {};
    candidates.forEach(c => { byIndex[c.index] = c; });
    const recommendations = recs
      .filter(r => byIndex[r.candidateIndex]) // AI가 존재하지 않는 index를 잘못 반환한 경우 방어적으로 걸러낸다
      .map(r => {
        const c = byIndex[r.candidateIndex];
        return { userId: c.userId, name: c.name, currentActiveTasks: c.currentActiveTasks, fitScore: r.fitScore, techFit: r.techFit, workloadFit: r.workloadFit, experienceFit: r.experienceFit };
      });

    // PM이 이 추천을 실제로 채택했는지와 무관하게, 이 시점에 AI가 제시한 후보 전체를 이력으로
    // 남긴다 — Task.assignmentReason은 "확정된" 근거만 남기 때문에 채택 안 된 후보는 여기 없으면 사라진다.
    // 로그 저장 실패가 추천 기능 자체를 막을 이유는 없으므로 응답과 별개로 처리하고 실패해도 무시한다.
    if (recommendations.length > 0) {
      prisma.assigneeRecommendation.create({
        data: { taskId: id, projectId: task.projectId, candidateData: JSON.stringify(recommendations) },
      }).catch(err => console.error("Recommendation log save failed:", err));
    }

    return NextResponse.json({ recommendations });
  } catch (error: any) {
    console.error("Assignee recommendation error:", error);
    return NextResponse.json({ error: "추천 생성 실패: " + error.message }, { status: 500 });
  }
}
