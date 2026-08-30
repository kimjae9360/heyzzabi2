import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import OpenAI from "openai";
import { stripLeadingNumber, type ProposalDoc, type ReqSpecDoc } from "@/lib/documentTemplates";
import { parseAgentConfig } from "@/lib/agentConfig";
import { requireAuth } from "@/lib/requireAuth";

const NO_HALLUCINATION_RULE =
  "[절대 규칙] 원본에 명시되지 않은 사실, 기능, 수치, 일정은 절대 추가하거나 지어내지 마라(No hallucination). " +
  "원본에서 확인할 수 없는 항목은 비워두거나 생략하라. 근거 없는 추측으로 채우지 마라.";

// 2026-08-30: 기획서 생성 에이전트에 처음으로 진짜 "도구 호출(tool calling)"을 붙였다 — 지금까지는
// 우리가 미리 정해서 넘겨준 텍스트만 보고 답했는데, 이 도구는 모델이 스스로 "필요하다"고 판단할 때만
// 실행된다. 과거에 승인된 다른 프로젝트 기획서 중 이번 회의록과 관련 있어 보이는 사례를 찾아,
// 스타일/일관성 참고용 시사점을 만드는 데 쓴다(사실 자체를 새로 만드는 근거로는 못 쓰게 프롬프트로 막음).
const SEARCH_PAST_PROPOSALS_TOOL = {
  type: "function" as const,
  function: {
    name: "search_similar_past_proposals",
    description:
      "과거에 승인된 다른 프로젝트의 기획서 중, 이번 회의록/초안과 관련 있어 보이는 것을 키워드로 검색한다. " +
      "비슷한 기능이나 결정을 이미 다른 프로젝트에서 다룬 적이 있는지 참고하고 싶을 때 사용한다.",
    parameters: {
      type: "object",
      properties: {
        keywords: { type: "string", description: "검색 키워드 (예: '소셜 로그인 다크모드')" },
      },
      required: ["keywords"],
    },
  },
};

async function searchSimilarPastProposals(keywords: string, excludeDocId: string) {
  const words = keywords.split(/\s+/).map(w => w.trim()).filter(Boolean).slice(0, 5);
  if (words.length === 0) return [];
  const matches = await prisma.projectDocument.findMany({
    where: {
      id: { not: excludeDocId },
      proposalStatus: "APPROVED",
      OR: words.flatMap(w => [
        { title: { contains: w, mode: "insensitive" as const } },
        { proposalContent: { contains: w, mode: "insensitive" as const } },
      ]),
    },
    select: { title: true, proposalContent: true },
    take: 3,
  });
  return matches.map(m => {
    let overview = "";
    try {
      overview = (JSON.parse(m.proposalContent || "{}").projectOverview ?? "").slice(0, 200);
    } catch {
      // 파싱 실패하면 요약 없이 제목만 반환
    }
    return { title: m.title, overview };
  });
}

