import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notifyAllPMs } from "@/lib/notify";

// tasks/route.ts(일괄 수정)의 화이트리스트와 동일해야 한다 — 여기 없으면 "TODO" 같은 값이
// 그대로 저장돼서 칸반보드의 어느 컬럼에도 안 걸리는 유령 업무가 생긴다(QA에서 발견).
const VALID_TASK_STATUSES = ["BACKLOG", "PENDING_APPROVAL", "IN_PROGRESS", "DONE", "CANCELLED"];

// 업무 상세 화면에서 필드를 부분 수정할 때 쓰는 범용 PATCH.
// 담당자 자가보고(진행률/DONE 처리)와 PM의 상세 편집이 모두 이 경로를 거친다.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    // Extract updateable fields
    const { title, description, status, progress, wbsStart, wbsEnd, assigneeId, gitStatus, estimatedHours, assignmentReason } = body;

    if (status !== undefined && !VALID_TASK_STATUSES.includes(status)) {
      return NextResponse.json({ success: false, error: "잘못된 status 값입니다." }, { status: 400 });
    }

    // wbsStart/wbsEnd는 각각 독립적으로(부분 업데이트) 보내질 수 있어서, 요청에 실제로 온 값과
    // DB에 이미 있던 값을 합쳐서 "저장 후 최종 상태"가 start > end가 되는지 검증한다.
    // 이 검증이 없으면 시작일만 나중으로 옮기거나 종료일만 앞으로 당기는 식으로 둘 중 하나만
    // 바꿔도 뒤죽박죽인 일정이 그대로 저장돼서, 업무분배 탭의 간트 차트가 날짜 범위 계산
    // 중 배열 범위를 벗어나 화면이 죽는 사고로 이어졌다(실제로 발생 — 지연 업무 테스트 중
    // wbsEnd만 과거로 옮기고 wbsStart는 그대로 둬서 생긴 오염 데이터가 원인이었음).
    if (wbsStart !== undefined || wbsEnd !== undefined) {
      const current = await prisma.task.findUnique({ where: { id }, select: { wbsStart: true, wbsEnd: true } });
      const effectiveStart = wbsStart !== undefined ? (wbsStart ? new Date(wbsStart) : null) : current?.wbsStart ?? null;
      const effectiveEnd = wbsEnd !== undefined ? (wbsEnd ? new Date(wbsEnd) : null) : current?.wbsEnd ?? null;
      if (effectiveStart && effectiveEnd && effectiveStart > effectiveEnd) {
        return NextResponse.json({ success: false, error: "시작일은 종료일보다 늦을 수 없습니다." }, { status: 400 });
      }
    }

    // 요청에 실제로 포함된 필드만 updateData에 반영 — undefined 필드는 건드리지 않아
    // "일부 값만 보낸" 부분 업데이트 요청이 기존 값을 실수로 지우지 않게 한다.
    const updateData: any = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (status !== undefined) {
      updateData.status = status;
      // DONE 전환 시 완료 시각 기록, BACKLOG로 되돌아갈 때만 완료 시각을 초기화한다.
      // (PENDING_APPROVAL/IN_PROGRESS/CANCELLED로 바뀔 때는 completedAt을 건드리지 않음)
      if (status === "DONE") updateData.completedAt = new Date();
      else if (status === "BACKLOG") updateData.completedAt = null;
    }
    if (progress !== undefined) updateData.progress = Number(progress);
    if (wbsStart !== undefined) updateData.wbsStart = wbsStart ? new Date(wbsStart) : null;
    if (wbsEnd !== undefined) updateData.wbsEnd = wbsEnd ? new Date(wbsEnd) : null;
    // 담당자 선택 해제(빈 문자열)를 명시적 null로 변환 — Prisma FK 컬럼은 ""를 허용하지 않는다.
    if (assigneeId !== undefined) updateData.assigneeId = assigneeId || null;
    if (gitStatus !== undefined) updateData.gitStatus = gitStatus;
    if (estimatedHours !== undefined) updateData.estimatedHours = estimatedHours === null ? null : Number(estimatedHours);
    if (assignmentReason !== undefined) updateData.assignmentReason = assignmentReason;

    const updated = await prisma.task.update({
      where: { id },
      data: updateData,
    });

    if (status === "PENDING_APPROVAL") {
      await notifyAllPMs(`"${updated.title}" 업무 배분 승인 요청이 도착했습니다.`, { type: "info", link: "/approvals" });
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    // assigneeId가 존재하지 않는 유저를 가리키면 Prisma가 FK 제약(P2003)으로 던진다 —
    // 그대로 흘려보내면 원인 불명 500이 되니 여기서 잡아 400으로 명확히 응답한다(QA에서 발견).
    if (error?.code === "P2003") {
      return NextResponse.json({ success: false, error: "존재하지 않는 담당자입니다." }, { status: 400 });
    }
    console.error("Task patch error:", error);
    return NextResponse.json({ success: false, error: "Failed to update task" }, { status: 500 });
  }
}

// 업무를 완전히 삭제(하드 delete) — 상태 이력이나 반려 사유 등은 복구할 수 없다.
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.task.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: "Failed to delete task" }, { status: 500 });
  }
}