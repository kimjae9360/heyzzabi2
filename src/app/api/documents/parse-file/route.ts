import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/requireAuth";

// mammoth/pdf-parse가 Buffer 등 Node.js API를 사용하므로 Edge 런타임이 아닌
// Node.js 런타임을 명시적으로 지정해야 한다
export const runtime = "nodejs";

// 회의록 업로드 화면에서 쓰이는 파일 업로드→텍스트 추출 엔드포인트.
// 여기서 뽑아낸 텍스트가 documents(회의록 생성) API의 rawContent로 들어가
// AI 문서 파이프라인의 원본 입력이 된다.
export async function POST(request: NextRequest) {
  try {
    const { error: authError } = await requireAuth();
    if (authError) return authError;

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
      // pdf-parse(내부 pdfjs-dist)는 텍스트 추출 경로에서도 브라우저 전역 DOMMatrix를 참조한다.
      // 로컬(Node)에서 동작했던 건 번들러가 브라우저용 폴리필을 끼워넣어준 우연이었고,
      // Vercel 서버리스(순수 Node 런타임)에서는 진짜로 없어서 "DOMMatrix is not defined"로
      // 죽었다(실제 프로덕션 버그). @napi-rs/canvas는 pdf-parse의 기존 의존성이라 별도 설치
      // 없이 그 DOMMatrix 구현을 pdf-parse를 불러오기 전에 globalThis에 등록해서 재사용한다.
      if (typeof (globalThis as { DOMMatrix?: unknown }).DOMMatrix === "undefined") {
        const { DOMMatrix } = await import("@napi-rs/canvas");
        (globalThis as { DOMMatrix?: unknown }).DOMMatrix = DOMMatrix;
      }
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
    } else if (name.endsWith(".hwp")) {
      // .hwp(구버전 바이너리 한/글 포맷)는 OLE/CFB 컨테이너 안에 zlib로 압축된 본문이 들어있는
      // 구조라 mammoth/pdf-parse 같은 범용 라이브러리로는 못 연다. cfb로 컨테이너를 열고
      // hwp.js로 문서 모델을 파싱한 뒤, 문단(Paragraph)의 글자 배열을 순서대로 이어붙인다.
      // hwp.js는 초기 단계 라이브러리라 모든 .hwp 버전/구성을 보장하진 않는다.
      const cfb = await import("cfb");
      const { parse: parseHwp } = await import("hwp.js");
      const cfbData = cfb.read(buffer, { type: "buffer" });
      // cfb와 hwp.js가 각자 번들한 CFB 타입 선언이 서로 미묘하게 달라(같은 라이브러리의 버전 차이)
      // 구조적으로는 동일한 객체인데도 타입 체크만 어긋난다 — 런타임 동작과는 무관.
      const hwpDoc = parseHwp(cfbData as any);
      text = hwpDoc.sections
        .map((section: any) =>
          section.content
            .map((paragraph: any) =>
              paragraph.content
                .map((char: any) => (typeof char.value === "string" ? char.value : ""))
                .join("")
            )
            .join("\n")
        )
        .join("\n\n");
    } else {
      return NextResponse.json({ error: "지원하지 않는 파일 형식입니다. (.txt, .md, .docx, .pdf, .hwp만 지원)" }, { status: 400 });
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
