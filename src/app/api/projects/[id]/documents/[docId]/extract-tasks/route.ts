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
    // 2026-08-30: 기획서/요구사항정의서 프롬프트에 비해 이 프롬프트가 유독 얕아("절대 규칙 한 줄 +
    // 개수 제한"뿐) 업무 설명/시간 산정 품질이 떨어진다는 피드백으로 필드별 작성 원칙을 추가하고,
    // 상위 모델로 올렸다. difficulty/difficultyReason도 Task 스키마엔 이미 있었지만 이 라우트가
    // 채운 적이 없어 항상 기본값(MEDIUM)이었다 — 실제로 채우도록 스키마·프롬프트에 추가한다.
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      temperature: taskAssign.temperature,
      messages: [
        {
          role: "system",
          content:
            "당신은 10년차 개발 리드입니다. 승인된 요구사항정의서(JSON, 표 형태)를 근거로, 개발자가 바로 " +
            "착수할 수 있는 실행 단위 업무(Task)로 분해합니다.\n\n" +
            "[절대 규칙] 요구사항정의서에 명시되지 않은 기능·기술스택·수치는 절대 추가하거나 지어내지 마라. " +
            "요구사항정의서에서 확인할 수 없는 항목은 비워두거나 생략하라.\n\n" +
            "[작성 원칙 — 반드시 지켜라]\n" +
            `1) 요구사항정의서의 각 행(항목)을 근거로 ${taskAssign.minTasks}개 이상 ${taskAssign.maxTasks}개 이하의 업무로 나눠라. ` +
            "우선순위(priority)가 '상'인 항목은 절대 누락하지 말고, 서로 강하게 연관된 항목(같은 category/relatedFeature)은 " +
            "하나의 업무로 묶어도 되지만, 성격이 다른 작업(예: 화면 UI 구현과 백엔드 API 개발)은 분리하라.\n" +
            "2) title(업무명): 무엇을 만드는지 한눈에 알 수 있게 구체적으로 써라 — '로그인 기능 개발' 같은 " +
            "뭉뚱그린 제목 대신 '카카오 소셜 로그인 API 연동'처럼 요구사항정의서의 실제 명칭을 반영하라.\n" +
            "3) description(상세 설명): 요구사항정의서의 description/inputOutput/acceptanceCriteria를 근거로, " +
            "이 업무를 맡은 개발자가 무엇을 구현해야 하는지 최소 2문장 이상으로 구체적으로 서술하라. " +
            "요구사항정의서에 없는 구체적 기술스택·API명을 사실처럼 지어내지 마라.\n" +
            "4) estimatedHours(예상 소요시간): 업무의 범위(단순 CRUD인지, 외부 연동이 필요한지, UI가 복잡한지)를 " +
            "고려해 현실적인 시간(숫자, 8의 배수를 강제하지 않음)을 추정하라. 근거 없이 관행적으로 8시간을 " +
            "반복하지 마라 — 업무마다 실제 난이도 차이를 반영하라.\n" +
            "5) difficulty(난이도)는 'HIGH'/'MEDIUM'/'LOW' 중 정확히 하나. 외부 시스템 연동, 복잡한 상태 관리, " +
            "모호하거나 예외 케이스가 많은 요구사항은 'HIGH', 단순 CRUD·기존 패턴을 따르는 화면은 'LOW', " +
            "나머지는 'MEDIUM'으로 판단하라. difficultyReason에는 왜 그렇게 판단했는지 요구사항정의서 내용에 " +
            "근거해 한 문장으로 적어라(예: '카카오/구글/네이버 3개사 외부 API 연동과 계정 자동 매핑 로직이 필요해 HIGH').\n\n" +
            "다음 JSON 스키마로만 응답하라 (다른 텍스트/마크다운/코드블록 금지):\n" +
            `{"tasks": [{"title": "업무명", "description": "구체적인 상세 설명(2문장 이상)", "estimatedHours": 숫자, "difficulty": "HIGH|MEDIUM|LOW", "difficultyReason": "판단 근거 한 문장"}]}`
        },
        { role: "user", content: doc.reqSpecContent }
      ],
    });

    const parsed = JSON.parse(completion.choices[0].message.content || "{}");
    const VALID_DIFFICULTY = ["HIGH", "MEDIUM", "LOW"];
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
            difficulty: VALID_DIFFICULTY.includes(task.difficulty) ? task.difficulty : "MEDIUM",
            difficultyReason: typeof task.difficultyReason === "string" ? task.difficultyReason : null,
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
