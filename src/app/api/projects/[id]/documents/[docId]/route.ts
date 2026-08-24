import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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

// 문서(회의록/기획서/요구사항정의서) 삭제 — 목록에서 완전히 제거
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  try {
    const { docId } = await params;
    await prisma.projectDocument.delete({ where: { id: docId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: "문서 삭제 실패" }, { status: 500 });
  }
}
