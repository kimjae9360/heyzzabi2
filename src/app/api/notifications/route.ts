import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/requireAuth";

// 예전엔 서버 세션이 없어 클라이언트가 보낸 userId 쿼리를 그대로 믿었다 — 로그인 없이도,
// 혹은 로그인해서도 남의 userId를 넣으면 그 사람의 알림을 그대로 읽을 수 있었다(실제 버그).
// 세션이 생긴 지금은 쿼리의 userId를 무시하고 항상 로그인한 본인 것만 조회한다.
export async function GET(request: NextRequest) {
  const { session, error: authError } = await requireAuth();
  if (authError) return authError;

  const notifications = await prisma.notification.findMany({
    where: { userId: session!.userId },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  return NextResponse.json({ success: true, data: notifications });
}
