import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
