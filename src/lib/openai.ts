import OpenAI from 'openai';

// API 키 미설정을 일반 Error와 구분해서 던지기 위한 커스텀 에러 - 화면에 사용자 친화적 안내 메시지를 그대로 노출할 수 있다.
export class AIConfigError extends Error {
  constructor() {
    super('OPENAI_API_KEY가 설정되지 않았습니다. .env 파일에 키를 입력한 뒤 다시 시도해 주세요.');
    this.name = 'AIConfigError';
  }
}

let client: OpenAI | null = null;

// 모듈 로드 시점이 아니라 실제 호출 시점에 클라이언트를 만든다(지연 초기화).
// env 값이 아직 준비되지 않은 시점에 import만 해도 에러가 나는 걸 막고, 이후 호출부터는 같은 인스턴스를 재사용한다.
function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new AIConfigError();
  if (!client) client = new OpenAI({ apiKey });
  return client;
}

// gpt-4o-mini 호출은 파이프라인 한 단계당 2~3번씩 연쇄로 일어나 일시적 429/네트워크 오류 하나가
// 회의분석->업무배분 전체 흐름을 깨뜨린다. 재시도 불가능한 오류(4xx 등)만 즉시 던지고 나머지는 백오프 재시도한다.
async function withRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const status = (err as { status?: number } | null)?.status;
      const retryable = status === 429 || status === undefined || (typeof status === 'number' && status >= 500);
      if (!retryable || attempt === retries) throw err;
      await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
    }
  }
  throw lastErr;
}

// temperature 기본값 0.2: 구조화 추출/근거 기반 QA 등 이 함수의 모든 호출부는 "정확히 추출/답변"이
// 목적이라 기본 temperature(1.0)의 창의성이 오히려 해롭다 - 관련 문서가 있는데도 무작위로
// "찾을 수 없습니다"라고 답하는 등 재현 안 되는 실패를 유발하는 걸 실측으로 확인함.
async function callJson<T>(system: string, user: string, temperature = 0.2): Promise<T> {
  const openai = getClient();
  const completion = await withRetry(() =>
    openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      temperature,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    })
  );
  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error('AI 응답이 비어 있습니다. 잠시 후 다시 시도해 주세요.');
  return JSON.parse(content) as T;
}

// callJson과 재시도/에러 처리 로직은 동일하지만 응답 형식을 JSON으로 강제하지 않는다.
// 심층 리서치 보고서처럼 마크다운 장문을 그대로 받아야 할 때 사용.
async function callText(system: string, user: string): Promise<string> {
  const openai = getClient();
  const completion = await withRetry(() =>
    openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    })
  );
  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error('AI 응답이 비어 있습니다. 잠시 후 다시 시도해 주세요.');
  return content;
}

// analyzeMeetingAndDraftProposal의 반환 타입: 1단계(요약) 결과와 2단계(기획서 작성) 결과를 합친 형태.
export interface MeetingAnalysis {
  summary: string;
  agenda: string[];
  decisions: string[];
  actionItems: string[];
  proposalTitle: string;
  proposalContent: string; // markdown
}

// Role 1: 회의 요약가 + 기획서 작성가 (MetaGPT-style role separation, chained in sequence)
export async function analyzeMeetingAndDraftProposal(meetingTitle: string, meetingContent: string): Promise<MeetingAnalysis> {
  const summaryStage = await callJson<{ summary: string; agenda: string[]; decisions: string[]; actionItems: string[] }>(
    '당신은 회의록 요약가입니다. 주어진 회의 본문을 분석해 한국어로 요약(summary), 안건(agenda) 목록, 결정사항(decisions) 목록, 액션아이템(actionItems) 목록을 JSON으로 반환하세요. 형식: {"summary": string, "agenda": string[], "decisions": string[], "actionItems": string[]}',
    `회의 제목: ${meetingTitle}\n\n회의 본문:\n${meetingContent}`
  );

  const proposalStage = await callJson<{ proposalTitle: string; proposalContent: string }>(
    '당신은 기획서 작성가입니다. 회의 요약/안건/결정사항/액션아이템을 바탕으로 마크다운 형식의 기획서를 작성하고 JSON으로 반환하세요. 배경, 주요 안건 요약, 결정사항, 핵심 요구사항(액션아이템), 기대 효과, 일정 계획 섹션을 포함하세요. 형식: {"proposalTitle": string, "proposalContent": string(markdown)}',
    `회의 제목: ${meetingTitle}\n요약: ${summaryStage.summary}\n안건: ${summaryStage.agenda.join(', ')}\n결정사항: ${summaryStage.decisions.join(', ')}\n액션아이템: ${summaryStage.actionItems.join(', ')}`
  );

  return { ...summaryStage, ...proposalStage };
}

