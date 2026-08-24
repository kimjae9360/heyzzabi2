import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const params = await props.params;
    const body = await request.json();
    const { title, rawContent, meetingDate, attendees } = body;

    if (!title || !rawContent) {
      return NextResponse.json({ error: "제목과 내용을 입력해주세요." }, { status: 400 });
    }

    const doc = await prisma.projectDocument.create({
      data: {
        projectId: params.id,
        title,
        rawContent,
        meetingDate: meetingDate ? new Date(meetingDate) : null,
        attendees: attendees || null,
      }
    });

    return NextResponse.json(doc);
  } catch (error) {
    return NextResponse.json({ error: "문서 생성 실패" }, { status: 500 });
  }
}
