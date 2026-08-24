import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
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

export async function POST(request: Request) {
  try {
    const { username, name, department, position, jobTitle, employeeNo, hireDate } = await request.json();

    if (!username) {
      return NextResponse.json({ error: "아이디를 입력해주세요." }, { status: 400 });
    }

    const email = `${username}@heyzzabi.com`;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "이미 존재하는 아이디입니다." }, { status: 400 });
    }

    const user = await prisma.user.create({
      data: {
        email,
        name: name || username,
        password: "1111",
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