// breakdownProposalIntoTasks / breakdownTaskIntoSubtasks가 공통으로 반환하는 업무 초안 한 건의 형태.
export interface TaskDraft {
  title: string;
  description: string;
  estimatedHours: number;
  difficulty: 'High' | 'Medium' | 'Low';
  difficultyReason: string;
}

// Role 2: 업무 분해가 - 기획서를 실행 가능한 업무 단위로 쪼갠다
export async function breakdownProposalIntoTasks(proposalTitle: string, proposalContent: string): Promise<TaskDraft[]> {
  const result = await callJson<{ tasks: TaskDraft[] }>(
    '당신은 업무 분해 전문가입니다. 주어진 기획서를 실행 가능한 3~7개의 세부 업무로 분해하고 JSON으로 반환하세요. 각 업무는 제목(title), 설명(description), 예상 소요시간(estimatedHours, 숫자), 난이도(difficulty: High/Medium/Low), 그리고 그 난이도를 그렇게 판단한 구체적 근거(difficultyReason, 기획서 내용에 근거해 1문장)를 가집니다. 형식: {"tasks": [{"title": string, "description": string, "estimatedHours": number, "difficulty": "High"|"Medium"|"Low", "difficultyReason": string}]}',
    `기획서 제목: ${proposalTitle}\n\n기획서 본문:\n${proposalContent}`
  );
  return result.tasks;
}

// Role 2b: WBS 분해가 - 이미 배분 대기 중인 업무 하나를 더 작은 실행 단위로 쪼갠다 (수동 "AI로 쪼개기")
export async function breakdownTaskIntoSubtasks(task: { title: string; description?: string; estimatedHours?: number }): Promise<TaskDraft[]> {
  const result = await callJson<{ tasks: TaskDraft[] }>(
    '당신은 WBS(작업 분할 구조) 전문가입니다. 주어진 업무 하나를 실행 가능한 2~4개의 더 작은 하위 업무로 분해하고 JSON으로 반환하세요. 하위 업무들의 예상 소요시간 합은 원래 업무의 예상 소요시간을 넘지 않아야 합니다. 각 하위 업무는 제목(title), 설명(description), 예상 소요시간(estimatedHours, 숫자), 난이도(difficulty: High/Medium/Low), 그 난이도 판단 근거(difficultyReason, 1문장)를 가집니다. 형식: {"tasks": [{"title": string, "description": string, "estimatedHours": number, "difficulty": "High"|"Medium"|"Low", "difficultyReason": string}]}',
    `업무 제목: ${task.title}\n업무 설명: ${task.description || '(설명 없음)'}\n예상 소요시간: ${task.estimatedHours ?? '알 수 없음'}시간`
  );
  return result.tasks;
}

// llm_wiki_graphify 스타일 대분류 자동 소팅: 정해진 enum이 아니라 문서 내용에서 자연스러운 카테고리를 뽑는다
export async function classifyDocument(title: string, content: string): Promise<string> {
  const result = await callJson<{ category: string }>(
    '당신은 사내 지식 분류 담당자입니다. 주어진 문서를 짧은 한국어 대분류 태그(예: "인증/보안", "AI 파이프라인", "UI/UX", "온보딩", "인프라") 하나로 분류하세요. 이미 존재할 법한 일반적인 카테고리명을 쓰고, 너무 구체적이거나 문서 제목 그대로 베끼지 마세요. JSON으로 반환: {"category": string}',
    `제목: ${title}\n\n내용:\n${content.slice(0, 2000)}`
  );
  return result.category;
}

