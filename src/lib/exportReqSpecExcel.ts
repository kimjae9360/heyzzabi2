import type { ReqSpecDoc } from "@/lib/documentTemplates";

export async function exportReqSpecExcel(doc: ReqSpecDoc, title: string) {
  const XLSX = await import("xlsx");

  const rows = doc.items.map(item => ({
    "요구사항 ID": item.id,
    "대분류": item.category,
    "중분류": item.subCategory,
    "요구사항명": item.name,
    "기능설명": item.description,
    "비고": item.note,
  }));

  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet["!cols"] = [
    { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 24 }, { wch: 48 }, { wch: 20 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "요구사항정의서");
  XLSX.writeFile(workbook, `${title}_요구사항정의서.xlsx`);
}
