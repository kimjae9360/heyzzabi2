import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePM } from "@/lib/requireAuth";

// 특정 사용자의 시스템 권한(PM/EMPLOYEE)을 변경한다. PM만 가능 — requirePM으로 서버에서 검증한다
// (예전엔 UI에서만 막아서 API를 직접 호출하면 누구나 자기 자신을 PM으로 올릴 수 있었다).
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error: authError } = await requirePM();
    if (authError) return authError;

    const { role } = await request.json();

    if (role !== "PM" && role !== "EMPLOYEE") {
      return NextResponse.json({ error: "role은 PM 또는 EMPLOYEE여야 합니다." }, { status: 400 });
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
