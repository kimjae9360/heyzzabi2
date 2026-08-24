import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import OpenAI from "openai";

// FR-05-014/015: 승인된 요구사항정의서를 기반으로 3~7개의 업무를 자동 생성한다.
// 각 업무는 업무명/설명/예상 소요시간/난이도/난이도 판단 근거를 갖는다.
export async function POST(
  request: NextRequest,
  props: { params: Promise<{ id: string; docId: string }> }
) {
  try {
    // 모듈 스코프에서 만들면 빌드 시점 페이지 데이터 수집 단계에 환경변수가 없을 때 빌드가 깨진다
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const params = await props.params;

    const doc = await prisma.projectDocument.findUnique({ where: { id: params.docId } });
    if (!doc || !doc.reqSpecContent) {
      return NextResponse.json({ error: "요구사항정의서가 없습니다." }, { status: 400 });
    }
    if (doc.reqSpecStatus !== "APPROVED") {
      return NextResponse.json({ error: "요구사항정의서가 승인된 이후에 업무를 생성할 수 있습니다." }, { status: 400 });
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content:
            "당신은 요구사항정의서를 실행 가능한 업무(Task) 단위로 분해하는 어시스턴트입니다.\n\n" +
            "[절대 규칙] 요구사항정의서에 없는 기능을 지어내지 마라. 3개 이상 7개 이하의 업무로 나눈다.\n\n" +
            "다음 JSON 스키마로만 응답하라 (다른 텍스트 금지):\n" +
            `{"tasks": [{"title": "업무명", "description": "상세 설명", "difficulty": "낮음|보통|높음", "difficultyReason": "난이도 판단 근거 한 문장", "estimatedHours": 숫자(시간 단위)}]}`
        },
        { role: "user", content: doc.reqSpecContent }
      ],
    });

    const parsed = JSON.parse(completion.choices[0].message.content || "{}");
    const tasksData: any[] = Array.isArray(parsed.tasks) ? parsed.tasks : [];

    if (tasksData.length === 0) {
      return NextResponse.json({ error: "AI가 업무를 생성하지 못했습니다." }, { status: 500 });
    }

    const createdTasks = await Promise.all(
      tasksData.map((task) =>
        prisma.task.create({
          data: {
            title: task.title || "제목 없음",
            description: task.description || "",
            status: "BACKLOG",
            difficulty: task.difficulty || "보통",
            difficultyReason: task.difficultyReason || null,
            estimatedHours: typeof task.estimatedHours === "number" ? task.estimatedHours : null,
            progress: 0,
            projectId: params.id,
            sourceDocumentId: params.docId,
          },
        })
      )
    );

    return NextResponse.json({ success: true, count: createdTasks.length, tasks: createdTasks });
  } catch (error: any) {
    console.error("Task Extraction Error:", error);
    return NextResponse.json({ error: "업무 생성 실패: " + error.message }, { status: 500 });
  }
}
