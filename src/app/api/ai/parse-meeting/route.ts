import { NextResponse } from "next/server";
import OpenAI from "openai";

// 회의록 텍스트만으로 새 프로젝트의 이름/설명 초안과 초기 업무 목록을 한 번에 뽑아낸다.
// 아직 프로젝트가 만들어지기 전 단계(예: 프로젝트 생성 폼)에서 쓰이는 라우트라 DB에는
// 아무것도 저장하지 않고, 파싱된 JSON을 그대로 반환해 호출자가 폼을 채우도록 한다.
export async function POST(request: Request) {
  try {
    // 모듈 스코프에서 만들면 빌드 시점 페이지 데이터 수집 단계에 환경변수가 없을 때 빌드가 깨진다
    // apiKey가 없어도 일단 "dummy"로 클라이언트는 만들고, 실제 미설정 여부는 아래에서
    // 별도로 체크해 "PM에게 문의하세요" 같은 더 친절한 에러 메시지를 준다.
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "dummy" });
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

    // 다른 AI 라우트들과 달리 이 프롬프트는 tasks뿐 아니라 프로젝트 name/description도
    // 함께 만들어내라고 지시한다 — 아직 프로젝트 레코드 자체가 없는 시점이라 회의록에서
    // 프로젝트 개요까지 같이 뽑아내야 하기 때문이다.
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