// AI 문서 파이프라인의 핵심 엔드포인트: OpenAI를 호출해 기획서 또는 요구사항정의서를 생성/재생성한다.
// 같은 ProjectDocument row 안에서 proposal*/reqSpec* 필드가 각각 독립적으로 관리되므로,
// type 값에 따라 어느 쪽 필드를 채울지 분기한다.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  try {
    const { session, error: authError } = await requireAuth();
    if (authError) return authError;

    // 빌드 시점(Next.js의 페이지 데이터 수집 단계)에 이 모듈이 평가되는데, 그때는
    // 환경변수가 없을 수 있어 모듈 스코프에서 생성하면 배포 빌드 자체가 깨진다 — 요청 안에서 생성한다
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const { id: projectId, docId } = await params;
    const body = await request.json();
    // type: 어떤 문서를 생성할지 지정 — 'proposal'(기획서) 또는 'reqSpec'(요구사항정의서).
    // 이 둘은 파이프라인 순서가 고정되어 있어(회의록→기획서→요구사항정의서) 아래 if/else if로 분기한다.
    const { type } = body; // 'proposal' | 'reqSpec'
    // PM이 직접 에이전트를 실행하는 경우: PM에게 다시 검토요청을 보내는 건 의미가 없으므로
    // 검토 단계 없이 바로 승인 상태로 만든다(FR-05-021과 같은 원칙 — 이미 근거를 보고 본인이 확정하는 것).
    // 일반유저가 실행하면 여전히 PM 검토가 필요하므로 DRAFT로 둔다.
    // 주의: 이전엔 클라이언트가 보낸 autoApprove 값을 그대로 믿었다 — 일반유저가 이 API를 직접
    // autoApprove:true로 호출하면 PM 검토 없이 자기 문서를 스스로 승인시킬 수 있었다(실제 버그).
    // 세션의 role은 로그인 시 서버가 DB에서 읽어 서명한 값이라 클라이언트가 조작할 수 없다.
    const resultStatus = session!.role === "PM" ? "APPROVED" : "DRAFT";

    const doc = await prisma.projectDocument.findUnique({
      where: { id: docId }
    });

    if (!doc) {
      return NextResponse.json({ error: "문서를 찾을 수 없습니다." }, { status: 404 });
    }

    // 이 회의록을 시작한 사람만 AI 기획서/요구사항정의서 생성을 실행할 수 있다.
    // 예전엔 역할 제한이 전혀 없어서, PM이 팀원이 막 등록한 회의록을 대신 "생성"하면
    // (PM 실행 = 자동승인 로직과 맞물려) 정작 작성자가 검토조차 못 해보고 바로 승인 상태가
    // 되어버리는 문제가 있었다(실제 버그 보고됨). authorId가 없는 문서는 이 필드가 생기기
    // 전(2026-08-27 이전)의 레거시 데이터라 작성자를 알 수 없으므로 기존처럼 제한하지 않는다.
    if (doc.authorId && doc.authorId !== session!.userId) {
      return NextResponse.json(
        { error: "다른 사용자가 시작한 회의록입니다. 작성자 본인만 생성할 수 있습니다." },
        { status: 403 }
      );
    }

    // (재)생성은 화면에서 초안(DRAFT)이거나 반려(REJECTED)된 문서에서만 버튼이 뜬다 — 검토중이거나
    // 이미 승인된 문서는 서버에서도 똑같이 막아야 한다. 이 체크가 없으면 작성자가 API를 직접 호출해
    // PM이 지금 검토 중인 내용을, 혹은 이미 승인되어 요구사항정의서/업무의 근거가 된 내용을 아무
    // 경고 없이 새 내용으로 덮어써버릴 수 있었다(실제 발견된 문제).
    const isUnlockedStatus = (s: string) => s === "DRAFT" || s === "REJECTED";
    const currentStatus = type === "proposal" ? doc.proposalStatus : doc.reqSpecStatus;
    if (!isUnlockedStatus(currentStatus)) {
      const label = type === "proposal" ? "기획서" : "요구사항정의서";
      return NextResponse.json(
        { error: `검토 중이거나 이미 승인된 ${label}는 다시 생성할 수 없습니다.` },
        { status: 400 }
      );
    }

    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { agentConfig: true } });
    const agentConfig = parseAgentConfig(project?.agentConfig);

    if (type === "proposal") {
      // 기획서는 반드시 회의록 원본(rawContent)이 있어야 생성 가능 — 파이프라인의 첫 단계
      if (!doc.rawContent) return NextResponse.json({ error: "원본 회의록이 없습니다." }, { status: 400 });

      // response_format: json_object로 모델이 순수 JSON만 반환하도록 강제하고, temperature는
      // 기본 0.0(결정적)이되 /settings의 "기획서 생성 에이전트" 설정값을 따른다(환각 방지를 위해 0~0.3으로 clamp됨)
      // 2026-08-30: 기획서 품질을 더 끌어올려달라는 요청으로 mini에서 상위 모델로 올렸다 — 이
      // 파이프라인의 첫 산출물이라 이후 요구사항정의서/업무 품질이 전부 여기 근거하므로 가장
      // 먼저 올릴 가치가 있는 지점이다.
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        response_format: { type: "json_object" },
        temperature: agentConfig.proposal.temperature,
        messages: [
          {
            role: "system",
            content:
              "당신은 10년차 시니어 서비스 기획자입니다. 제공된 회의록/메모를 근거로, 실무팀이 별도 질문 없이 " +
              "바로 다음 단계(요구사항정의서 작성)로 넘어갈 수 있는 수준으로 구체적인 '프로젝트 기획서'를 작성합니다. " +
              "팀에서 기획서 형식을 아래 8개 항목으로 고정했으므로, 항상 이 구조 그대로 채운다.\n\n" +
              NO_HALLUCINATION_RULE + "\n\n" +
              "[작성 원칙 — 반드시 지켜라]\n" +
              "1) 어떤 항목도 한두 문장으로 뭉뚱그리지 마라. 회의록에 흩어져 있는 배경/이유/맥락/제약을 빠짐없이 찾아 " +
              "통합·구조화해 각 항목을 최소 3~5문장 이상의 완결된 문단으로 작성하라. 단 '구체적으로 쓰라'는 것은 " +
              "원본에 있는 정보를 빠짐없이 담으라는 뜻이지, 원본에 없는 수치·일정·기술스택을 새로 지어내라는 뜻이 아니다.\n" +
              "2) projectOverview(프로젝트 개요): 이 프로젝트가 무엇이고 왜 지금 필요한지, 이를 통해 궁극적으로 " +
              "달성하려는 목적이 무엇인지를 하나의 문단으로 요약하라.\n" +
              "3) problemDefinition(문제 정의): 회의록에서 확인되는 현재 상황·불편함·문제의식을 구체적으로 서술하라 " +
              "(무엇이 문제이고, 왜 문제이며, 방치하면 어떤 영향이 있는지). projectOverview와 겹치지 않게, '왜 필요한가' " +
              "(개요)와 '무엇이 문제인가'(문제 정의)를 구분해서 써라.\n" +
              "4) target(대상 사용자): 회의록에서 유추 가능한 실제 사용 주체(내부 특정 부서/고객/특정 역할 등)와 " +
              "그들이 이 기능으로 해결하려는 불편함(페인포인트)을 함께 서술하라. 명시가 없으면 기능의 성격에서 합리적으로 " +
              "유추 가능한 범위까지만 쓰고, 근거 없는 인구통계 수치·연령대 등은 절대 만들지 마라.\n" +
              "5) features(주요 기능): 회의록에 언급된 기능/요구사항을 하나도 빠짐없이 항목화하라 — 세 가지가 언급됐는데 " +
              "두 개만 뽑는 식으로 누락하면 안 된다. 각 description은 '무엇을 하는 기능인지 + 왜 필요한지(맥락) + " +
              "회의록에 언급된 동작 방식·조건·제약'을 모두 포함해 최소 3문장 이상으로 작성하라. priority는 회의록에서 " +
              "'최우선/필수/반드시/먼저' 등으로 강조됐으면 '필수', '있으면 좋음/추후/선택적으로/여유되면' 등으로 " +
              "언급됐으면 '선택', 그 외 일반적으로 언급된 기능은 '권장'으로 판단하라.\n" +
              "6) userScenario(사용자 시나리오): 대표 사용자가 이 기능들을 실제로 사용하는 흐름을 처음부터 끝까지 " +
              "단계별 순서로 배열의 각 항목에 한 단계씩 담아라(예: [\"사용자가 로그인한다\", \"대시보드에서 새 카드를 " +
              "만든다\", ...]). 화면에서 번호는 자동으로 매겨지므로 각 항목 문자열 앞에 '1.'이나 '1)' 같은 번호를 " +
              "직접 쓰지 마라 — 단계 내용만 적어라. 각 단계는 features에 있는 기능들을 실제 사용 순서대로 엮은 " +
              "것이어야 하며, 회의록에 없는 기능을 시나리오에만 새로 등장시키지 마라. 최소 4단계 이상으로 구체적으로 " +
              "작성하라.\n" +
              "7) techStackConstraints(기술 스택 및 제약사항): 회의록에 언급된 기술 스택·플랫폼·연동 대상 " +
              "(예: 특정 프레임워크, 기존 시스템 연동, 모바일/웹 여부)과 제약사항·우려·외부 의존성(예: 기존 시스템 유지 " +
              "필요, 특정 팀과 협의 필요, 예산·일정 제약 등)을 함께 정리하라. 둘 다 회의록에 전혀 근거가 없으면 " +
              "빈 문자열(\"\")로 둬라 — 지어내지 마라.\n" +
              "8) finalDecisions(최종 결정사항): 회의록에서 논의 끝에 확정된 것으로 언급된 결정 사항들을 목록으로 " +
              "정리하라(예: '1차 릴리즈는 웹만 지원, 모바일 앱은 2차', 'OAuth2 방식으로 인증 결정'). 명시적으로 " +
              "'결정했다/하기로 했다/확정' 등으로 언급된 것만 포함하고, 단순히 논의만 된 아이디어는 넣지 마라. " +
              "결정된 사항이 전혀 없으면 빈 배열로 둬라.\n\n" +
              "다음 JSON 스키마로만 응답하라 (다른 텍스트/마크다운/코드블록 금지):\n" +
              `{"projectOverview": "...", "problemDefinition": "...", "target": "...", "features": [{"name": "기능명", "description": "3문장 이상 상세 설명", "priority": "필수|권장|선택"}], "userScenario": ["번호 없이 단계 내용만", "..."], "techStackConstraints": "...", "finalDecisions": ["...", "..."], "projectPeriod": {"start": "YYYY-MM-DD", "end": "YYYY-MM-DD"}}\n` +
              "features는 원본에서 확인되는 기능만 포함한다. 원본에 '프로젝트 기간' 또는 명확한 시작일~종료일이 " +
              "YYYY-MM-DD 형식으로 명시된 경우에만 projectPeriod를 채우고, 그렇지 않으면 start와 end 모두 빈 문자열로 " +
              "둔다(추측하거나 오늘 날짜로 채우지 마라)."
          },
          { role: "user", content: doc.rawContent }
        ],
      });

      // 모델이 일부 필드를 가끔 빠뜨려도 화면이 죽지 않도록 안전한 기본값으로 정규화한다 —
      // 프롬프트로 강제하는 것과 별개의 방어선. 초안/검수본 둘 다 같은 형태로 정리해야 하므로 함수로 뺐다.
      const normalizeProposal = (rawProposal: any): ProposalDoc => ({
        ...rawProposal,
        projectOverview: rawProposal.projectOverview ?? "",
        problemDefinition: rawProposal.problemDefinition ?? "",
        target: rawProposal.target ?? "",
        features: (rawProposal.features || []).map((f: any) => ({
          name: f?.name ?? "",
          description: f?.description ?? "",
          priority: ["필수", "권장", "선택"].includes(f?.priority) ? f.priority : "권장",
        })),
        // 화면의 <ol>이 번호를 따로 매기므로, 모델이 프롬프트 지시를 무시하고 "1. ..."처럼
        // 항목 앞에 직접 번호를 붙여 반환해도 저장 시점에 벗겨낸다(화면 렌더 시점에도 한 번 더
        // 벗겨내지만, 저장 자체를 깨끗하게 해둬야 엑셀/PPTX 내보내기 등에서도 번호가 안 겹친다).
        userScenario: Array.isArray(rawProposal.userScenario)
          ? rawProposal.userScenario
              .filter((s: any) => typeof s === "string" && s.trim())
              .map((s: string) => stripLeadingNumber(s))
          : [],
        techStackConstraints: rawProposal.techStackConstraints ?? "",
        finalDecisions: Array.isArray(rawProposal.finalDecisions)
          ? rawProposal.finalDecisions.filter((s: any) => typeof s === "string" && s.trim())
          : [],
      });

      const draftProposal = normalizeProposal(JSON.parse(completion.choices[0].message.content || "{}"));

      // 2026-08-30: 여기서 처음으로 실제 도구 호출(tool calling)을 쓴다 — 모델이 스스로 "과거
      // 사례를 찾아볼 필요가 있다"고 판단할 때만 검색 도구를 실행한다(항상 실행하는 게 아님).
      // 찾은 내용은 아래 검토 패스에 "참고용 시사점"으로만 전달하고, 그 자체를 새 사실의 근거로
      // 쓰지 못하게 프롬프트로 막는다 — 실패해도(네트워크 오류 등) 전체 생성 흐름은 계속 진행한다.
      let pastCaseInsight = "참고할 과거 사례 없음";
      try {
        const toolMessages: any[] = [
          {
            role: "system",
            content:
              "당신은 기획서 작성을 돕는 리서치 어시스턴트입니다. 아래 회의록과 초안 요약을 보고, 필요하다고 " +
              "판단되면 search_similar_past_proposals 도구로 과거 유사 사례를 검색하세요. 검색 결과 중 이번 " +
              "건과 실제로 관련 있는 내용이 있으면 스타일/일관성 참고용 시사점을 1~2문장으로 요약하고, 관련 " +
              "사례가 없거나 검색이 필요 없다고 판단되면 '참고할 과거 사례 없음'이라고만 답하세요. 확인되지 " +
              "않은 사실을 지어내지 마세요."
          },
          { role: "user", content: `[회의록]\n${doc.rawContent}\n\n[기획서 초안 개요]\n${draftProposal.projectOverview}` },
        ];
        const toolCallCompletion = await openai.chat.completions.create({
          model: "gpt-4o",
          tools: [SEARCH_PAST_PROPOSALS_TOOL],
          messages: toolMessages,
        });
        const toolMsg = toolCallCompletion.choices[0].message;
        if (toolMsg.tool_calls && toolMsg.tool_calls.length > 0) {
          toolMessages.push(toolMsg);
          for (const call of toolMsg.tool_calls) {
            if (call.type !== "function" || call.function.name !== "search_similar_past_proposals") continue;
            const args = JSON.parse(call.function.arguments || "{}");
            const results = await searchSimilarPastProposals(args.keywords || "", doc.id);
            toolMessages.push({
              role: "tool",
              tool_call_id: call.id,
              content: JSON.stringify(results.length ? results : { message: "관련 과거 기획서를 찾지 못했습니다." }),
            });
          }
          const finalToolCompletion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: toolMessages,
          });
          pastCaseInsight = finalToolCompletion.choices[0].message.content || pastCaseInsight;
        } else if (toolMsg.content) {
          pastCaseInsight = toolMsg.content;
        }
      } catch (err) {
        console.error("Tool-call insight step failed:", err);
        // pastCaseInsight는 기본값("참고할 과거 사례 없음")으로 유지 — 이 단계가 실패해도
        // 기획서 생성 자체는 계속 진행되어야 한다.
      }

      // 2026-08-30: 초안을 한 번에 끝내지 않고, 회의록과 초안을 같이 주고 "빠진 게 없는지"
      // 스스로 재검토시키는 2차 패스를 추가했다 — 첫 시도에서 특정 기능 설명이 얕거나 회의록의
      // 일부 언급이 통째로 누락되는 경우가 있어(품질 개선 요청) 자기 검토로 잡아내려는 목적이다.
      // 검토 결과가 이미 충분하면 그대로 반환해도 되고, 문제가 있으면 그 부분만 고쳐서 반환한다.
      const reviewCompletion = await openai.chat.completions.create({
        model: "gpt-4o",
        response_format: { type: "json_object" },
        temperature: agentConfig.proposal.temperature,
        messages: [
          {
            role: "system",
            content:
              "당신은 방금 작성된 기획서 초안을 검수하는 시니어 리뷰어입니다. 아래 [원본 회의록]과 [초안]을 " +
              "비교해, 원본에 있는 내용 중 초안에서 빠졌거나 뭉뚱그려진 부분이 있는지, 각 항목이 충분히 " +
              "구체적인지(최소 3~5문장, features/userScenario 최소 4단계 등 원래 지시된 기준) 점검하라.\n\n" +
              NO_HALLUCINATION_RULE + "\n\n" +
              "문제를 발견하면 그 부분만 고쳐서 완성도를 높인 최종본을 만들고, 초안이 이미 기준을 충족하면 " +
              "그대로 반환하라. 원본에 없는 사실을 새로 추가하지 마라 — 검수는 '누락 보완과 구체화'이지 " +
              "'창작 확장'이 아니다. userScenario 각 항목 앞에 번호를 쓰지 마라. 아래 [참고: 과거 유사 사례]는 " +
              "스타일·일관성 참고용일 뿐이다 — 거기 나온 내용을 이번 회의록에 없는 새 사실을 추가하는 근거로 " +
              "쓰지 마라.\n\n" +
              "초안과 동일한 JSON 스키마로만 응답하라 (다른 텍스트/마크다운/코드블록 금지):\n" +
              `{"projectOverview": "...", "problemDefinition": "...", "target": "...", "features": [{"name": "기능명", "description": "...", "priority": "필수|권장|선택"}], "userScenario": ["..."], "techStackConstraints": "...", "finalDecisions": ["..."], "projectPeriod": {"start": "YYYY-MM-DD", "end": "YYYY-MM-DD"}}`
          },
          {
            role: "user",
            content: `[원본 회의록]\n${doc.rawContent}\n\n[초안]\n${JSON.stringify(draftProposal)}\n\n[참고: 과거 유사 사례]\n${pastCaseInsight}`,
          }
        ],
      });

      // 검토 패스가 통신 오류·빈 응답 등으로 실패하거나, 오히려 초안보다 부실한 결과(예: 있던
      // 기능이 통째로 사라짐)를 내놓으면 검토 자체가 실패한 것으로 보고 초안을 그대로 채택한다 —
      // "검토했는데 더 나빠짐"이 "검토 안 함"보다 나쁘다.
      let proposalDoc = draftProposal;
      try {
        const reviewed = normalizeProposal(JSON.parse(reviewCompletion.choices[0].message.content || "{}"));
        const isWorse = !reviewed.projectOverview || reviewed.features.length < draftProposal.features.length;
        if (!isWorse) proposalDoc = reviewed;
      } catch {
        // 파싱 실패 시 draftProposal 유지
      }

      await prisma.projectDocument.update({
        where: { id: doc.id },
        // (재)생성 시 이전 승인/반려 상태는 의미가 없어짐 — 초기화
        data: {
          proposalContent: JSON.stringify(proposalDoc),
          proposalStatus: resultStatus,
          proposalRejectReason: null,
        }
      });

      return NextResponse.json({ content: proposalDoc, status: resultStatus });
    } else if (type === "reqSpec") {
      // 요구사항정의서는 기획서가 존재할 뿐 아니라 승인(APPROVED)까지 끝나야 생성 가능하다 —
      // 검토 안 된 기획서를 근거로 다음 문서를 만들면 잘못된 내용이 그대로 전파되기 때문
      if (!doc.proposalContent) return NextResponse.json({ error: "기획서가 없습니다." }, { status: 400 });
      if (doc.proposalStatus !== "APPROVED") {
        return NextResponse.json({ error: "기획서가 승인된 이후에 요구사항정의서를 생성할 수 있습니다." }, { status: 400 });
      }

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        response_format: { type: "json_object" },
        temperature: agentConfig.reqSpec.temperature,
        messages: [
          {
            role: "system",
            content:
              "당신은 10년차 시스템 분석가(SA)입니다. 제공된 기획서(JSON)를 바탕으로, 개발자가 추가 질문 없이 " +
              "바로 구현에 착수할 수 있는 수준으로 상세한 '요구사항정의서'를 표 형태의 항목 목록으로 작성합니다. " +
              "참고용으로 원본 회의록도 함께 제공되니, 기획서 단계에서 요약되며 빠졌을 수 있는 구체적 조건·수치· " +
              "예외 상황이 회의록에 있다면 그것도 근거로 활용하라 — 단, 기획서에 없는 기능을 회의록만 보고 " +
              "새로 추가하지는 마라(기획서가 이미 PM 승인을 거친 확정 범위다).\n\n" +
              NO_HALLUCINATION_RULE + "\n\n" +
              "[작성 원칙 — 반드시 지켜라]\n" +
              "1) 기획서 features 배열의 기능 각각을 최소 1개, 대개 2~4개의 구현 단위 요구사항으로 분해하라. " +
              "예: '소셜 로그인'이라는 기능 하나는 '카카오 로그인 연동', '구글 로그인 연동', '최초 로그인 시 " +
              "회원정보 매핑' 처럼 별개의 요구사항으로 쪼갤 수 있다. 기능 하나를 요구사항 1개로 뭉뚱그리지 마라.\n" +
              "2) description(기능설명): 이 요구사항이 정확히 어떤 동작을 해야 하는지 개발자가 바로 구현 가능한 " +
              "수준으로 최소 2~3문장 이상 서술하라. 기획서에서 유추 가능하면 조건 분기·예외 상황(입력값이 비었을 때, " +
              "실패했을 때 등)까지 포함하라. 단 기획서에 없는 구체적 수치·기술스택·API명을 사실처럼 지어내지 마라 — " +
              "'입력값 검증 후 저장한다' 같은 합리적 일반 원칙 서술은 되지만, 없는 사실의 단정은 안 된다.\n" +
              "3) priority(우선순위)는 '상'/'중'/'하' 중 정확히 하나. 기획서에서 priority가 '필수'인 기능에서 " +
              "파생된 요구사항은 원칙적으로 '상', '권장' 기능에서 파생됐으면 '중', '선택' 기능에서 파생됐으면 '하'를 " +
              "기본으로 하되, 다른 요구사항의 선행조건(예: 로그인 없이는 다른 기능 자체가 불가능)이면 한 단계 올려라.\n" +
              "4) relatedFeature: 이 요구사항이 어느 기획서 기능(features[].name)에서 파생됐는지 그 기능명을 그대로 적어라.\n" +
              "5) inputOutput(입력/처리/출력): '무엇이 입력되고 → 어떤 처리가 일어나고 → 무엇이 출력/저장되는지'를 " +
              "화살표나 단계로 요약하라. 예: '이메일/비밀번호 입력 → 서버 인증 → 성공 시 세션 발급 후 대시보드 이동'.\n" +
              "6) acceptanceCriteria(수용 기준): 이 요구사항이 '완료됐다'고 판단할 구체적이고 검증 가능한 조건을 " +
              "1~3개 나열하라. '정상 동작한다' 같은 막연한 표현 대신 '카카오 로그인 버튼 클릭 시 카카오 인증 화면으로 " +
              "이동하고, 인증 성공 시 대시보드로 리다이렉트된다'처럼 구체적으로 쓰라. 시간/수치 기준은 기획서에 근거가 " +
              "있을 때만 숫자를 쓰고, 없으면 정성적 기준으로 서술하라(숫자를 지어내지 마라).\n" +
              "7) note(비고): 구현 시 참고할 제약사항·의존관계가 있으면 적고, 없으면 빈 문자열로 둬라.\n\n" +
              "다음 JSON 스키마로만 응답하라 (다른 텍스트/마크다운/코드블록 금지):\n" +
              `{"items": [{"id": "FR-01-001", "category": "대분류", "subCategory": "중분류", "name": "요구사항명", "description": "구현 가능한 수준의 상세 설명", "priority": "상|중|하", "relatedFeature": "기획서 기능명", "inputOutput": "입력→처리→출력 요약", "acceptanceCriteria": "완료 판단 기준", "note": "비고"}, ...]}\n` +
              "id는 FR-01-001부터 순서대로 번호를 매긴다(대분류가 바뀌면 두 번째 숫자를 올려도 된다: FR-02-001). " +
              "기획서에 없는 기능을 새로 추가하지 말고, 기획서에 있는 내용을 개발 가능한 단위로 충실히 분해·구체화하라."
          },
          {
            role: "user",
            content: doc.rawContent
              ? `[기획서]\n${doc.proposalContent}\n\n[원본 회의록 — 참고용]\n${doc.rawContent}`
              : doc.proposalContent!,
          }
        ],
      });

      // 모델이 items나 새 필드(priority 등)를 가끔 빠뜨려도 화면이 죽지 않도록 안전한 기본값으로
      // 정규화한다 — 프롬프트로 강제하는 것과 별개의 방어선. 초안/검수본 둘 다 같은 형태로
      // 정리해야 하므로 함수로 뺐다.
      const normalizeReqSpec = (parsed: any): ReqSpecDoc => ({
        items: (parsed.items || []).map((row: any) => ({
          id: row?.id ?? "",
          category: row?.category ?? "",
          subCategory: row?.subCategory ?? "",
          name: row?.name ?? "",
          description: row?.description ?? "",
          priority: ["상", "중", "하"].includes(row?.priority) ? row.priority : "중",
          relatedFeature: row?.relatedFeature ?? "",
          inputOutput: row?.inputOutput ?? "",
          acceptanceCriteria: row?.acceptanceCriteria ?? "",
          note: row?.note ?? "",
        })),
      });

      const draftReqSpec = normalizeReqSpec(JSON.parse(completion.choices[0].message.content || "{}"));

      // 기획서와 같은 이유로 2차 자기 검토 패스를 추가한다 — 기획서 기능 중 일부가 요구사항으로
      // 안 쪼개졌거나, description/acceptanceCriteria가 얕은 항목이 있는지 스스로 다시 점검시킨다.
      const reviewCompletion = await openai.chat.completions.create({
        model: "gpt-4o",
        response_format: { type: "json_object" },
        temperature: agentConfig.reqSpec.temperature,
        messages: [
          {
            role: "system",
            content:
              "당신은 방금 작성된 요구사항정의서 초안을 검수하는 시니어 리뷰어입니다. 아래 [기획서]와 [초안]을 " +
              "비교해, 기획서의 features 중 요구사항으로 분해되지 않고 빠진 게 있는지, 각 항목의 description/" +
              "acceptanceCriteria가 충분히 구체적인지(원래 지시된 기준: description 최소 2~3문장, " +
              "acceptanceCriteria 1~3개의 검증 가능한 조건) 점검하라.\n\n" +
              "[절대 규칙] 기획서에 명시되지 않은 기능·수치·기술스택은 절대 추가하거나 지어내지 마라.\n\n" +
              "문제를 발견하면 그 부분만 고쳐서 완성도를 높인 최종본을 만들고, 초안이 이미 기준을 충족하면 " +
              "그대로 반환하라. id 체계(FR-01-001 등)와 순서는 유지하라.\n\n" +
              "초안과 동일한 JSON 스키마로만 응답하라 (다른 텍스트/마크다운/코드블록 금지):\n" +
              `{"items": [{"id": "FR-01-001", "category": "...", "subCategory": "...", "name": "...", "description": "...", "priority": "상|중|하", "relatedFeature": "...", "inputOutput": "...", "acceptanceCriteria": "...", "note": "..."}]}`
          },
          { role: "user", content: `[기획서]\n${doc.proposalContent}\n\n[초안]\n${JSON.stringify(draftReqSpec)}` }
        ],
      });

      // 검토 패스가 실패하거나 초안보다 항목 수가 줄어드는(요구사항이 사라지는) 결과를 내놓으면
      // 검토를 신뢰하지 않고 초안을 그대로 채택한다.
      let reqSpecDoc = draftReqSpec;
      try {
        const reviewed = normalizeReqSpec(JSON.parse(reviewCompletion.choices[0].message.content || "{}"));
        if (reviewed.items.length >= draftReqSpec.items.length) reqSpecDoc = reviewed;
      } catch {
        // 파싱 실패 시 draftReqSpec 유지
      }

      await prisma.projectDocument.update({
        where: { id: doc.id },
        data: {
          reqSpecContent: JSON.stringify(reqSpecDoc),
          reqSpecStatus: resultStatus,
          reqSpecRejectReason: null,
        }
      });

      return NextResponse.json({ content: reqSpecDoc, status: resultStatus });
    }

    return NextResponse.json({ error: "type은 proposal 또는 reqSpec이어야 합니다." }, { status: 400 });
  } catch (error: any) {
    console.error("AI Generation Error:", error);
    return NextResponse.json({ error: "AI 생성 실패: " + error.message }, { status: 500 });
  }
}
