import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/passwordHash";
import { requireAuth, requirePM } from "@/lib/requireAuth";

// 전체 직원 목록 조회 (관리/멤버 관리 화면용). select로 password를 명시적으로 제외해 응답에 노출되지 않게 한다.
export async function GET() {
  try {
    const { error: authError } = await requireAuth();
    if (authError) return authError;

    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        department: true,
        techStack: true,
        certifications: true,
        pastProjects: true,
        phone: true,
        employeeNo: true,
        position: true,
        jobTitle: true,
        status: true,
        hireDate: true,
        resignDate: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ success: true, data: users });
  } catch (error: any) {
    console.error("Users fetch error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch users" }, { status: 500 });
  }
}

// 관리자가 새 직원 계정을 생성한다 (아이디만 입력받고 이메일은 서버가 조립).
export async function POST(request: Request) {
  try {
    const { error: authError } = await requirePM();
    if (authError) return authError;

    const { username, name, department, position, jobTitle, employeeNo, hireDate } = await request.json();

    if (!username) {
      return NextResponse.json({ error: "아이디를 입력해주세요." }, { status: 400 });
    }

    // 로그인용 email은 회사 도메인을 붙여 서버에서 자동 생성한다 (사용자는 아이디만 입력).
    const email = `${username}@heyzzabi.com`;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "이미 존재하는 아이디입니다." }, { status: 400 });
    }

    const user = await prisma.user.create({
      data: {
        email,
        name: name || username,
        // 초기 비밀번호는 고정값("1111")으로 발급하고, mustChangePassword로 최초 로그인 시
        // 반드시 온보딩(비밀번호 변경)을 거치도록 강제한다. DB에는 해시로만 저장한다.
        password: await hashPassword("1111"),
        role: "EMPLOYEE",
        status: "ACTIVE",
        mustChangePassword: true,
        department: department || null,
        position: position || null,
        jobTitle: jobTitle || null,
        employeeNo: employeeNo || null,
        hireDate: hireDate ? new Date(hireDate) : null,
      },
      select: {
        id: true, name: true, email: true, role: true, status: true,
        department: true, position: true, jobTitle: true, employeeNo: true, hireDate: true,
      }
    });

    return NextResponse.json({ success: true, data: user });
  } catch (error: any) {
    console.error("Create user error:", error);
    return NextResponse.json({ success: false, error: "직원 생성 실패" }, { status: 500 });
  }
}