import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePM } from "@/lib/requireAuth";

// 새 프로젝트를 생성한다. AI가 초안으로 뽑아준 업무 목록(tasks)이 함께 넘어오면
// 프로젝트 생성과 동시에 업무들도 한 번에 만들어준다.
export async function POST(request: Request) {
  try {
    const { error: authError } = await requirePM();
    if (authError) return authError;

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
        // nested create: 프로젝트 row와 업무 row들을 하나의 트랜잭션으로 묶어서
        // 생성 도중 실패해도 프로젝트만 만들어지고 업무가 누락되는 상황을 막는다.
        // 새로 생성되는 업무는 항상 파이프라인의 첫 단계인 BACKLOG 상태에서 시작한다.
        tasks: {
          create: (tasks || []).map((t: any) => ({
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

// 전체 프로젝트 목록(최신순)을 반환한다. 이 앱은 기본적으로 "단일 프로젝트 전제"로
// 동작하지만(다른 화면에서는 대부분 projects[0]만 사용), 이 엔드포인트 자체는
// 프로젝트 목록/생성 이력을 확인할 때 쓰인다. _count로 매 프로젝트의 업무 수만
// 가볍게 가져오고 업무 상세는 포함하지 않는다.
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
