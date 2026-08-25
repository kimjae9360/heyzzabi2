import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 알림 하나를 읽음 처리 — 목록에서 항목을 클릭했을 때 호출된다.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const updated = await prisma.notification.update({
      where: { id },
      data: { read: true },
    });
    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: "알림 읽음 처리 실패" }, { status: 500 });
  }
}
