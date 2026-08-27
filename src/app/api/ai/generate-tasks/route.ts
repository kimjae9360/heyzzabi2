import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { requireAuth } from '@/lib/requireAuth';

// API 라우트 캐싱 방지 (항상 최신 결과 반환)
export const dynamic = 'force-dynamic';

// 어느 화면에서도 호출하지 않는 라우트다(실제 파이프라인은
// /api/projects/[id]/documents/[docId]/extract-tasks). 그런데도 로그인 검사가 없어서
// 비로그인 상태로도 gpt-4o를 계속 호출할 수 있었다(과금 남용 경로) — 로그인만 요구해 막는다.
// 회의록/기획서 등 임의의 텍스트(contextText)를 넣으면 업무(Task) 목록만 뽑아 돌려주는
// 범용 생성기다. parse-meeting과 달리 프로젝트 이름/설명은 만들지 않고, DB에도 저장하지
// 않는다 — 호출자가 결과를 미리보기하거나 직접 저장 여부를 결정하는 용도로 보인다.
export async function POST(req: Request) {
  try {
    const { error: authError } = await requireAuth();
    if (authError) return authError;

    // 모듈 스코프에서 만들면 빌드 시점 페이지 데이터 수집 단계에 환경변수가 없을 때 빌드가 깨진다
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const { contextText } = await req.json();

    if (!contextText) {
      return NextResponse.json({ error: '회의록 또는 기획서 컨텍스트가 제공되지 않았습니다.' }, { status: 400 });
    }

    // [핵심 스펙] 환각(Hallucination) 완벽 차단을 위한 엄격한 시스템 프롬프트
    const systemPrompt = `당신은 최상위급 PM(Project Manager)이자 요구사항 분석가입니다.
당신의 유일한 업무는 사용자로부터 제공된 [컨텍스트(회의록, 기획서)]를 분석하여 실행 가능한 칸반 보드 업무(Task)로 분해하는 것입니다.

*** 반드시 지켜야 할 엄격한 규칙 (Anti-Hallucination) ***
1. 오직 제공된 [컨텍스트] 안에 있는 정보만을 사용하여 업무를 생성하십시오.
2. 컨텍스트에 없는 기능을 상상해서 추가하거나, 사전 지식을 사용하여 회의록/기획서에 덧붙이는 행위(환각)를 엄격히 금지합니다.
3. 명확하게 구별해낼 수 있는 업무가 없다면 "제공된 문서에서 명확한 업무를 추출할 수 없습니다"라고 응답하십시오.
4. 총 업무를 다음 JSON 객체 형태로만 반환하십시오. 반드시 "tasks" 키 배열 안에 담아야 합니다.
{
  "tasks": [
    {
      "title": "업무 제목 (핵심 요약)",
      "description": "업무 상세 내용 (컨텍스트 기반 사실만 기재)",
      "difficulty": "HIGH | MEDIUM | LOW"
    }
  ]
}
5. JSON 포맷 외의 어떠한 인사말이나 추가 설명도 달지 마십시오.`;

    // 다른 AI 라우트들(gpt-4o-mini)과 달리 더 크고 성능이 높은 gpt-4o를 사용한다.
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `[컨텍스트]\n${contextText}` }
      ],
      temperature: 0.1, // 창의성 억제, 사실 기반 응답 극대화 (환각 차단)
      response_format: { type: 'json_object' }
    });

    const aiContent = response.choices[0].message.content;
    
    // JSON 파싱 검증
    try {
      const parsed = JSON.parse(aiContent || '{"tasks": []}');
      // 프롬프트대로라면 {"tasks":[...]}가 와야 하지만, 혹시 모델이 배열을 바로 반환해도
      // 처리할 수 있게 방어적으로 둘 다 허용한다.
      const tasksArray = Array.isArray(parsed.tasks) ? parsed.tasks : (Array.isArray(parsed) ? parsed : []);
      return NextResponse.json({ success: true, data: tasksArray });
    } catch (e) {
      // 프롬프트를 어기고 JSON이 아닌 텍스트를 반환한 경우 (방어 로직)
      return NextResponse.json({ success: false, error: 'AI가 올바른 JSON 포맷을 반환하지 않았습니다.' }, { status: 500 });
    }

  } catch (error: any) {
    console.error('AI Task Generation Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
