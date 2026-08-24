import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true, name: true, email: true, role: true, techStack: true, certifications: true, pastProjects: true,
        phone: true, department: true, employeeNo: true, position: true, jobTitle: true, status: true, hireDate: true,
      }
    });
    if (!user) {
      return NextResponse.json({ success: false, error: "사용자를 찾을 수 없습니다." }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: user });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: "프로필 조회 실패" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const {
      techStack, certifications, pastProjects, phone, department, role, name,
      employeeNo, position, jobTitle, status, hireDate,
    } = await request.json();

    const updated = await prisma.user.update({
      where: { id },
      data: {
        ...(techStack !== undefined && { techStack }),
        ...(certifications !== undefined && { certifications }),
        ...(pastProjects !== undefined && { pastProjects }),
        ...(phone !== undefined && { phone }),
        ...(department !== undefined && { department }),
        ...(role !== undefined && { role }),
        ...(name !== undefined && { name }),
        ...(employeeNo !== undefined && { employeeNo: employeeNo || null }),
        ...(position !== undefined && { position }),
        ...(jobTitle !== undefined && { jobTitle }),
        ...(status !== undefined && { status }),
        ...(hireDate !== undefined && { hireDate: hireDate ? new Date(hireDate) : null }),
      },
      select: {
        id: true, name: true, role: true, techStack: true, certifications: true, pastProjects: true,
        phone: true, department: true, employeeNo: true, position: true, jobTitle: true, status: true, hireDate: true,
      }
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: "프로필 수정 실패" }, { status: 500 });
  }
}