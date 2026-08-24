// Fixed document templates shared by the AI generation prompts, the on-screen
// renderers, and the PDF/PPTX exporters. Keeping one shape in one place means
// "what the AI must return" and "what the screen renders" can never drift apart.

export type ProposalFeature = {
  name: string;
  description: string;
};

export type ProposalMilestone = {
  name: string;
  date: string;
};

// 원본(회의록/메모)에 "프로젝트 기간: 2026-08-25 ~ 2026-10-24" 처럼 명시적인 기간이 있으면 추출해둔다.
// 업무분배 탭에서 이 값이 있으면 오늘 날짜 대신 여기서부터 WBS 일정을 잡는다. 원본에 언급이 없으면
// start/end 모두 빈 문자열 — AI가 지어내지 않는다(절대 규칙).
export type ProjectPeriod = {
  start: string; // YYYY-MM-DD, 없으면 ""
  end: string; // YYYY-MM-DD, 없으면 ""
};

// FR-03-004 / FR-05-006 기획서 템플릿: 배경 및 목적 / 타겟 사용자 / 주요 기능 / 기대 효과 / (선택) 일정
export type ProposalDoc = {
  background: string;
  target: string;
  features: ProposalFeature[];
  expectedEffect: string;
  milestones: ProposalMilestone[]; // 원본에 일정 언급이 없으면 빈 배열
  projectPeriod?: ProjectPeriod;
};

export type ProposalDraftOption = {
  label: "1안" | "2안" | "3안";
  angle: string; // 이 안이 원본을 어떤 관점으로 재구성했는지 (예: "MVP 중심")
  doc: ProposalDoc;
};

// FR-05-010 요구사항정의서 템플릿: 원본 요구사항정의서 시트와 동일한 표 구조
export type ReqSpecRow = {
  id: string; // FR-XX-XXX 형식
  category: string; // 대분류
  subCategory: string; // 중분류
  name: string; // 요구사항명
  description: string; // 기능설명
  note: string; // 비고/추가설명
};

export type ReqSpecDoc = {
  items: ReqSpecRow[];
};

export function parseProposalDoc(raw: string | null): ProposalDoc | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ProposalDoc;
  } catch {
    return null;
  }
}

export function parseProposalDraftOptions(raw: string | null): ProposalDraftOption[] {
  if (!raw) return [];
  try {
    return JSON.parse(raw) as ProposalDraftOption[];
  } catch {
    return [];
  }
}

export function parseReqSpecDoc(raw: string | null): ReqSpecDoc | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ReqSpecDoc;
  } catch {
    return null;
  }
}
