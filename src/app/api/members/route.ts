import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
    });
    
    // Sanitize output
    const safeUsers = users.map(u => {
      const { password, ...rest } = u;
      return rest;
    });

    return NextResponse.json(safeUsers);
  } catch (error) {
    console.error("Fetch members error:", error);
    return NextResponse.json(
      { error: "멤버 목록을 가져오는데 실패했습니다." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { email, role } = await request.json();

    if (!email) {
      return NextResponse.json({ error: "이메일은 필수입니다." }, { status: 400 });
    }

    // Check if exists
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "이미 존재하는 계정입니다." }, { status: 400 });
    }

    const user = await prisma.user.create({
      data: {
        email,
        password: "temp", // Default temp password
        name: "",
        role: role || "MEMBER",
        mustChangePassword: true,
      },
    });

    const { password, ...safeUser } = user;
    return NextResponse.json(safeUser);
  } catch (error) {
    console.error("Create member error:", error);
    return NextResponse.json(
      { error: "계정 생성에 실패했습니다." },
      { status: 500 }
    );
  }
}
