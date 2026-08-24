import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 특정 사용자의 시스템 권한(PM/EMPLOYEE)을 변경한다.
// 주의: 이 라우트 자체에는 "요청자가 관리자/PM인지" 검증하는 로직이 없다 — 호출하는 화면(UI) 쪽에서만
// 접근을 제한하고 있으므로, API를 직접 호출하면 누구나 권한을 바꿀 수 있는 상태다.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { role } = await request.json();

    if (!role) {
      return NextResponse.json({ error: "Role is required" }, { status: 400 });
    }

    const updatedUser = await prisma.user.update({
      where: { id: (await params).id },
      data: { role },
      select: { id: true, name: true, role: true }
    });

    return NextResponse.json({ success: true, data: updatedUser });
  } catch (error: any) {
    console.error("User Role Update Error:", error);
    return NextResponse.json(
      { error: "역할 변경에 실패했습니다." },
      { status: 500 }
    );
  }
}
