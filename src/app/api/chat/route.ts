import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import OpenAI from 'openai';
import { requireAuth } from '@/lib/requireAuth';

// 채팅창을 열 때 지금까지의 대화 기록 전체를 시간순으로 내려준다(페이지네이션 없음).
export async function GET() {
  try {
    const { error: authError } = await requireAuth();
    if (authError) return authError;

    const messages = await prisma.chatMessage.findMany({
      orderBy: { createdAt: 'asc' },
    });
    return NextResponse.json({ success: true, messages });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch messages" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { error: authError } = await requireAuth();
    if (authError) return authError;

    // 모듈 스코프에서 만들면 빌드 시점 페이지 데이터 수집 단계에 환경변수가 없을 때 빌드가 깨진다
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });
    const body = await req.json();
    const userMessageContent = body.message;

    if (!userMessageContent || typeof userMessageContent !== 'string') {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }
    // 길이 제한이 없어서 매우 긴 메시지를 보내면 DB에 그대로 저장되고, 이후 대화에서 컨텍스트로
    // 계속 재사용돼(previousMessages) 토큰 비용이 눈덩이처럼 커질 수 있었다(전체 점검에서 발견).
    if (userMessageContent.length > 8000) {
      return NextResponse.json({ error: '메시지는 8000자를 초과할 수 없습니다.' }, { status: 400 });
    }

    // Save user message to DB
    await prisma.chatMessage.create({
      data: { role: 'user', content: userMessageContent },
    });

    // Fetch previous context
    const previousMessages = await prisma.chatMessage.findMany({
      orderBy: { createdAt: 'asc' },
      take: 20 // Only take last 20 messages for context window
    });

    // select 없이 findMany()를 쓰면 password(평문 저장) 필드까지 그대로 OpenAI로 전송된다 —
    // 이 프롬프트가 실제로 필요한 필드만 명시적으로 골라서 절대 password가 안 섞이게 한다.
    const memberSelect = {
      id: true, name: true, email: true, role: true, department: true,
      position: true, jobTitle: true, status: true, techStack: true, certifications: true, pastProjects: true,
    } as const;
    // 벡터 검색/RAG 없이 전체 프로젝트·업무·팀원 데이터를 통째로 JSON으로 만들어 프롬프트에 넣는
    // 방식이다 — 구현이 단순하고 정확하지만, 데이터가 많아질수록 매 요청 토큰 비용이 커진다.
    const projects = await prisma.project.findMany({
      include: { tasks: { include: { assignee: { select: memberSelect } } } },
    });
    const members = await prisma.user.findMany({ select: memberSelect });

    // 아래 CRITICAL INSTRUCTION이 이 챗봇을 "내부 데이터에만 답하는" 그라운딩된 챗봇으로 만든다 —
    // 모델이 아는 일반 지식으로 답하지 못하게 막아 잘못된 정보(환각)를 방지한다.
    const systemPrompt = `
You are the internal AI Assistant for HeyZzabi, a project management system.
CRITICAL INSTRUCTION: You MUST ONLY answer questions based on the internal project data provided below.
If the user asks a question that cannot be answered using the provided project data, you MUST reply exactly with: "해당 내용은 프로젝트 데이터에 없습니다." (This information is not in the project data.)
Do NOT hallucinate. Do NOT use any external internet knowledge.

[Internal Project Data]
Projects and Tasks:
${JSON.stringify(projects, null, 2)}
Team Members:
${JSON.stringify(members, null, 2)}
`;

    const apiMessages: any[] = [
      { role: 'system', content: systemPrompt },
      // DB에는 'ai'로 저장하지만 OpenAI API가 요구하는 role 값은 'assistant'이므로 변환해준다
      ...previousMessages.map(m => ({ role: m.role === 'ai' ? 'assistant' : m.role, content: m.content }))
    ];

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: apiMessages,
      temperature: 0.1,
    });

    const replyContent = response.choices[0]?.message?.content || '답변을 생성하지 못했습니다.';

    // Save AI response to DB
    const aiMessage = await prisma.chatMessage.create({
      data: { role: 'ai', content: replyContent },
    });

    return NextResponse.json({ reply: aiMessage });
  } catch (error: any) {
    console.error('AI Chat Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
