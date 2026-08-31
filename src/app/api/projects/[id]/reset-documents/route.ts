import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePM } from "@/lib/requireAuth";

// 설정 화면의 "문서생성 리스트 초기화" — 데모/테스트 용도로 이 프로젝트의 회의록·기획서·
// 요구사항정의서(ProjectDocument 전체)와, 거기서 파생된 업무(Task)·담당자 추천 이력을
// 한 번에 지운다. sourceDocumentId/taskId는 FK 관계가 아니라 문자열 참조라(documentTemplates,
// schema.prisma 주석 참고) DB 제약 위반 없이 지울 수 있지만, 문서만 지우고 업무를 남겨두면
// "누구 업무인지 알 수 없는" 고아 데이터가 남는다 — 2026-08-25에 고쳤던 것과 같은 문제가
// 재발하지 않도록 관련 데이터를 함께 지운다. 되돌릴 수 없는 파괴적 동작이라 PM 전용이고,
// 프론트에서도 확인창을 거친다.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error: authError } = await requirePM();
    if (authError) return authError;

    const { id: projectId } = await params;

    const [{ count: taskCount }, { count: recommendationCount }, { count: documentCount }] =
      await prisma.$transaction([
        prisma.task.deleteMany({ where: { projectId } }),
        prisma.assigneeRecommendation.deleteMany({ where: { projectId } }),
        prisma.projectDocument.deleteMany({ where: { projectId } }),
      ]);

    return NextResponse.json({ success: true, documentCount, taskCount, recommendationCount });
  } catch (error) {
    console.error("Reset documents error:", error);
    return NextResponse.json({ success: false, error: "초기화 실패" }, { status: 500 });
  }
}
