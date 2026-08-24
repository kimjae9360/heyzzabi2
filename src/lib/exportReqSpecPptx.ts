import type { ReqSpecDoc } from "@/lib/documentTemplates";

const ROWS_PER_SLIDE = 8;

export async function exportReqSpecPptx(doc: ReqSpecDoc, title: string) {
  const PptxGenJS = (await import("pptxgenjs")).default;
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "A4", width: 10, height: 5.63 });
  pptx.layout = "A4";

  const TITLE_COLOR = "1E293B";
  const ACCENT = "2563EB";
  const HEADER_FILL = "F1F5F9";

  const titleSlide = pptx.addSlide();
  titleSlide.addText(title, { x: 0.5, y: 2.1, w: 9, h: 1, fontSize: 32, bold: true, color: TITLE_COLOR });
  titleSlide.addText("요구사항정의서", { x: 0.5, y: 3.0, w: 9, h: 0.5, fontSize: 18, color: ACCENT });

  const headerRow = [
    { text: "ID", options: { bold: true, fill: { color: HEADER_FILL } } },
    { text: "대분류", options: { bold: true, fill: { color: HEADER_FILL } } },
    { text: "중분류", options: { bold: true, fill: { color: HEADER_FILL } } },
    { text: "요구사항명", options: { bold: true, fill: { color: HEADER_FILL } } },
    { text: "기능설명", options: { bold: true, fill: { color: HEADER_FILL } } },
    { text: "비고", options: { bold: true, fill: { color: HEADER_FILL } } },
  ];

  const items = doc.items.length ? doc.items : [];
  const chunkCount = Math.max(1, Math.ceil(items.length / ROWS_PER_SLIDE));

  for (let c = 0; c < chunkCount; c++) {
    const chunk = items.slice(c * ROWS_PER_SLIDE, (c + 1) * ROWS_PER_SLIDE);
    const slide = pptx.addSlide();
    slide.addText(
      `요구사항 목록${chunkCount > 1 ? ` (${c + 1}/${chunkCount})` : ""}`,
      { x: 0.5, y: 0.3, w: 9, h: 0.5, fontSize: 20, bold: true, color: ACCENT }
    );
    const rows: any[] = [
      headerRow,
      ...(chunk.length ? chunk.map(item => [
        { text: item.id, options: { fontSize: 8, fontFace: "Consolas" } },
        { text: item.category, options: { fontSize: 9 } },
        { text: item.subCategory, options: { fontSize: 9 } },
        { text: item.name, options: { fontSize: 9, bold: true } },
        { text: item.description, options: { fontSize: 8 } },
        { text: item.note, options: { fontSize: 8, color: "64748B" } },
      ]) : [[{ text: "항목이 없습니다.", options: { colspan: 6, align: "center", color: "94A3B8" } }]]),
    ];
    slide.addTable(rows, {
      x: 0.4, y: 1.0, w: 9.2,
      colW: [1.0, 0.9, 0.9, 1.7, 3.4, 1.3],
      fontSize: 9, color: TITLE_COLOR,
      border: { type: "solid", color: "E2E8F0", pt: 1 },
      autoPage: false,
      valign: "top",
    });
  }

  await pptx.writeFile({ fileName: `${title}_요구사항정의서.pptx` });
}
