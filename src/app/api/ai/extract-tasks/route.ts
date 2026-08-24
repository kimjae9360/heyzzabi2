import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const { projectId, documentId, promptContext } = await req.json();

    if (!projectId) {
      return NextResponse.json({ error: "프로젝트 ID가 필요합니다." }, { status: 400 });
    }

    // 1. 문서 내용 가져오기 (실제로는 documentId로 조회)
    let textToAnalyze = "샘플 요구사항: 메인 대시보드 UI를 개발하고, 사용자 로그인 화면을 구축하며, AI 업무 추출 API를 연동해야 합니다.";
    
    if (documentId) {
      const doc = await prisma.projectDocument.findUnique({ where: { id: documentId } });
      if (doc) {
        textToAnalyze = doc.rawContent || doc.reqSpecContent || doc.proposalContent || textToAnalyze;
      }
    }

    // 2. OpenAI 연동 (현재는 Mock 처리, API_KEY가 있으면 실제 호출 가능하도록 구조화)
    // const { OpenAI } = require("openai");
    // const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    
    // 강제 Mock 데이터 (OpenAI 응답 시뮬레이션)
    await new Promise(r => setTimeout(r, 2500)); // 2.5초 대기 (AI 분석 시간 시뮬레이션)

    const mockExtractedTasks = [
      { title: "메인 대시보드 UI 기획 및 디자인", description: "Figma를 활용하여 대시보드 화면 구성 요소 디자인", difficulty: "MEDIUM", wbsEnd: new Date(Date.now() + 86400000 * 3) },
      { title: "로그인 페이지 프론트엔드 구현", description: "React hook form을 사용하여 로그인 폼 상태 관리 및 UI 적용", difficulty: "HARD", wbsEnd: new Date(Date.now() + 86400000 * 5) },
      { title: "AI 업무 추출 API 백엔드 개발", description: "OpenAI API를 활용하여 요구사항에서 Task를 분리하는 라우트 작성", difficulty: "HARD", wbsEnd: new Date(Date.now() + 86400000 * 7) }
    ];

    // 3. 추출된 Task를 DB에 저장
    const createdTasks = await Promise.all(
      mockExtractedTasks.map(t => 
        prisma.task.create({
          data: {
            title: t.title,
            description: t.description,
            status: "BACKLOG",
            difficulty: t.difficulty,
            wbsEnd: t.wbsEnd,
            projectId: projectId,
            progress: 0
          }
        })
      )
    );

    return NextResponse.json({ 
      success: true, 
      message: "성공적으로 업무를 추출했습니다.",
      tasks: createdTasks 
    });

  } catch (error: any) {
    console.error("Task Extraction Error:", error);
    return NextResponse.json(
      { error: "AI 분석 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
