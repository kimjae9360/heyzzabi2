import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePM } from "@/lib/requireAuth";

// approve API와 동일한 이유로 type→컬럼명 매핑을 사용한다 (동적 필드 선택으로 중복 제거)
const FIELD = { proposal: "proposalStatus", reqSpec: "reqSpecStatus" } as const;
const REASON_FIELD = { proposal: "proposalRejectReason", reqSpec: "reqSpecRejectReason" } as const;

// PENDING_REVIEW 상태의 문서를 반려 처리하는 엔드포인트.
// 반려되면 상태가 REJECTED로 바뀌면서 route.ts의 isUnlockedStatus 기준상 다시 수정 가능한
// 상태로 돌아가고, 사유를 남겨야 작성자가 무엇을 고쳐야 할지 알 수 있다.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  try {
    const { error: authError } = await requirePM();
    if (authError) return authError;

    const { docId } = await params;
    const { type, reason } = await request.json() as { type: string; reason: string };

    if (type !== "proposal" && type !== "reqSpec") {
      return NextResponse.json({ error: "type은 proposal 또는 reqSpec이어야 합니다." }, { status: 400 });
    }
    // 승인과 달리 반려는 사유가 없으면 의미가 없으므로 필수값으로 검증 (공백만 있는 경우도 차단)
    if (!reason || !reason.trim()) {
      return NextResponse.json({ error: "반려 사유는 필수입니다." }, { status: 400 });
    }

    // approve route와 동일한 이유로 현재 상태를 검증한다 — 가드가 없으면 이미 APPROVED된
    // 요구사항정의서(이미 업무가 추출됐을 수 있음)를 REJECTED로 되돌려 삭제 가능하게 만들 수
    // 있고, 그러면 sourceDocumentId가 가리키는 문서가 사라져 업무가 고아화된다.
    const current = await prisma.projectDocument.findUnique({ where: { id: docId } });
    if (!current) {
      return NextResponse.json({ error: "문서를 찾을 수 없습니다." }, { status: 404 });
    }
    if (current[FIELD[type]] !== "PENDING_REVIEW") {
      return NextResponse.json({ error: "검토 요청 중인 문서만 반려할 수 있습니다." }, { status: 400 });
    }

    const updated = await prisma.projectDocument.update({
      where: { id: docId },
      data: { [FIELD[type]]: "REJECTED", [REASON_FIELD[type]]: reason },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: "반려 처리 실패" }, { status: 500 });
  }
}
