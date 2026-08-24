import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import OpenAI from "openai";
import type { ProposalDoc, ReqSpecDoc } from "@/lib/documentTemplates";
import { parseAgentConfig } from "@/lib/agentConfig";

const NO_HALLUCINATION_RULE =
  "[절대 규칙] 원본에 명시되지 않은 사실, 기능, 수치, 일정은 절대 추가하거나 지어내지 마라(No hallucination). " +
  "원본에서 확인할 수 없는 항목은 비워두거나 생략하라. 근거 없는 추측으로 채우지 마라.";

// AI 문서 파이프라인의 핵심 엔드포인트: OpenAI를 호출해 기획서 또는 요구사항정의서를 생성/재생성한다.
// 같은 ProjectDocument row 안에서 proposal*/reqSpec* 필드가 각각 독립적으로 관리되므로,
// type 값에 따라 어느 쪽 필드를 채울지 분기한다.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  try {
    // 빌드 시점(Next.js의 페이지 데이터 수집 단계)에 이 모듈이 평가되는데, 그때는
    // 환경변수가 없을 수 있어 모듈 스코프에서 생성하면 배포 빌드 자체가 깨진다 — 요청 안에서 생성한다
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const { id: projectId, docId } = await params;
    const body = await request.json();
    // type: 어떤 문서를 생성할지 지정 — 'proposal'(기획서) 또는 'reqSpec'(요구사항정의서).
    // 이 둘은 파이프라인 순서가 고정되어 있어(회의록→기획서→요구사항정의서) 아래 if/else if로 분기한다.
    const { type, autoApprove } = body; // 'proposal' | 'reqSpec'
    // PM이 직접 에이전트를 실행하는 경우: PM에게 다시 검토요청을 보내는 건 의미가 없으므로
    // 검토 단계 없이 바로 승인 상태로 만든다(FR-05-021과 같은 원칙 — 이미 근거를 보고 본인이 확정하는 것).
    // 일반유저가 실행하면 여전히 PM 검토가 필요하므로 DRAFT로 둔다.
    const resultStatus = autoApprove ? "APPROVED" : "DRAFT";

    const doc = await prisma.projectDocument.findUnique({
      where: { id: docId }
    });

    if (!doc) {
      return NextResponse.json({ error: "문서를 찾을 수 없습니다." }, { status: 404 });
    }

    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { agentConfig: true } });
    const agentConfig = parseAgentConfig(project?.agentConfig);

    if (type === "proposal") {
      // 기획서는 반드시 회의록 원본(rawContent)이 있어야 생성 가능 — 파이프라인의 첫 단계
      if (!doc.rawContent) return NextResponse.json({ error: "원본 회의록이 없습니다." }, { status: 400 });

      // response_format: json_object로 모델이 순수 JSON만 반환하도록 강제하고, temperature는
      // 기본 0.0(결정적)이되 /settings의 "기획서 생성 에이전트" 설정값을 따른다(환각 방지를 위해 0~0.3으로 clamp됨)
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        temperature: agentConfig.proposal.temperature,
        messages: [
          {
            role: "system",
            content:
              "당신은 전문 서비스 기획자입니다. 제공된 회의록/메모를 기반으로 '프로젝트 기획서' 초안 1개를 작성합니다.\n\n" +
              NO_HALLUCINATION_RULE + "\n\n" +
              "다음 JSON 스키마로만 응답하라 (다른 텍스트 금지):\n" +
              `{"background": "배경 및 목적", "target": "타겟 사용자", "features": [{"name": "기능명", "description": "설명"}], "expectedEffect": "기대 효과", "milestones": [{"name": "마일스톤", "date": "날짜/시기"}], "projectPeriod": {"start": "YYYY-MM-DD", "end": "YYYY-MM-DD"}}\n` +
              "원본에 일정 관련 언급이 없으면 milestones는 빈 배열로 둔다. features는 원본에서 확인되는 기능만 포함한다. " +
              "원본에 '프로젝트 기간' 또는 명확한 시작일~종료일이 YYYY-MM-DD 형식으로 명시된 경우에만 projectPeriod를 채우고, " +
              "그렇지 않으면 start와 end 모두 빈 문자열로 둔다(추측하거나 오늘 날짜로 채우지 마라)."
          },
          { role: "user", content: doc.rawContent }
        ],
      });

      const proposalDoc: ProposalDoc = JSON.parse(completion.choices[0].message.content || "{}");

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
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        temperature: agentConfig.reqSpec.temperature,
        messages: [
          {
            role: "system",
            content:
              "당신은 시스템 분석가(SA)입니다. 제공된 기획서(JSON)를 바탕으로 개발자가 구현할 수 있는 수준의 " +
              "'요구사항 정의서'를 표 형태의 항목 목록으로 작성합니다.\n\n" +
              NO_HALLUCINATION_RULE + "\n\n" +
              "다음 JSON 스키마로만 응답하라 (다른 텍스트 금지):\n" +
              `{"items": [{"id": "FR-01-001", "category": "대분류", "subCategory": "중분류", "name": "요구사항명", "description": "기능설명", "note": "비고"}, ...]}\n` +
              "id는 FR-01-001부터 순서대로 번호를 매긴다. 기획서에 없는 기능을 추가하지 말고, 있는 내용만 정리한다."
          },
          { role: "user", content: doc.proposalContent }
        ],
      });

      const parsed = JSON.parse(completion.choices[0].message.content || "{}");
      // 모델이 items를 빠뜨려도 undefined가 아니라 빈 배열로 정규화해 프론트에서 안전하게 map할 수 있게 한다
      const reqSpecDoc: ReqSpecDoc = { items: parsed.items || [] };

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
