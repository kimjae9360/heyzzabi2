// Fixed document templates shared by the AI generation prompts, the on-screen
// renderers, and the PDF/PPTX exporters. Keeping one shape in one place means
// "what the AI must return" and "what the screen renders" can never drift apart.

// 2026-08-27: 기획서 품질이 너무 얕다는 피드백으로 기능별 우선순위를 추가했다. 원본에 강조/시급성이
// 명시돼 있으면 그걸 근거로, 없으면 AI가 "핵심 플로우에 필수적인가"를 기준으로 합리적으로 판단해
// 채우되(완전히 비워두면 화면에 표시할 게 없어지므로), 지어낸 근거로 과도하게 확신하지는 않는다.
export type FeaturePriority = "필수" | "권장" | "선택";

export type ProposalFeature = {
  name: string;
  description: string;
  priority?: FeaturePriority;
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
// 2026-08-27: 내용이 한 줄짜리 요약에 그쳐 "완벽한 기획서"라 부르기엔 부족하다는 피드백으로
// risks/successMetrics 두 섹션을 추가했다. 둘 다 선택 필드다 — 원본에 근거가 전혀 없는 회의록에서
// 억지로 채우면 환각이 되므로, 그런 경우 AI가 빈 문자열로 두면 화면에서 그 섹션 자체를 숨긴다
// (ProposalTemplate.tsx의 조건부 렌더링 참고).
export type ProposalDoc = {
  background: string;
  target: string;
  features: ProposalFeature[];
  expectedEffect: string;
  milestones: ProposalMilestone[]; // 원본에 일정 언급이 없으면 빈 배열
  projectPeriod?: ProjectPeriod;
  risks?: string; // 리스크 및 고려사항 — 원본에 제약/우려/의존성 언급이 있을 때만 채워짐
  successMetrics?: string; // 성공 지표(KPI) — 원본에 목표 수치/판단 기준 언급이 있을 때만 채워짐
};

// 기획서 초안을 여러 관점(예: MVP 중심 / 기능 확장 중심)으로 동시에 생성했을 때 그 중 하나.
// 사용자가 여러 안을 비교해보고 하나를 선택하는 화면에서 쓰인다.
export type ProposalDraftOption = {
  label: "1안" | "2안" | "3안";
  angle: string; // 이 안이 원본을 어떤 관점으로 재구성했는지 (예: "MVP 중심")
  doc: ProposalDoc;
};

// 요구사항 우선순위 — 개발 착수 순서를 정할 때 쓰는 값이라 반드시 상/중/하 중 하나로 강제한다.
export type ReqPriority = "상" | "중" | "하";

// FR-05-010 요구사항정의서 템플릿: 원본 요구사항정의서 시트와 동일한 표 구조
// 2026-08-27: 컬럼이 6개뿐이라 실제 개발 착수에 필요한 정보(우선순위/수용기준/입출력)가 빠져
// "요구사항정의서라기보다 요약표"에 가깝다는 피드백으로 4개 컬럼을 추가했다. 새 컬럼도 전부
// 원본(회의록·기획서)에서 합리적으로 도출 가능한 내용만 채우고, 근거가 전혀 없으면 빈 문자열로
// 둔다(표에는 "-"로 표시됨) — 컬럼이 늘었다고 없는 사실을 지어내라는 뜻이 아니다.
export type ReqSpecRow = {
  id: string; // FR-XX-XXX 형식
  category: string; // 대분류
  subCategory: string; // 중분류
  name: string; // 요구사항명
  description: string; // 기능설명
  priority: ReqPriority; // 우선순위
  relatedFeature: string; // 이 요구사항이 근거하는 기획서의 기능명(주요 기능 목록의 name과 매칭)
  inputOutput: string; // 입력/처리/출력 요약 — 무엇이 입력되고, 어떻게 처리되어, 무엇이 출력/저장되는지
  acceptanceCriteria: string; // 수용 기준 — 이 요구사항이 "완료됐다"고 판단할 구체적 조건
  note: string; // 비고/추가설명
};

export type ReqSpecDoc = {
  items: ReqSpecRow[];
};

// 아래 parse* 함수들은 모두 같은 패턴: DB에는 JSON 문자열(raw text)로 저장돼 있는 문서를
// 화면/엑스포트에서 쓸 수 있는 타입 객체로 안전하게 되돌린다. raw가 없거나 JSON이 깨져 있어도
// (예: AI 응답 파싱 실패, 마이그레이션 이전 데이터) 예외를 던지지 않고 null/빈 배열을 반환해
// 호출부가 별도 try/catch 없이 "문서 없음"으로 처리할 수 있게 한다.
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
