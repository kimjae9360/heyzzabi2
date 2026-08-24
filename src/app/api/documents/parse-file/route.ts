import { NextRequest, NextResponse } from "next/server";

// mammoth/pdf-parse가 Buffer 등 Node.js API를 사용하므로 Edge 런타임이 아닌
// Node.js 런타임을 명시적으로 지정해야 한다
export const runtime = "nodejs";

// 회의록 업로드 화면에서 쓰이는 파일 업로드→텍스트 추출 엔드포인트.
// 여기서 뽑아낸 텍스트가 documents(회의록 생성) API의 rawContent로 들어가
// AI 문서 파이프라인의 원본 입력이 된다.
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "파일이 없습니다." }, { status: 400 });
    }

    const name = file.name.toLowerCase();
    const buffer = Buffer.from(await file.arrayBuffer());

    // 확장자별로 파싱 방식이 완전히 달라서 분기 처리 — 파일 시그니처가 아닌 확장자 기준으로 판단
    let text = "";
    if (name.endsWith(".txt") || name.endsWith(".md")) {
      text = buffer.toString("utf-8");
    } else if (name.endsWith(".docx")) {
      // mammoth는 서식은 버리고 순수 텍스트만 추출 — AI에게 넘길 원본이므로 서식은 불필요
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    } else if (name.endsWith(".pdf")) {
      // 주의: pdf-parse v2부터 default export 함수가 아니라 PDFParse 클래스 기반 API로 바뀌었다.
      // 구버전(v1) 방식인 `pdfParse(buffer)` 형태로 쓰면 동작하지 않는다.
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: buffer });
      try {
        const result = await parser.getText();
        text = result.text;
      } finally {
        // 파서가 내부적으로 리소스를 잡고 있으므로 성공/실패와 무관하게 반드시 해제
        await parser.destroy();
      }
    } else {
      return NextResponse.json({ error: "지원하지 않는 파일 형식입니다. (.txt, .md, .docx, .pdf만 지원)" }, { status: 400 });
    }

    text = text.trim();
    if (!text) {
      return NextResponse.json({ error: "파일에서 텍스트를 추출하지 못했습니다." }, { status: 400 });
    }

    return NextResponse.json({ success: true, text });
  } catch (error: any) {
    console.error("File parse error:", error);
    return NextResponse.json({ error: "파일 처리 중 오류가 발생했습니다: " + error.message }, { status: 500 });
  }
}
