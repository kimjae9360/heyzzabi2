import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 이 앱은 서버 세션이 없고 클라이언트(useAuth)가 이미 아는 user.id를 쿼리로 넘기는 방식을
// 다른 라우트(예: /api/tasks?assigneeId=)에서도 그대로 쓰고 있어 여기서도 같은 패턴을 따른다.
export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "userId는 필수입니다." }, { status: 400 });
  }

  const notifications = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  return NextResponse.json({ success: true, data: notifications });
}
