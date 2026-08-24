import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "파일이 없습니다." }, { status: 400 });
    }

    const name = file.name.toLowerCase();
    const buffer = Buffer.from(await file.arrayBuffer());

    let text = "";
    if (name.endsWith(".txt") || name.endsWith(".md")) {
      text = buffer.toString("utf-8");
    } else if (name.endsWith(".docx")) {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    } else if (name.endsWith(".pdf")) {
      const pdfParse = (await import("pdf-parse")).default;
      const result = await pdfParse(buffer);
      text = result.text;
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
