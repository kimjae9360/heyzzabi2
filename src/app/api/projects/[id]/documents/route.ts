import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/requireAuth";

// AI 문서 파이프라인의 시작점: 회의록/메모 원본을 프로젝트에 저장한다.
// 이 시점에는 아직 기획서(proposal)/요구사항정의서(reqSpec)가 없으며,
// 이후 generate API가 이 rawContent를 근거로 기획서를 생성한다.
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const { session, error: authError } = await requireAuth();
    if (authError) return authError;

    const params = await props.params;
    const body = await request.json();
    const { title, rawContent, meetingDate, attendees } = body;

    // 회의록의 최소 요건: 제목과 본문 내용은 필수, 날짜/참석자는 선택값
    if (!title || !rawContent) {
      return NextResponse.json({ error: "제목과 내용을 입력해주세요." }, { status: 400 });
    }

    const doc = await prisma.projectDocument.create({
      data: {
        projectId: params.id,
        title,
        rawContent,
        // meetingDate/attendees는 선택 입력이므로 없으면 null로 저장
        meetingDate: meetingDate ? new Date(meetingDate) : null,
        attendees: attendees || null,
        // 이 회의록을 등록한 사람 — generate API가 이 값으로 "작성자 본인만 AI 생성 가능"을 판단한다.
        authorId: session!.userId,
      }
    });

    return NextResponse.json(doc);
  } catch (error) {
    return NextResponse.json({ error: "문서 생성 실패" }, { status: 500 });
  }
}