// 지식망 RAG 검색용 임베딩 생성. 8000자로 자르는 건 임베딩 모델의 토큰 한도를 넘겨 에러 나는 걸 막기 위함
// (문서 전체가 아니라 검색 매칭용 벡터만 필요하므로 앞부분만 잘라도 충분).
export async function embedText(text: string): Promise<number[]> {
  const openai = getClient();
  const result = await withRetry(() =>
    openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text.slice(0, 8000),
    })
  );
  return result.data[0].embedding;
}

// 두 임베딩 벡터의 코사인 유사도(내적 / 크기의 곱) 계산 - 값이 1에 가까울수록 의미가 비슷한 문서.
// RAG 검색에서 질문 임베딩과 문서 임베딩을 비교해 관련 문서 순위를 매기는 데 쓰인다.
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export interface RagAnswer {
  answer: string;
}

// khoj 스타일 RAG: 검색된 문서를 컨텍스트로 주고 근거 기반으로만 답하게 한다
export async function answerFromContext(question: string, contextChunks: { title: string; content: string }[]): Promise<RagAnswer> {
  if (contextChunks.length === 0) {
    return { answer: '관련된 회의록/기획서를 찾지 못했습니다. 질문을 다르게 표현해 보시거나, 먼저 재인덱싱을 실행해 주세요.' };
  }
  const context = contextChunks.map((c, i) => `[문서 ${i + 1}] ${c.title}\n${c.content}`).join('\n\n---\n\n');
  const result = await callJson<{ answer: string }>(
    `당신은 사내 지식망 챗봇입니다. 아래 "컨텍스트"에 나열된 문서만 근거로 한국어로 답하세요.
질문과 직접 관련된 문서가 하나라도 있으면 그 내용을 요약해 구체적으로 답하고, 어떤 문서 번호를 참고했는지 밝히세요.
컨텍스트에 관련 없는 문서가 섞여 있어도 무시하고, 관련 있는 문서만 근거로 삼아 답하세요.
컨텍스트 전체에 질문과 관련된 내용이 전혀 없을 때만 "문서에서 찾을 수 없습니다"라고 답하세요.
JSON 형식으로 반환: {"answer": string}`,
    `컨텍스트:\n${context}\n\n질문: ${question}`
  );
  return result;
}

export interface LocalPacketDoc {
  kind: string; // 회의록 / 기획서 / 업무
  title: string;
  content: string;
}

export interface DeepResearchResult {
  content: string; // markdown 보고서
  degraded: boolean; // 내부 데이터가 부족해 제한된 근거로 작성됐는지
}

// 9_deep_research 스킬의 패턴을 재현: Local Packet(내부 데이터 취합) -> Q1(사실관계) -> Q2(심화분석) -> 보고서.
// 외부 웹 검색은 하지 않는다 - 오직 우리 DB에 있는 내부 데이터만 근거로 쓰고, 부족하면 부족하다고 정직하게 밝힌다.
export async function runDeepResearch(question: string, packet: LocalPacketDoc[]): Promise<DeepResearchResult> {
  const degraded = packet.length < 2;
  const packetText = packet.length > 0
    ? packet.map((d, i) => `[${i + 1}] (${d.kind}) ${d.title}\n${d.content}`).join('\n\n---\n\n')
    : '(내부 데이터 없음)';

  const facts = await callJson<{ confirmedFacts: string[]; unknowns: string[] }>(
    '당신은 내부 데이터 팩트체커입니다. 주어진 회의록/기획서/업무 기록(Local Packet)만 근거로, 질문과 관련해 "확인된 사실"과 "내부 자료로는 확인되지 않는 사항"을 구분해 JSON으로 반환하세요. 절대 추측하거나 외부 지식으로 채우지 마세요. 형식: {"confirmedFacts": string[], "unknowns": string[]}',
    `질문: ${question}\n\nLocal Packet:\n${packetText}`
  );

  const report = await callText(
    `당신은 내부 데이터 기반 리서치 분석가입니다. 1단계에서 확인된 사실과 미확인 사항을 바탕으로 마크다운 심층 분석 보고서를 작성하세요.
반드시 아래 구조를 따르세요:
## 1. 배경 및 질문
## 2. 확인된 사실 (내부 자료 근거)
## 3. 반복되는 패턴 / 리스크
## 4. 미확인 사항 (내부 자료로는 알 수 없음, 추가 조사 필요)
## 5. 권장 조치 (사람 승인 필요)
마지막 섹션 제목 아래에는 반드시 "이 권장 조치는 자동 실행되지 않으며, 담당자의 명시적 승인이 있어야 실행됩니다." 라는 문구를 포함하세요.
외부 지식이나 웹 검색 결과를 지어내지 마세요 - 오직 확인된 사실/미확인 사항만 근거로 쓰세요.`,
    `질문: ${question}\n\n확인된 사실:\n${facts.confirmedFacts.map(f => `- ${f}`).join('\n') || '(없음)'}\n\n미확인 사항:\n${facts.unknowns.map(f => `- ${f}`).join('\n') || '(없음)'}`
  );

  const header = degraded
    ? `> ⚠️ **내부 데이터 부족 경고**: 관련된 회의록/기획서/업무가 ${packet.length}건밖에 없어 제한된 근거로 작성된 보고서입니다. 참고용으로만 활용하세요.\n\n`
    : '';

  return { content: header + report, degraded };
}

