import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePM } from '@/lib/requireAuth';

// 리서치 보고서 삭제 — 보고서는 근거 스냅샷(sourcesJson)만 담고 있어 원본 회의록/기획서/
// 업무 데이터에는 영향을 주지 않는다. ResearchReport에는 작성자를 구분할 필드가 없어(전사
// 공유 지식 리포트로 설계됨) 개인별 소유권 체크 대신 PM만 삭제할 수 있게 막는다 — 예전엔
// 로그인만 하면 아무나 다른 사람이 만든 보고서를 지울 수 있었다(전체 점검에서 발견된 문제).
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error: authError } = await requirePM();
  if (authError) return authError;

  const { id } = await params;
  try {
    await prisma.researchReport.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : '리서치 보고서 삭제에 실패했습니다.' }, { status: 500 });
  }
}
