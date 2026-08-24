import { NextResponse } from "next/server";
import OpenAI from "openai";

// Optional: you might want to handle cases where OPENAI_API_KEY is not set yet.
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "dummy", // Fallback to avoid crash on boot if not set
});

export async function POST(request: Request) {
  try {
    const { notes } = await request.json();

    if (!notes) {
      return NextResponse.json({ error: "회의록 내용이 없습니다." }, { status: 400 });
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "서버에 OPENAI_API_KEY가 설정되지 않았습니다. PM에게 문의하세요." },
        { status: 500 }
      );
    }

    const systemPrompt = `
너는 유능한 기획자(PM)이자 스크럼 마스터야. 
주어진 회의록 텍스트를 분석해서 전체 프로젝트의 개요를 잡고, 실무자들이 즉시 진행할 수 있는 구체적인 칸반 업무(Task) 단위로 쪼개야 해.
반드시 아래의 JSON 형식으로만 응답해. (마크다운 코드블록 안 써도 됨. 순수 JSON만 출력)

{
  "name": "프로젝트 핵심 목표나 이름 (예: 신규 랜딩페이지 구축)",
  "description": "프로젝트에 대한 전반적인 요약 설명",
  "tasks": [
    {
      "title": "구체적인 업무 제목 (예: 메인 배너 디자인 시안 3종 제작)",
      "description": "해당 업무를 수행하기 위해 필요한 구체적인 설명과 요구사항",
      "difficulty": "HIGH" // HIGH, MEDIUM, LOW 중 하나. (일정/공수 기준)
    }
  ]
}

주의:
- 모든 Task는 명확하고 구체적이어야 해.
- 전체 업무를 3~7개 사이의 의미 있는 단위로 쪼개줘.
- 결과물은 오직 올바른 JSON 포맷이어야 해.
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Fast, cheap, and very smart
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `회의록 내용:\n${notes}` },
      ],
      response_format: { type: "json_object" }, // Ensures JSON output
      temperature: 0.2, // Low temp for more deterministic parsing
    });

    const resultText = response.choices[0].message.content;
    
    if (!resultText) {
      throw new Error("AI 응답이 비어있습니다.");
    }

    const parsedJson = JSON.parse(resultText);
    return NextResponse.json(parsedJson);

  } catch (error: any) {
    console.error("AI Parse Error:", error);
    return NextResponse.json(
      { error: error.message || "AI 분석 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
