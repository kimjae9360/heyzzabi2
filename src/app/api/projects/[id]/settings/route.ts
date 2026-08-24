import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 프로젝트 설정 탭 중 외부 연동(Slack/GitHub) 필드 전용 수정 라우트.
// 이름/설명 수정은 프로젝트 기본 라우트([id]/route.ts)의 PATCH가 담당한다.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { slackWebhookUrl, githubOwner, githubRepo } = await request.json();

    // 값이 undefined면 Prisma가 해당 필드를 건드리지 않고 그대로 둔다.
    // 반면 빈 문자열이 오면 실제로 빈 값으로 덮어써서 연동 해제(초기화)가 가능하다.
    const updated = await prisma.project.update({
      where: { id: (await params).id },
      data: {
        slackWebhookUrl,
        githubOwner,
        githubRepo,
      }
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    console.error("Project Settings Update Error:", error);
    return NextResponse.json(
      { error: "설정 저장에 실패했습니다." },
      { status: 500 }
    );
  }
}
