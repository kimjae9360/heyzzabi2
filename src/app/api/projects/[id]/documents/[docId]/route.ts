import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/requireAuth";

// 기획서/요구사항정의서 각각이 독립적으로 거치는 검토 상태값 (Prisma 문자열 컬럼이라 여기서 화이트리스트로 검증)
const VALID_DOC_STATUSES = ["DRAFT", "PENDING_REVIEW", "APPROVED", "REJECTED"];
// 검토요청 전(DRAFT) 또는 반려(REJECTED) 상태에서만 삭제/원본수정 허용 — documents/page.tsx의
// isDocDeletable과 반드시 같은 규칙이어야 한다. 프론트에만 있던 규칙이라 URL만 알면 우회 가능했던
// 걸 API 레벨에도 넣는다(QA에서 발견).
const isUnlockedStatus = (s: string) => s === "DRAFT" || s === "REJECTED";

// 원본 회의록/메모(rawContent), 반려된 기획서/요구사항정의서 직접 수정 등 문서 필드 수정
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  try {
    const { session, error: authError } = await requireAuth();
    if (authError) return authError;

    const { docId } = await params;
    const body = await request.json();
    const {
      title, rawContent, meetingDate, attendees,
      proposalContent, proposalStatus, proposalRejectReason,
      reqSpecContent, reqSpecStatus, reqSpecRejectReason,
    } = body;

    if (proposalStatus !== undefined && !VALID_DOC_STATUSES.includes(proposalStatus)) {
      return NextResponse.json({ success: false, error: "잘못된 proposalStatus 값입니다." }, { status: 400 });
    }
    if (reqSpecStatus !== undefined && !VALID_DOC_STATUSES.includes(reqSpecStatus)) {
      return NextResponse.json({ success: false, error: "잘못된 reqSpecStatus 값입니다." }, { status: 400 });
    }

    const doc = await prisma.projectDocument.findUnique({ where: { id: docId } });
    if (!doc) {
      return NextResponse.json({ success: false, error: "문서를 찾을 수 없습니다." }, { status: 404 });
    }

    // PM은 반려된 문서를 검토·직접수정·확정할 권한이 있어 누구 문서든 수정할 수 있다. PM이
    // 아니면 본인이 시작한 회의록(또는 authorId가 없는 레거시 문서)만 수정할 수 있다 — 이 체크가
    // 없으면 다른 사람의 회의록 원본/기획서를 임의로 고칠 수 있었다(실제 보고된 취약점).
    if (session!.role !== "PM" && doc.authorId && doc.authorId !== session!.userId) {
      return NextResponse.json({ error: "다른 사용자의 문서입니다. 작성자 본인만 수정할 수 있습니다." }, { status: 403 });
    }

    // 상태값(proposalStatus/reqSpecStatus)은 검토 파이프라인의 핵심이라 아무 전이나 허용하면 안
    // 된다 — 이 범용 PATCH가 실제로 담당하는 유일한 상태 전이는 "반려(REJECTED)된 문서를 직접
    // 고쳐서, PM이면 바로 승인(APPROVED)하고 아니면 다시 초안(DRAFT)으로 되돌리는" 것뿐이다
    // (documents/page.tsx의 "직접 수정" 버튼이 REJECTED 상태에서만 뜨는 것과 정확히 대응한다).
    // 예전엔 요청 바디에 담긴 상태값을 그대로 신뢰해서, 로그인만 한 사용자가
    // {"proposalStatus":"APPROVED"} 하나만 보내도 검토요청/승인 절차 없이 바로 승인 처리가
    // 됐었다(실제 보고된 취약점) — 반드시 DB에 저장된 "현재" 상태를 기준으로 검증해야 한다.
    const isLegalStatusTransition = (currentStatus: string, nextStatus: string | undefined) => {
      if (nextStatus === undefined || nextStatus === currentStatus) return true;
      return currentStatus === "REJECTED" && (nextStatus === "DRAFT" || (nextStatus === "APPROVED" && session!.role === "PM"));
    };
    if (!isLegalStatusTransition(doc.proposalStatus, proposalStatus)) {
      return NextResponse.json({ error: "기획서 상태를 이 방식으로 변경할 수 없습니다. 검토요청/승인/반려 절차를 이용해주세요." }, { status: 400 });
    }
    if (!isLegalStatusTransition(doc.reqSpecStatus, reqSpecStatus)) {
      return NextResponse.json({ error: "요구사항정의서 상태를 이 방식으로 변경할 수 없습니다. 검토요청/승인/반려 절차를 이용해주세요." }, { status: 400 });
    }

    // 잠금 여부는 반드시 DB에 저장된 실제 현재 상태로 판단한다(요청 바디 값을 신뢰하지 않음) —
    // 위 전이 검증을 통과했다면 REJECTED(=잠금 해제 상태)에서만 상태 변경이 허용되므로 그대로 둬도 안전하다.
    if ((rawContent !== undefined || proposalContent !== undefined) && !isUnlockedStatus(doc.proposalStatus)) {
      return NextResponse.json({ success: false, error: "검토 중이거나 승인된 기획서는 수정할 수 없습니다." }, { status: 400 });
    }
    if (reqSpecContent !== undefined && !isUnlockedStatus(doc.reqSpecStatus)) {
      return NextResponse.json({ success: false, error: "검토 중이거나 승인된 요구사항정의서는 수정할 수 없습니다." }, { status: 400 });
    }

    // 요청 바디에 포함된 필드만 골라서 업데이트한다 — 나머지 필드는 undefined 체크로 걸러져
    // 기존 값이 그대로 유지된다(부분 업데이트 패턴)
    const updateData: Record<string, unknown> = {};
    if (title !== undefined) updateData.title = title;
    if (rawContent !== undefined) updateData.rawContent = rawContent;
    if (meetingDate !== undefined) updateData.meetingDate = meetingDate ? new Date(meetingDate) : null;
    if (attendees !== undefined) updateData.attendees = attendees;
    if (proposalContent !== undefined) updateData.proposalContent = proposalContent;
    if (proposalStatus !== undefined) updateData.proposalStatus = proposalStatus;
    if (proposalRejectReason !== undefined) updateData.proposalRejectReason = proposalRejectReason;
    if (reqSpecContent !== undefined) updateData.reqSpecContent = reqSpecContent;
    if (reqSpecStatus !== undefined) updateData.reqSpecStatus = reqSpecStatus;
    if (reqSpecRejectReason !== undefined) updateData.reqSpecRejectReason = reqSpecRejectReason;

    const updated = await prisma.projectDocument.update({
      where: { id: docId },
      data: updateData,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return NextResponse.json({ success: false, error: "문서 수정 실패" }, { status: 500 });
  }
}

// 문서(회의록/기획서/요구사항정의서) 삭제 — 목록에서 완전히 제거.
// 검토요청 전(DRAFT)이거나 반려(REJECTED)된 문서만 지울 수 있다 — 검토중/승인된 문서는
// 이미 다음 단계(요구사항정의서/업무)의 근거가 됐을 수 있어 함부로 지우면 안 된다.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  try {
    const { session, error: authError } = await requireAuth();
    if (authError) return authError;

    const { docId } = await params;
    const doc = await prisma.projectDocument.findUnique({ where: { id: docId } });
    if (!doc) {
      return NextResponse.json({ success: false, error: "문서를 찾을 수 없습니다." }, { status: 404 });
    }
    // PATCH와 동일한 이유 — PM은 정리 차원에서 누구 문서든 지울 수 있지만, PM이 아니면 본인이
    // 시작한(또는 authorId가 없는 레거시) 문서만 지울 수 있다. 이 체크가 없으면 다른 사람의
    // 회의록/기획서를 임의로 삭제할 수 있었다(실제 보고된 취약점).
    if (session!.role !== "PM" && doc.authorId && doc.authorId !== session!.userId) {
      return NextResponse.json({ error: "다른 사용자의 문서입니다. 작성자 본인만 삭제할 수 있습니다." }, { status: 403 });
    }
    // 기획서/요구사항정의서 둘 중 하나라도 검토중(PENDING_REVIEW)이거나 승인(APPROVED)이면 삭제 불가
    if (!isUnlockedStatus(doc.proposalStatus) || !isUnlockedStatus(doc.reqSpecStatus)) {
      return NextResponse.json({ success: false, error: "검토 요청 중이거나 승인된 문서는 삭제할 수 없습니다." }, { status: 400 });
    }
    await prisma.projectDocument.delete({ where: { id: docId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: "문서 삭제 실패" }, { status: 500 });
  }
}
