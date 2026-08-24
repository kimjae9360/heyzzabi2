import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { slackWebhookUrl, githubOwner, githubRepo } = await request.json();

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
