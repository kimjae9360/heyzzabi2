import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requirePM } from "@/lib/requireAuth";
import { hashPassword } from "@/lib/passwordHash";

// 이 라우트는 실제로는 어느 화면에서도 호출되지 않는다 — 멤버 목록/생성은 전부
// /api/users를 쓴다. 그런데도 로그인 검사가 전혀 없어서(과거 버그) 아무나 URL만 알면
// role까지 자유롭게 지정해 계정을 만들 수 있었다(예: {email, role:"PM"}). 실사용 경로가
// 아니라 지워도 되지만, 혹시 남아있는 참조에 대비해 /api/users와 같은 수준으로 막아둔다.
// 전체 멤버(계정) 목록 조회.
export async function GET() {
  try {
    const { error: authError } = await requireAuth();
    if (authError) return authError;

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
    const { error: authError } = await requirePM();
    if (authError) return authError;

    const { email } = await request.json();

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
        password: await hashPassword("temp"), // Default temp password — 평문 저장 금지
        name: "",
        // role은 항상 EMPLOYEE로 발급한다 — 요청 바디값을 그대로 믿으면 PM이 아닌
        // 호출자도 role:"PM"을 보내 자기 자신을 관리자로 만들 수 있었다(실제 버그).
        role: "EMPLOYEE",
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
