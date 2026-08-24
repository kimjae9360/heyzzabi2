import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const FIELD = { proposal: "proposalStatus", reqSpec: "reqSpecStatus" } as const;
const REASON_FIELD = { proposal: "proposalRejectReason", reqSpec: "reqSpecRejectReason" } as const;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  try {
    const { docId } = await params;
    const { type } = await request.json() as { type: string };

    if (type !== "proposal" && type !== "reqSpec") {
      return NextResponse.json({ error: "type은 proposal 또는 reqSpec이어야 합니다." }, { status: 400 });
    }

    const updated = await prisma.projectDocument.update({
      where: { id: docId },
      data: { [FIELD[type]]: "APPROVED", [REASON_FIELD[type]]: null },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: "승인 처리 실패" }, { status: 500 });
  }
}
