import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import OpenAI from "openai";
import { parseAgentConfig } from "@/lib/agentConfig";
import { requirePM } from "@/lib/requireAuth";

// FR-05-014/015: 승인된 요구사항정의서를 기반으로 3~7개의 업무를 자동 생성한다.
// 각 업무는 업무명/설명/예상 소요시간을 갖는다.
export async function POST(
  request: NextRequest,
  props: { params: Promise<{ id: string; docId: string }> }
) {
  try {
    // 업무분배 탭의 "업무 배분 시작"(runAssign) 흐름 안에서만 호출되는, PM 전용 액션이다.
    const { error: authError } = await requirePM();
    if (authError) return authError;

    // 모듈 스코프에서 만들면 빌드 시점 페이지 데이터 수집 단계에 환경변수가 없을 때 빌드가 깨진다
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const params = await props.params;

    const doc = await prisma.projectDocument.findUnique({ where: { id: params.docId } });
    if (!doc || !doc.reqSpecContent) {
      return NextResponse.json({ error: "요구사항정의서가 없습니다." }, { status: 400 });
    }
    if (doc.reqSpecStatus !== "APPROVED") {
      return NextResponse.json({ error: "요구사항정의서가 승인된 이후에 업무를 생성할 수 있습니다." }, { status: 400 });
    }

    const project = await prisma.project.findUnique({ where: { id: params.id }, select: { agentConfig: true } });
    const { taskAssign } = parseAgentConfig(project?.agentConfig);

    // 승인 전 초안 상태의 요구사항으로 업무를 만들면 이후 요구사항이 바뀔 때마다
    // 이미 만든 업무들이 전부 어긋나므로, 승인된 확정 문서에서만 업무를 생성하도록 막는다.
    // temperature/업무 개수 범위는 /settings의 "업무 배분 에이전트" 설정을 따른다(기본값은 기존과 동일).
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      temperature: taskAssign.temperature,
      messages: [
        {
          role: "system",
          content:
            "당신은 요구사항정의서를 실행 가능한 업무(Task) 단위로 분해하는 어시스턴트입니다.\n\n" +
            `[절대 규칙] 요구사항정의서에 없는 기능을 지어내지 마라. ${taskAssign.minTasks}개 이상 ${taskAssign.maxTasks}개 이하의 업무로 나눈다.\n\n` +
            "다음 JSON 스키마로만 응답하라 (다른 텍스트 금지):\n" +
            `{"tasks": [{"title": "업무명", "description": "상세 설명", "estimatedHours": 숫자(시간 단위)}]}`
        },
        { role: "user", content: doc.reqSpecContent }
      ],
    });

    const parsed = JSON.parse(completion.choices[0].message.content || "{}");
    const tasksData: any[] = Array.isArray(parsed.tasks) ? parsed.tasks : [];

    if (tasksData.length === 0) {
      return NextResponse.json({ error: "AI가 업무를 생성하지 못했습니다." }, { status: 500 });
    }

    // 반려→직접수정→재승인 흐름 후 이 라우트가 다시 호출되면(이전엔 체크가 없어 중복 생성됐음),
    // 같은 문서에서 이미 뽑아둔 업무가 있을 수 있다. 아직 아무도 손대지 않은(BACKLOG) 업무는
    // 낡은 요구사항 기준이므로 새 세트로 교체하고, 이미 배정·진행됐거나 완료된 업무는 그 진행
    // 상황을 잃으면 안 되므로 건드리지 않고 응답에 담아 화면에서 경고할 수 있게 한다.
    const existingTasks = await prisma.task.findMany({ where: { sourceDocumentId: params.docId } });
    const staleTasks = existingTasks.filter((t) => t.status !== "BACKLOG");
    const replacedTaskIds = existingTasks.filter((t) => t.status === "BACKLOG").map((t) => t.id);
    if (replacedTaskIds.length > 0) {
      await prisma.task.deleteMany({ where: { id: { in: replacedTaskIds } } });
    }

    const createdTasks = await Promise.all(
      tasksData.map((task) =>
        prisma.task.create({
          data: {
            title: task.title || "제목 없음",
            description: task.description || "",
            status: "BACKLOG", // 생성 직후에는 아직 담당자가 없으므로 백로그 상태로 시작
            estimatedHours: typeof task.estimatedHours === "number" ? task.estimatedHours : null,
            progress: 0,
            projectId: params.id,
            // 이 문서에서 나온 업무임을 표시 — assign-tasks 라우트가 이 값으로
            // "이 문서에서 나왔지만 아직 담당자가 없는 업무"를 한 번에 찾아 배치 배정한다.
            sourceDocumentId: params.docId,
          },
        })
      )
    );

    return NextResponse.json({
      success: true,
      count: createdTasks.length,
      tasks: createdTasks,
      replacedCount: replacedTaskIds.length,
      staleTasks: staleTasks.map((t) => ({ id: t.id, title: t.title, status: t.status })),
    });
  } catch (error: any) {
    console.error("Task Extraction Error:", error);
    return NextResponse.json({ error: "업무 생성 실패: " + error.message }, { status: 500 });
  }
}
