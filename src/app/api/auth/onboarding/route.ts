import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/passwordHash";
import { requireAuth } from "@/lib/requireAuth";

// 최초 로그인 후 온보딩 처리: 임시 비밀번호를 사용자가 직접 정한 값으로 바꾸고 프로필 정보를 채운다.
export async function POST(request: Request) {
  try {
    const { session, error: authError } = await requireAuth();
    if (authError) return authError;

    const { password, name, department, phone, techStack, certifications, pastProjects } = await request.json();

    if (!password || !name) {
      return NextResponse.json(
        { error: "필수 정보(비밀번호, 이름)가 누락되었습니다." },
        { status: 400 }
      );
    }

    // 예전엔 클라이언트가 보낸 email로 대상을 찾았는데, 로그인 여부만 확인하고 email 자체는
    // 검증하지 않아서 다른 사람 email을 넣어 그 계정의 비밀번호/프로필을 덮어쓸 수 있는
    // 계정 탈취 경로였다(발견 즉시 수정) — 세션의 userId로만 대상을 찾도록 바꾼다.
    const user = await prisma.user.update({
      where: { id: session!.userId },
      data: {
        password: await hashPassword(password),
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
