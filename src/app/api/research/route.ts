import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { runDeepResearch, AIConfigError, type LocalPacketDoc } from '@/lib/openai';

// 저장된 리서치 보고서 목록 조회 (projectId로 특정 프로젝트만 필터링 가능).
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
      // sourcesJson은 소스 목록을 문자열(JSON)로 저장해두므로 여기서 파싱해 개수만 뽑아 쓴다.
      sourceCount: JSON.parse(r.sourcesJson || '[]').length,
    })));
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to fetch reports" }, { status: 500 });
  }
}

// "딥 리서치"용 내부 자료 묶음을 만든다 — 외부 웹 검색은 전혀 하지 않고
// 우리 DB에 있는 회의록/기획서/업무만으로 RAG 컨텍스트를 구성하는 방식이다.
// 각 항목을 20~30개로 제한하는 이유는 LLM에 보낼 프롬프트 크기를 적정 수준으로 묶어두기 위함.
async function buildLocalPacket(projectId: string | null): Promise<LocalPacketDoc[]> {
  const where = projectId ? { projectId } : {};
  const [meetings, docs, tasks] = await Promise.all([
    // 회의록은 projectId 필터가 없다 — 프로젝트 구분 없이 최근 회의록을 전부 후보로 삼는다.
    prisma.meetingNote.findMany({ orderBy: { createdAt: 'desc' }, take: 20 }),
    prisma.projectDocument.findMany({ where, orderBy: { createdAt: 'desc' }, take: 20 }),
    prisma.task.findMany({
      where: projectId ? { projectId } : {},
      orderBy: { createdAt: 'desc' },
      take: 30,
    }),
  ]);

  // 세 종류의 서로 다른 모델을 LLM이 이해하기 쉬운 공통 포맷(kind/title/content)으로 합친다.
  const packet: LocalPacketDoc[] = [];
  meetings.forEach((m) => packet.push({ kind: '회의록', title: m.title, content: m.content + (m.summary ? `\n요약: ${m.summary}` : '') }));
  docs.forEach((d) => packet.push({
    kind: '기획서',
    title: d.title,
    content: [d.rawContent, d.proposalContent, d.reqSpecContent].filter(Boolean).join('\n')
  }));
  // 업무는 설명/완료 여부/반려 사유를 한 줄로 압축해 컨텍스트로 제공 — 아무 정보도 없으면
  // 최소한 현재 상태값만이라도 넘겨 LLM이 참고할 수 있게 한다.
  tasks.forEach((t) => packet.push({
    kind: '업무',
    title: t.title,
    content: [t.description, t.status !== 'DONE' ? undefined : '완료됨', t.rejectReason ? `반려 사유: ${t.rejectReason}` : undefined]
      .filter(Boolean).join(' / ') || `(상태: ${t.status})`,
  }));
  return packet;
}

// 질문을 받아 내부 자료 기반으로 리서치 보고서를 생성하고 저장한다.
// degraded는 runDeepResearch 내부에서 참고 자료가 2건 미만일 때 true가 되며(lib/openai.ts),
// 프론트에서 "근거 부족으로 제한된 답변" 경고를 보여주는 데 쓰인다.
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
        // 본문 전체가 아니라 종류/제목만 스냅샷으로 남긴다 — 나중에 "이 보고서가 어떤 자료를
        // 근거로 썼는지" 출처 표시에 쓰기 위함이며, 원본 데이터가 수정/삭제돼도 영향받지 않는다.
        sourcesJson: JSON.stringify(packet.map((p) => ({ kind: p.kind, title: p.title }))),
        projectId: projectId,
      },
    });

    return NextResponse.json({ id: report.id, content: report.content, degraded: report.degraded }, { status: 201 });
  } catch (err) {
    console.error(err);
    // AIConfigError는 API 키 미설정 등 서버 설정 문제 — 사용자 입력 오류로 보고 400 처리,
    // 그 외 예외는 진짜 서버 오류이므로 500으로 응답한다.
    if (err instanceof AIConfigError) return NextResponse.json({ error: err.message }, { status: 400 });
    return NextResponse.json({ error: err instanceof Error ? err.message : '리서치에 실패했습니다.' }, { status: 500 });
  }
}
