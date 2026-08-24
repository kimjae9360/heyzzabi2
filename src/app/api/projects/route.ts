import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const data = await request.json();
    const { name, description, startDate, endDate, tasks } = data;

    if (!name) {
      return NextResponse.json({ error: "프로젝트 이름은 필수입니다." }, { status: 400 });
    }

    // Create Project and nested Tasks in one transaction
    const project = await prisma.project.create({
      data: {
        name,
        description,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        tasks: {
          create: tasks.map((t: any) => ({
            title: t.title,
            description: t.description,
            difficulty: t.difficulty || "MEDIUM",
            status: "BACKLOG",
          })),
        },
      },
      include: {
        tasks: true,
      },
    });

    return NextResponse.json(project);
  } catch (error: any) {
    console.error("Create Project Error:", error);
    return NextResponse.json(
      { error: error.message || "프로젝트 생성 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const projects = await prisma.project.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: { tasks: true }
        }
      }
    });
    return NextResponse.json(projects);
  } catch (error: any) {
    return NextResponse.json(
      { error: "프로젝트 목록을 가져오는데 실패했습니다." },
      { status: 500 }
    );
  }
}
