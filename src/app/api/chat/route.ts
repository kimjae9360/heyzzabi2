import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import OpenAI from 'openai';

export async function GET() {
  try {
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
    // 모듈 스코프에서 만들면 빌드 시점 페이지 데이터 수집 단계에 환경변수가 없을 때 빌드가 깨진다
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });
    const body = await req.json();
    const userMessageContent = body.message;

    if (!userMessageContent) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
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

    const projects = await prisma.project.findMany({
      include: { tasks: { include: { assignee: true } } },
    });
    const members = await prisma.user.findMany();

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
