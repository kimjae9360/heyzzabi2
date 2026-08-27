import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/requireAuth';

// 리서치 보고서 삭제 — 보고서는 근거 스냅샷(sourcesJson)만 담고 있어 원본 회의록/기획서/
// 업무 데이터에는 영향을 주지 않는다.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error: authError } = await requireAuth();
  if (authError) return authError;

  const { id } = await params;
  try {
    await prisma.researchReport.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : '리서치 보고서 삭제에 실패했습니다.' }, { status: 500 });
  }
}
