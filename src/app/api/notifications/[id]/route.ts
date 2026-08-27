import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/requireAuth";

// 알림 하나를 읽음 처리 — 목록에서 항목을 클릭했을 때 호출된다.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { session, error: authError } = await requireAuth();
    if (authError) return authError;

    const { id } = await params;
    // 로그인만 확인하고 소유자 확인 없이 id로 바로 업데이트하면, 남의 알림 id를 알아내
    // 그 사람 알림을 읽음 처리할 수 있다 — 본인 알림일 때만 처리한다.
    const notification = await prisma.notification.findUnique({ where: { id } });
    if (!notification || notification.userId !== session!.userId) {
      return NextResponse.json({ success: false, error: "알림을 찾을 수 없습니다." }, { status: 404 });
    }
    const updated = await prisma.notification.update({
      where: { id },
      data: { read: true },
    });
    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: "알림 읽음 처리 실패" }, { status: 500 });
  }
}
