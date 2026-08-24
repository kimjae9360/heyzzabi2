import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const FIELD = { proposal: "proposalStatus", reqSpec: "reqSpecStatus" } as const;
const CONTENT_FIELD = { proposal: "proposalContent", reqSpec: "reqSpecContent" } as const;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  try {
    const { docId } = await params;
    const { type } = await request.json();

    if (type !== "proposal" && type !== "reqSpec") {
      return NextResponse.json({ error: "type은 proposal 또는 reqSpec이어야 합니다." }, { status: 400 });
    }

    const doc = await prisma.projectDocument.findUnique({ where: { id: docId } });
    if (!doc) {
      return NextResponse.json({ error: "문서를 찾을 수 없습니다." }, { status: 404 });
    }
    if (!doc[CONTENT_FIELD[type]]) {
      return NextResponse.json({ error: "생성된 내용이 없어 검토 요청을 보낼 수 없습니다." }, { status: 400 });
    }

    const updated = await prisma.projectDocument.update({
      where: { id: docId },
      data: { [FIELD[type]]: "PENDING_REVIEW" },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: "검토 요청 실패" }, { status: 500 });
  }
}
