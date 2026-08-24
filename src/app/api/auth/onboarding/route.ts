import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 최초 로그인 후 온보딩 처리: 임시 비밀번호를 사용자가 직접 정한 값으로 바꾸고 프로필 정보를 채운다.
export async function POST(request: Request) {
  try {
    const { email, password, name, department, phone, techStack, certifications, pastProjects } = await request.json();

    if (!email || !password || !name) {
      return NextResponse.json(
        { error: "필수 정보(이메일, 비밀번호, 이름)가 누락되었습니다." },
        { status: 400 }
      );
    }

    // 온보딩 시점에는 아직 세션/id가 없고 로그인 때 받은 email만 알고 있으므로 email로 조회한다.
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