// answerGlobalSearch에 넘길 직원별 실시간 워크로드/업무 현황 스냅샷 (DB에서 조회해 미리 만들어 전달).
export interface EmployeeWorkloadRow {
  name: string;
  department: string;
  position: string;
  jobTitle: string;
  currentWorkload: number;
  activeTasks: { title: string; status: string; progress: number; estimatedHours?: number }[];
}

export interface GlobalSearchAnswer {
  answer: string;
}

// 상단 검색바용: 직원 워크로드/업무 현황(구조화 데이터) + 지식망 RAG 검색 결과를 함께 근거로 답한다.
// "김재원 업무량은?" 같은 질문은 문서 임베딩이 아니라 실시간 Task/User 데이터가 있어야 답할 수 있어 별도 함수로 분리했다.
export async function answerGlobalSearch(
  question: string,
  employeeRows: EmployeeWorkloadRow[],
  docChunks: { title: string; content: string }[]
): Promise<GlobalSearchAnswer> {
  const employeeContext = employeeRows.length > 0
    ? employeeRows.map((e) => {
        const tasksText = e.activeTasks.length > 0
          ? e.activeTasks.map((t) => `  - [${t.status}] ${t.title} (진행률 ${t.progress}%${t.estimatedHours ? `, 예상 ${t.estimatedHours}시간` : ''})`).join('\n')
          : '  - 배정된 업무 없음';
        return `${e.name} (${e.department}/${e.position}${e.jobTitle ? `, ${e.jobTitle}` : ''}) - 현재 워크로드 ${e.currentWorkload}/100\n${tasksText}`;
      }).join('\n\n')
    : '(등록된 직원 없음)';

  const docContext = docChunks.length > 0
    ? docChunks.map((c, i) => `[문서 ${i + 1}] ${c.title}\n${c.content.slice(0, 500)}`).join('\n\n')
    : '(관련 회의록/기획서 없음)';

  const result = await callJson<{ answer: string }>(
    `당신은 사내 업무 관리 시스템 "Hey Zzabi"의 검색 어시스턴트입니다. 아래 두 종류의 실제 사내 데이터만 근거로 한국어로 답하세요.
1) 직원별 워크로드/업무 현황 (실시간 DB 스냅샷)
2) 관련 회의록/기획서 발췌

데이터에 없는 내용은 추측하지 말고 정직하게 "관련 데이터를 찾을 수 없습니다"라고 답하세요. 사람 이름이 언급되면 반드시 직원 현황 데이터에서 찾아 워크로드/업무 개수/진행 중인 업무를 근거로 요약해 답하세요. 답변은 2~4문장으로 간결하게 작성하세요. JSON 형식으로 반환: {"answer": string}`,
    `직원 워크로드/업무 현황:\n${employeeContext}\n\n관련 문서:\n${docContext}\n\n질문: ${question}`
  );
  return result;
}

// 실제 Whisper 음성 인식 - 음성 파일을 업로드하면 진짜로 텍스트로 변환한다 (연출 아님)
export async function transcribeAudio(file: File): Promise<string> {
  const openai = getClient();
  const result = await openai.audio.transcriptions.create({
    file,
    model: 'whisper-1',
    language: 'ko',
  });
  return result.text;
}
