import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const { email, password, name, department, phone, techStack, certifications, pastProjects } = await request.json();

    if (!email || !password || !name) {
      return NextResponse.json(
        { error: "필수 정보(이메일, 비밀번호, 이름)가 누락되었습니다." },
        { status: 400 }
      );
    }

    const user = await prisma.user.update({
      where: { email },
      data: {
        password, // Should be hashed in production
        name,
        department,
        phone,
        techStack,
        certifications,
        pastProjects,
        mustChangePassword: false, // Onboarding complete
      },
    });

    const { password: _, ...userWithoutPassword } = user;
    return NextResponse.json(userWithoutPassword);
  } catch (error) {
    console.error("Onboarding error:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
