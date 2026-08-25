import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseAgentConfig } from "@/lib/agentConfig";
import { requirePM } from "@/lib/requireAuth";

// 프로젝트 설정 탭 중 외부 연동(Slack/GitHub)과 에이전트 세부 설정 수정 라우트.
// 이름/설명 수정은 프로젝트 기본 라우트([id]/route.ts)의 PATCH가 담당한다.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error: authError } = await requirePM();
    if (authError) return authError;

    const { slackWebhookUrl, githubOwner, githubRepo, agentConfig } = await request.json();

    // 값이 undefined면 Prisma가 해당 필드를 건드리지 않고 그대로 둔다.
    // 반면 빈 문자열이 오면 실제로 빈 값으로 덮어써서 연동 해제(초기화)가 가능하다.
    const updated = await prisma.project.update({
      where: { id: (await params).id },
      data: {
        slackWebhookUrl,
        githubOwner,
        githubRepo,
        // parseAgentConfig가 범위를 벗어난 값(특히 temperature)을 항상 clamp하므로,
        // 요청 바디를 그대로 신뢰하지 않고 한 번 걸러서 저장한다 — 화면 슬라이더를 우회해도 안전.
        ...(agentConfig !== undefined ? { agentConfig: JSON.stringify(parseAgentConfig(JSON.stringify(agentConfig))) } : {}),
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
