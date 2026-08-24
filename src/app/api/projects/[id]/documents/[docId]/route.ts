import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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

    // 이 요청이 끝난 뒤의 상태(같은 요청에서 상태를 함께 바꾸는 "직접수정→DRAFT로 되돌리기" 같은
    // 흐름은 허용해야 하므로, 요청에 상태값이 같이 왔으면 그 값을, 안 왔으면 현재 값을 기준으로 판단한다.
    const effectiveProposalStatus = proposalStatus ?? doc.proposalStatus;
    const effectiveReqSpecStatus = reqSpecStatus ?? doc.reqSpecStatus;

    if ((rawContent !== undefined || proposalContent !== undefined) && !isUnlockedStatus(effectiveProposalStatus)) {
      return NextResponse.json({ success: false, error: "검토 중이거나 승인된 기획서는 수정할 수 없습니다." }, { status: 400 });
    }
    if (reqSpecContent !== undefined && !isUnlockedStatus(effectiveReqSpecStatus)) {
      return NextResponse.json({ success: false, error: "검토 중이거나 승인된 요구사항정의서는 수정할 수 없습니다." }, { status: 400 });
    }

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
    const { docId } = await params;
    const doc = await prisma.projectDocument.findUnique({ where: { id: docId } });
    if (!doc) {
      return NextResponse.json({ success: false, error: "문서를 찾을 수 없습니다." }, { status: 404 });
    }
    if (!isUnlockedStatus(doc.proposalStatus) || !isUnlockedStatus(doc.reqSpecStatus)) {
      return NextResponse.json({ success: false, error: "검토 요청 중이거나 승인된 문서는 삭제할 수 없습니다." }, { status: 400 });
    }
    await prisma.projectDocument.delete({ where: { id: docId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: "문서 삭제 실패" }, { status: 500 });
  }
}
