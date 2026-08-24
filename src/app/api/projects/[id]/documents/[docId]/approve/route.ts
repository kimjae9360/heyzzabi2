import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// type("proposal"|"reqSpec") 값을 실제 Prisma 컬럼명으로 매핑하는 테이블.
// 기획서/요구사항정의서의 승인 로직이 완전히 동일하므로, if/else 대신 이 매핑으로
// data: { [FIELD[type]]: ... } 처럼 동적으로 컬럼을 선택해 코드 중복을 없앤다.
const FIELD = { proposal: "proposalStatus", reqSpec: "reqSpecStatus" } as const;
const REASON_FIELD = { proposal: "proposalRejectReason", reqSpec: "reqSpecRejectReason" } as const;

// PM(또는 검토 권한자)이 PENDING_REVIEW 상태의 문서를 승인 처리하는 엔드포인트.
// reqSpec 문서 생성은 proposalStatus가 APPROVED여야만 가능하므로, 이 승인 API가
// 기획서→요구사항정의서로 넘어가는 파이프라인의 게이트 역할을 한다.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  try {
    const { docId } = await params;
    const { type } = await request.json() as { type: string };

    // 리터럴 문자열 검증 — FIELD/REASON_FIELD 매핑에 없는 값이 들어오면 undefined 키로
    // Prisma를 호출하게 되므로 미리 화이트리스트 체크한다
    if (type !== "proposal" && type !== "reqSpec") {
      return NextResponse.json({ error: "type은 proposal 또는 reqSpec이어야 합니다." }, { status: 400 });
    }

    // 승인 시 이전에 반려됐던 사유는 더 이상 의미가 없으므로 함께 null로 초기화
    const updated = await prisma.projectDocument.update({
      where: { id: docId },
      data: { [FIELD[type]]: "APPROVED", [REASON_FIELD[type]]: null },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: "승인 처리 실패" }, { status: 500 });
  }
}
