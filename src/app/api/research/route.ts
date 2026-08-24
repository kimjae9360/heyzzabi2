import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { runDeepResearch, AIConfigError, type LocalPacketDoc } from '@/lib/openai';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');
    
    const reports = await prisma.researchReport.findMany({
      where: projectId ? { projectId } : undefined,
      orderBy: { createdAt: 'desc' },
    });
    
    return NextResponse.json(reports.map((r) => ({
      id: r.id,
      question: r.question,
      content: r.content,
      degraded: r.degraded,
      createdBy: "AI 리서처",
      createdAt: r.createdAt.toISOString(),
      sourceCount: JSON.parse(r.sourcesJson || '[]').length,
    })));
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to fetch reports" }, { status: 500 });
  }
}

async function buildLocalPacket(projectId: string | null): Promise<LocalPacketDoc[]> {
  const where = projectId ? { projectId } : {};
  const [meetings, docs, tasks] = await Promise.all([
    prisma.meetingNote.findMany({ orderBy: { createdAt: 'desc' }, take: 20 }),
    prisma.projectDocument.findMany({ where, orderBy: { createdAt: 'desc' }, take: 20 }),
    prisma.task.findMany({
      where: projectId ? { projectId } : {},
      orderBy: { createdAt: 'desc' },
      take: 30,
    }),
  ]);

  const packet: LocalPacketDoc[] = [];
  meetings.forEach((m) => packet.push({ kind: '회의록', title: m.title, content: m.content + (m.summary ? `\n요약: ${m.summary}` : '') }));
  docs.forEach((d) => packet.push({ 
    kind: '기획서', 
    title: d.title, 
    content: [d.rawContent, d.proposalContent, d.reqSpecContent].filter(Boolean).join('\n') 
  }));
  tasks.forEach((t) => packet.push({
    kind: '업무',
    title: t.title,
    content: [t.description, t.status !== 'DONE' ? undefined : '완료됨', t.rejectReason ? `반려 사유: ${t.rejectReason}` : undefined]
      .filter(Boolean).join(' / ') || `(상태: ${t.status})`,
  }));
  return packet;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body.question || typeof body.question !== 'string') {
      return NextResponse.json({ error: '리서치 질문을 입력해 주세요.' }, { status: 400 });
    }
    const projectId: string | null = body.projectId || null;

    const packet = await buildLocalPacket(projectId);
    const result = await runDeepResearch(body.question, packet);

    const report = await prisma.researchReport.create({
      data: {
        question: body.question,
        content: result.content,
        degraded: result.degraded,
        sourcesJson: JSON.stringify(packet.map((p) => ({ kind: p.kind, title: p.title }))),
        projectId: projectId,
      },
    });

    return NextResponse.json({ id: report.id, content: report.content, degraded: report.degraded }, { status: 201 });
  } catch (err) {
    console.error(err);
    if (err instanceof AIConfigError) return NextResponse.json({ error: err.message }, { status: 400 });
    return NextResponse.json({ error: err instanceof Error ? err.message : '리서치에 실패했습니다.' }, { status: 500 });
  }
}
