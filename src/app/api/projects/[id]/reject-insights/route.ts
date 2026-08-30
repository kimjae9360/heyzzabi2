import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import OpenAI from "openai";
import { requirePM } from "@/lib/requireAuth";

// 2026-08-30: 에이전트 품질 개선의 "피드백 루프" 단계 — PM이 반려할 때 남기는 사유
// (proposalRejectReason/reqSpecRejectReason)는 이미 DB에 쌓이고 있었지만 아무도 다시 들여다보지
// 않았다. 이 라우트는 그 반려 사유들을 모아 반복되는 패턴이 있는지 AI에게 분석시켜, "프롬프트를
// 이렇게 고치면 좋겠다"는 제안을 사람(PM/개발자)에게 보여준다. 이 결과로 프롬프트를 자동으로
// 바꾸지는 않는다 — 사람이 읽고 판단해서 직접 고치는 반자동 피드백 루프다.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error: authError } = await requirePM();
    if (authError) return authError;

    const { id: projectId } = await params;

    const docs = await prisma.projectDocument.findMany({
      where: {
        projectId,
        OR: [
          { proposalRejectReason: { not: null } },
          { reqSpecRejectReason: { not: null } },
        ],
      },
      select: { title: true, proposalRejectReason: true, reqSpecRejectReason: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 30,
    });

    const reasons: { docTitle: string; type: "기획서" | "요구사항정의서"; reason: string }[] = [];
    for (const d of docs) {
      if (d.proposalRejectReason) reasons.push({ docTitle: d.title, type: "기획서", reason: d.proposalRejectReason });
      if (d.reqSpecRejectReason) reasons.push({ docTitle: d.title, type: "요구사항정의서", reason: d.reqSpecRejectReason });
    }

    // 근거가 너무 적으면(1~2건) "패턴"이라 부르기 민망하고, 억지로 분석하면 우연을 규칙처럼
    // 단정하게 된다 — 최소 개수 미만이면 분석 자체를 하지 않고 이유를 그대로 알려준다.
    if (reasons.length < 3) {
      return NextResponse.json({
        success: true,
        insufficientData: true,
        reasonCount: reasons.length,
        message: `분석할 만한 반려 사유가 아직 부족합니다(현재 ${reasons.length}건, 최소 3건 필요). 반려가 더 쌓이면 다시 시도해주세요.`,
      });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "당신은 AI 문서 생성 파이프라인을 개선하는 프롬프트 엔지니어입니다. 아래는 PM이 AI가 생성한 " +
            "기획서/요구사항정의서를 반려하며 남긴 실제 사유 목록입니다. 이 사유들을 분석해 반복되는 " +
            "패턴이 있는지 찾고, 있다면 AI 생성 프롬프트를 어떻게 고치면 이런 반려가 줄어들지 구체적으로 " +
            "제안하세요.\n\n" +
            "[절대 규칙] 주어진 반려 사유에 실제로 근거가 있는 패턴만 보고하라 — 반려 사유 목록에 없는 " +
            "내용을 지어내거나, 근거가 1건뿐인데 '자주 반복된다'고 과장하지 마라. 패턴이라 부를 만큼 " +
            "반복되지 않으면 patterns를 빈 배열로 둬라.\n\n" +
            "다음 JSON 스키마로만 응답하라 (다른 텍스트/마크다운/코드블록 금지):\n" +
            `{"patterns": [{"theme": "패턴 요약 (예: '기술 스택 언급 부족')", "occurrenceCount": 숫자, "evidence": "이 패턴이 드러나는 실제 반려 사유 인용/요약", "suggestion": "프롬프트를 어떻게 고치면 좋을지 구체적 제안"}], "overallSummary": "전체 반려 사유에 대한 1~2문장 총평"}`
        },
        {
          role: "user",
          content: JSON.stringify(reasons),
        },
      ],
    });

    const parsed = JSON.parse(completion.choices[0].message.content || "{}");
    const patterns = Array.isArray(parsed.patterns)
      ? parsed.patterns.map((p: any) => ({
          theme: p?.theme ?? "",
          occurrenceCount: typeof p?.occurrenceCount === "number" ? p.occurrenceCount : 0,
          evidence: p?.evidence ?? "",
          suggestion: p?.suggestion ?? "",
        }))
      : [];

    return NextResponse.json({
      success: true,
      insufficientData: false,
      reasonCount: reasons.length,
      overallSummary: parsed.overallSummary ?? "",
      patterns,
    });
  } catch (error: any) {
    console.error("Reject insights error:", error);
    return NextResponse.json({ success: false, error: "반려 패턴 분석 실패: " + error.message }, { status: 500 });
  }
}
