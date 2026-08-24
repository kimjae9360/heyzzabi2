import type { ProposalDoc } from "@/lib/documentTemplates";

// FR-05-009: 기획서는 PPTX 형식으로 다운로드 가능해야 함
export async function exportProposalPptx(doc: ProposalDoc, title: string) {
  const PptxGenJS = (await import("pptxgenjs")).default;
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "A4", width: 10, height: 5.63 });
  pptx.layout = "A4";

  const TITLE_COLOR = "1E293B";
  const ACCENT = "2563EB";

  // Title slide
  const titleSlide = pptx.addSlide();
  titleSlide.addText(title, { x: 0.5, y: 2.1, w: 9, h: 1, fontSize: 32, bold: true, color: TITLE_COLOR });
  titleSlide.addText("프로젝트 기획서", { x: 0.5, y: 3.0, w: 9, h: 0.5, fontSize: 18, color: ACCENT });

  const addSectionSlide = (heading: string, bodyText: string) => {
    const slide = pptx.addSlide();
    slide.addText(heading, { x: 0.5, y: 0.4, w: 9, h: 0.6, fontSize: 24, bold: true, color: ACCENT });
    slide.addText(bodyText || "-", { x: 0.5, y: 1.2, w: 9, h: 4, fontSize: 14, color: TITLE_COLOR, valign: "top" });
    return slide;
  };

  addSectionSlide("1. 배경 및 목적", doc.background);
  addSectionSlide("2. 타겟 사용자", doc.target);

  const featureSlide = pptx.addSlide();
  featureSlide.addText("3. 주요 기능", { x: 0.5, y: 0.4, w: 9, h: 0.6, fontSize: 24, bold: true, color: ACCENT });
  const featureLines = (doc.features || []).map(f => ({
    text: `${f.name}\n`,
    options: { bold: true, fontSize: 14, color: TITLE_COLOR, breakLine: false },
  }));
  const featureBullets = (doc.features || []).flatMap(f => ([
    { text: f.name, options: { bold: true, fontSize: 14, color: TITLE_COLOR, bullet: true, breakLine: true } },
    { text: f.description, options: { fontSize: 11, color: "64748B", indentLevel: 1, breakLine: true } },
  ]));
  featureSlide.addText(featureBullets.length ? featureBullets : [{ text: "-" }], { x: 0.5, y: 1.2, w: 9, h: 4, valign: "top" });

  addSectionSlide("4. 기대 효과", doc.expectedEffect);

  if (doc.milestones?.length) {
    const msSlide = pptx.addSlide();
    msSlide.addText("5. 일정 / 마일스톤", { x: 0.5, y: 0.4, w: 9, h: 0.6, fontSize: 24, bold: true, color: ACCENT });
    const rows: any[] = [
      [{ text: "마일스톤", options: { bold: true, fill: { color: "F1F5F9" } } }, { text: "시기", options: { bold: true, fill: { color: "F1F5F9" } } }],
      ...doc.milestones.map(m => [m.name, m.date]),
    ];
    msSlide.addTable(rows, { x: 0.5, y: 1.2, w: 9, fontSize: 12, color: TITLE_COLOR, border: { type: "solid", color: "E2E8F0", pt: 1 } });
  }

  await pptx.writeFile({ fileName: `${title}_기획서.pptx` });
}
