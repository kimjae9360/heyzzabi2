import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePM } from "@/lib/requireAuth";

// 실제 OpenAI 호출 없이 하드코딩된 목업 데이터로 동작하는 구버전 라우트다.
// 실제 운영 파이프라인은 src/app/api/projects/[id]/documents/[docId]/extract-tasks 를 사용하며,
// 그쪽은 승인된 요구사항정의서 + 실제 AI 호출로 업무를 생성한다. 여기는 UI 데모/초기 개발 단계의
// 잔재로 보이므로 새 기능을 붙일 때는 이 라우트가 아니라 위 실제 파이프라인을 참고할 것.
// (여전히 숨김 페이지 AI 관리센터에서 호출되므로 삭제하진 않되, 로그인 없이 아무나 Task를
// 대량 생성할 수 있었던 문제는 다른 업무 생성 경로와 같은 수준(PM)으로 막는다.)
export async function POST(req: Request) {
  try {
    const { error: authError } = await requirePM();
    if (authError) return authError;

    const { projectId, documentId, promptContext } = await req.json();

    if (!projectId) {
      return NextResponse.json({ error: "프로젝트 ID가 필요합니다." }, { status: 400 });
    }

    // 1. 문서 내용 가져오기 (실제로는 documentId로 조회)
    let textToAnalyze = "샘플 요구사항: 메인 대시보드 UI를 개발하고, 사용자 로그인 화면을 구축하며, AI 업무 추출 API를 연동해야 합니다.";

    if (documentId) {
      const doc = await prisma.projectDocument.findUnique({ where: { id: documentId } });
      if (doc) {
        // 원문(rawContent) -> 승인용 요구사항정의서 -> 제안서 순으로 있는 것을 사용
        textToAnalyze = doc.rawContent || doc.reqSpecContent || doc.proposalContent || textToAnalyze;
      }
    }

    // 2. OpenAI 연동 (현재는 Mock 처리, API_KEY가 있으면 실제 호출 가능하도록 구조화)
    // const { OpenAI } = require("openai");
    // const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // 강제 Mock 데이터 (OpenAI 응답 시뮬레이션) — textToAnalyze는 실제로 사용되지 않고
    // 아래 mockExtractedTasks가 항상 그대로 반환된다.
    await new Promise(r => setTimeout(r, 2500)); // 2.5초 대기 (AI 분석 시간 시뮬레이션)

    const mockExtractedTasks = [
      { title: "메인 대시보드 UI 기획 및 디자인", description: "Figma를 활용하여 대시보드 화면 구성 요소 디자인", difficulty: "MEDIUM", wbsEnd: new Date(Date.now() + 86400000 * 3) },
      { title: "로그인 페이지 프론트엔드 구현", description: "React hook form을 사용하여 로그인 폼 상태 관리 및 UI 적용", difficulty: "HARD", wbsEnd: new Date(Date.now() + 86400000 * 5) },
      { title: "AI 업무 추출 API 백엔드 개발", description: "OpenAI API를 활용하여 요구사항에서 Task를 분리하는 라우트 작성", difficulty: "HARD", wbsEnd: new Date(Date.now() + 86400000 * 7) }
    ];

    // 3. 추출된 Task를 DB에 저장 (목업이지만 실제 Task 레코드는 생성된다)
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
