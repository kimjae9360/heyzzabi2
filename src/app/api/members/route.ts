import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 전체 멤버(계정) 목록 조회.
export async function GET() {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
    });

    // Sanitize output
    // 비밀번호(해시) 필드는 클라이언트로 절대 내려보내지 않도록 응답 전에 제거한다.
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

// 관리자가 이메일만으로 새 멤버 계정을 발급한다(초대 방식).
// 임시 비밀번호로 계정을 만들고 mustChangePassword 플래그를 세워두면,
// 해당 사용자가 최초 로그인 시 비밀번호를 반드시 바꾸도록 강제하는 흐름으로 이어진다.
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
        role: role || "MEMBER", // role을 지정하지 않으면 일반 팀원(MEMBER)으로 생성
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
