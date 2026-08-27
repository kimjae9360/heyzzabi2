import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requirePM } from "@/lib/requireAuth";

// 프로젝트 상세 조회 — 업무 목록(담당자 포함)과 첨부 문서까지 함께 내려준다.
// assignee는 필요한 필드만 select해서 비밀번호 같은 민감 정보가 응답에 섞이지 않게 한다.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error: authError } = await requireAuth();
    if (authError) return authError;

    const { id } = await params;
    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        tasks: {
          include: {
            assignee: {
              select: { id: true, name: true, email: true }
            }
          },
          orderBy: { createdAt: "desc" }
        },
        documents: {
          orderBy: { createdAt: "desc" },
          include: { author: { select: { id: true, name: true, email: true } } },
        },
        assigneeRecommendations: {
          orderBy: { createdAt: "desc" }
        },
      }
    });

    if (!project) {
      return NextResponse.json({ success: false, error: "Project not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: project });
  } catch (error: any) {
    console.error("Project fetch error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch project" }, { status: 500 });
  }
}

// 프로젝트 설정 탭의 프로젝트명/설명 수정 — Slack/GitHub 연동 필드는 별도의 settings 라우트가 담당한다.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error: authError } = await requirePM();
    if (authError) return authError;

    const { id } = await params;
    const { name, description } = await request.json();

    if (name !== undefined && !name.trim()) {
      return NextResponse.json({ success: false, error: "프로젝트명은 비워둘 수 없습니다." }, { status: 400 });
    }

    // 요청 바디에 아예 포함되지 않은 필드(undefined)는 spread로 건너뛰어 기존 값을 유지하고,
    // 명시적으로 보낸 필드만 부분 수정(partial update)한다.
    const updated = await prisma.project.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description: description || null }),
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    console.error("Project update error:", error);
    return NextResponse.json({ success: false, error: "프로젝트 수정에 실패했습니다." }, { status: 500 });
  }
}