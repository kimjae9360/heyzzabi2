import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 단일 사용자의 상세 프로필을 조회한다. password는 select에서 제외해 응답에 절대 포함하지 않는다.
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
        phone: true, department: true, employeeNo: true, position: true, jobTitle: true, status: true, hireDate: true, resignDate: true,
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

// 사용자 프로필(인사정보 포함) 부분 수정. 요청에 실제로 담긴 필드만 골라서 업데이트한다.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const {
      techStack, certifications, pastProjects, phone, department, role, name,
      employeeNo, position, jobTitle, status, hireDate, resignDate,
    } = await request.json();

    // 퇴사일은 두 경로로 채워진다: (1) 수정 모달에서 직접 날짜를 입력하면 그 값을 그대로 쓰고,
    // (2) 목록의 상태 드롭다운에서 곧바로 "퇴사"로 바꾸면(직접 입력값이 없으면) 오늘 날짜로 자동 기록한다.
    // 반대로 퇴사 상태에서 다른 상태로 되돌리면(직접 지정이 없는 한) 기존 퇴사일을 지워 낡은 값이 남지 않게 한다.
    let resignDateUpdate: Date | null | undefined = undefined;
    if (resignDate !== undefined) {
      resignDateUpdate = resignDate ? new Date(resignDate) : null;
    } else if (status !== undefined) {
      const current = await prisma.user.findUnique({ where: { id }, select: { status: true, resignDate: true } });
      if (current) {
        if (status === "RESIGNED" && !current.resignDate) resignDateUpdate = new Date();
        else if (status !== "RESIGNED" && current.status === "RESIGNED") resignDateUpdate = null;
      }
    }

    // `필드 !== undefined` 스프레드 패턴: body에 아예 포함되지 않은 필드는 건드리지 않고,
    // 명시적으로 보낸 필드만 data 객체에 넣어 부분 업데이트(partial update)를 구현한다.
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
        // 빈 문자열이 오면 DB에는 unique 제약이 걸린 employeeNo를 ""로 저장하지 않고 null로 정규화한다.
        ...(employeeNo !== undefined && { employeeNo: employeeNo || null }),
        ...(position !== undefined && { position }),
        ...(jobTitle !== undefined && { jobTitle }),
        ...(status !== undefined && { status }),
        ...(hireDate !== undefined && { hireDate: hireDate ? new Date(hireDate) : null }),
        ...(resignDateUpdate !== undefined && { resignDate: resignDateUpdate }),
      },
      select: {
        id: true, name: true, role: true, techStack: true, certifications: true, pastProjects: true,
        phone: true, department: true, employeeNo: true, position: true, jobTitle: true, status: true, hireDate: true, resignDate: true,
      }
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: "프로필 수정 실패" }, { status: 500 });
  }
}