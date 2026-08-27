import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/requireAuth";

// 이전엔 body의 userId를 그대로 믿었다 — 로그인한 누구든 남의 userId를 넣어 그 사람의
// 알림을 전부 읽음 처리할 수 있었다. 항상 세션의 본인 id만 사용한다.
export async function PATCH(request: NextRequest) {
  const { session, error: authError } = await requireAuth();
  if (authError) return authError;

  await prisma.notification.updateMany({
    where: { userId: session!.userId, read: false },
    data: { read: true },
  });

  return NextResponse.json({ success: true });
}
