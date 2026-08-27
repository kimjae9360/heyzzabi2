# HeyZzabi v2 — 프로젝트 현황 / 인수인계 문서

> 이 문서는 다른 계정·다른 세션에서도 바로 이어서 작업할 수 있도록 작성된 현황 요약입니다.
> 최종 갱신: 2026-08-24

## 0. 프로젝트 개요

**헤이 짜비(Hey Zzabi)** — SK Networks AI Camp 31기 캡스톤 프로젝트.
AI 에이전트가 회의록 → 기획서 → 요구사항정의서 → 업무 자동생성/배분까지 이어주는
Next.js 기반 AI 팀 업무 자동화 시스템.

- **개발 방식**: Figma 목업이 아니라 코드 우선(code-first)으로 진행 중. (Figma는 Starter 플랜 레이트리밋에 걸려 보류)
- **단일 프로젝트 전제**: 현재 앱은 "프로젝트가 항상 1개만 존재한다"는 전제로 여러 화면(문서생성/히스토리 등)이 `projects[0]`을 그대로 사용함. 멀티 프로젝트로 확장하려면 이 전제를 깨야 함.
- **스택**: Next.js 16(App Router, Turbopack) · React 19 · Prisma ORM v5.22 + PostgreSQL(Neon, `.env`의 `DATABASE_URL`) · TypeScript · Tailwind v4 · OpenAI SDK(`gpt-4o-mini`) — **2026-08-24 정정**: 이 문서에 오래 SQLite(`dev.db`)라고 적혀 있었는데 실제로는 원격 Neon Postgres를 씀.

## 1. 벤치마킹 대상 (오픈소스 레퍼런스)

Figma가 막힌 이후 "벤치마킹을 직접 코드로 구현" 하는 방향으로 전환. 참고 중인 프로젝트:

- **cdeust/ai-prd-generator** — AI 기반 PRD(제품 요구사항 문서) 자동 생성
- **Zackriya-Solutions/meetily** — 회의록 → 요약/액션아이템 추출
- **Abdulbasit110/meeting-minutes-agent** — 회의록 에이전트 파이프라인
- 로컬 `참고` 폴더에 있는 **NocoBase / OpenProject / Plane** — 칸반/WBS/직원관리 UX 참gi고

이 레퍼런스들에서 아직 우리 쪽에 반영 안 된 아이디어(향후 검토 가치 있음):
- PRD 버전 히스토리 diff 뷰 (ai-prd-generator)
- 회의록 자동 요약 + 화자별 발언 태깅 (meetily류) — 현재는 원본 텍스트를 그대로 AI에 넘기기만 함
- WBS 간트차트 시각화 (OpenProject/Plane) — 현재 WBS는 표 형태만 존재, 타임라인 시각화 없음

## 2. 핵심 아키텍처 / 컨벤션 (새 세션에서 반드시 알아야 할 것)

- **AI 에이전트 3곳** (사용자가 정의한 범위):
  1. 회의록 → 기획서 생성 (`/api/projects/[id]/documents/[docId]/generate`, type=`proposal`)
  2. 기획서 → 요구사항정의서 생성 (같은 route, type=`reqSpec`, 기획서 `APPROVED` 이후에만 가능)
  3. 요구사항정의서 → 업무 자동 추출(`extract-tasks`) + AI 배치 배정(`assign-tasks`, 2026-08-24부터 — 문서의 업무 전체를 한 번에 보고 배정해 워크로드 분산) + WBS 일정 계산. 문서생성 페이지의 "업무분배" 탭이 이 흐름의 UI. `/tasks` 페이지 칸반 카드의 개별 담당자 배정/재배정은 별도 경로(`recommend-assignees`, 업무 1건씩)로 계속 존재 — 둘 다 `assignmentReason`을 남기므로 어느 경로로 배정해도 근거가 남는다
- **환각(hallucination) 방지 원칙**: 모든 생성 프롬프트에 `NO_HALLUCINATION_RULE`("원본에 없는 사실/기능/수치/일정은 절대 추가하지 마라")을 시스템 메시지에 명시. `response_format: json_object`로 구조화 출력 강제. **새 AI 기능을 추가할 때도 이 패턴을 반드시 유지할 것.**
- **에이전트 temperature는 하드코딩이 아니라 `Project.agentConfig`에서 옴** (2026-08-24, `/settings` 페이지) —
  `generate`/`extract-tasks` 라우트는 `src/lib/agentConfig.ts`의 `parseAgentConfig(project.agentConfig)`로
  값을 읽는다. 기본값은 기존과 동일(`proposal`/`reqSpec` 0.0, `taskAssign` 0.1)이고, 환각 방지 원칙을
  지키기 위해 **서버에서 항상 0~0.3으로 clamp**한다 — 새 AI 기능을 추가할 때 이 파일을 참고해 같은
  패턴(설정 가능하되 안전 범위로 강제 clamp)을 유지할 것.
- **1안/2안/3안(멀티 드래프트) 기능은 폐기됨** — 처음엔 기획서를 3개 버전으로 생성했으나 사용자가 "하나만 나오는 걸로" 되돌리라고 명시적으로 요청, 현재는 단일 생성만 지원. `ProposalDraftOption` 관련 코드/라우트는 전부 제거됨.
- **업무 파이프라인 상태값 (중요, 한 번 크게 잘못 설계했다가 수정한 이력 있음)**:
  `BACKLOG(대기) → PENDING_APPROVAL(배분승인대기) → IN_PROGRESS(진행중) → DONE(완료)`
  - `PENDING_APPROVAL`은 "완료 검토"가 아니라 **"담당자 배분 승인"** 게이트임 (FR-05-018/019). PM이 배분을 승인해야 `IN_PROGRESS`로 감. 완료 자체는 담당자 self-report이며 PM 승인 게이트가 없음(FR-05-026).
  - `approve` → `IN_PROGRESS` / `reject` → `BACKLOG`+담당자 해제, reject는 사유 필수.
  - **예외**: 업무분배 탭에서 PM이 직접 배정을 확정하면 `PENDING_APPROVAL`을 거치지 않고 바로 `IN_PROGRESS`로 간다 — PM이 그 화면에서 이미 근거를 보고 확정하는 것이라 별도 승인 단계가 중복이라고 판단(2026-08-24, 사용자 확인). 칸반 드래그 경로는 여전히 `PENDING_APPROVAL`을 거침.
- **문서 승인 상태**: `proposalStatus`/`reqSpecStatus`가 **독립적으로** 관리됨 (기획서 승인과 요구사항정의서 승인은 별개 게이트, 별개 반려사유 필드).
- **RBAC**: DB 레벨 권한 체크는 없고, 클라이언트에서 `useAuth()`의 `user.role`(`PM`|`MEMBER`)로 UI만 게이팅함. → **보안 관점에서는 서버 라우트에 역할 검증이 없다는 뜻**, 프로덕션 전환 시 반드시 보강 필요 (아래 4번 참고).
- **DEV 전용 롤 토글**: 우측 상단 노란 배지(`DevRoleToggle.tsx`) — 재로그인 없이 PM↔MEMBER 전환. **2026-08-24: role 라벨만 바꾸던 예전 방식은 버그였음** — PM 본인 id가 그대로 남아서 "일반유저" 미리보기가 대시보드/`내 업무`에서 항상 0건으로 보였음(PM은 업무를 배정받지 않는 역할이라). `devToggleRole()`을 고쳐서 이제 PM→MEMBER 전환 시 `/api/users`에서 실제 EMPLOYEE 계정(이메일 오름차순 첫 번째)으로 세션 자체를 바꾸고, MEMBER→PM 복귀 시 `localStorage`에 백업해둔 원래 PM 신원을 복원함. 백업이 없는 이전 버전 세션은 재로그인 없이 role 라벨만 PM으로 되돌려 복구(토글의 존재 이유가 재로그인 회피이므로 로그아웃을 강제하지 않도록 함 — 최초엔 로그아웃 방식으로 짰다가 사용자가 "토글은 원래 재로그인 안 하려고 만든 것"이라고 정정해서 이 방식으로 변경).
- **비밀번호는 평문 저장** — MVP 편의상 그렇게 되어 있음. 프로덕션 전 반드시 해싱(bcrypt 등) 필요.
- **주석 정책**: 이 세션 동안 "코드에 다 주석을 달아달라"는 지시가 있었음 — 새로 작성하는 코드에는 WHY 중심의 짧은 주석을 남길 것 (WHAT은 지양).

## 3. 구현 완료 항목

- [x] 문서생성 파이프라인: 업로드(.txt/.md/.docx/.pdf)/직접입력 → AI 기획서 생성 → 검토요청 → PM 승인/반려 → 요구사항정의서 생성 → 승인 → 업무 자동생성. 전 구간 실제 OpenAI 응답으로 end-to-end 검증됨.
- [x] 문서 PDF 출력(브라우저 print), 기획서 PPTX 출력(`pptxgenjs`)
- [x] 문서 **삭제**(확인 모달 포함) / 원본 회의록·메모 **직접 수정**(dirty-state 저장 버튼) — 2026-08-24 추가
- [x] AI 담당자 추천 (`recommend-assignees`) — 기술적합도/업무여유도/유사경험 근거 포함, 후보 0명이 아니면 최소 1명은 반드시 추천하도록 프롬프트 처리
- [x] 칸반 보드 통합 — 예전에 3개의 중복 칸반 구현이 있었으나 `KanbanBoard.tsx` 하나로 통합, 배분승인 게이트/반려사유 모두 반영. **2026-08-24 재확인**: 위 기록과 달리 실제로는 `/tasks` 페이지(`tasks/page.tsx`)가 자체 칸반 마크업을 따로 갖고 있어서 `PENDING_APPROVAL` 카드에 승인/반려 버튼이 없었음(배지만 뜸) — `/tasks`의 칸반 뷰를 `KanbanBoard.tsx`로 교체해서 이제 진짜로 하나로 통합됨. `KanbanBoard`는 단일 프로젝트를 전제하므로(`projectId`/`members` prop 필요), `/tasks`도 다른 화면처럼 `projects[0]`을 기본 프로젝트로 사용.
- [x] 요구사항정의서 재추출 시 업무 중복 생성 방지 (2026-08-24) — `extract-tasks` 라우트가 같은 `sourceDocumentId`에서 이미 뽑은 업무가 있는지 체크하지 않아, 반려→직접수정→재승인 흐름 후 "업무분배 실행"을 다시 누르면 이전 업무 세트 위에 새 세트가 그대로 추가됐음. 정책: 아직 아무도 손대지 않은(`BACKLOG`) 업무는 새 세트로 교체, 이미 배정·진행 중이거나 완료된 업무는 진행 상황을 잃지 않도록 그대로 둠(응답에 `replacedCount`/`staleTasks`로 알려줌). `documents/page.tsx`는 재추출 전 확인 다이얼로그를, 재추출 후에는 보존된 업무가 있으면 경고를 보여줌.
- [x] 업무 리스트(`/tasks`): 칸반/리스트/**WBS**(진행률 요약 + Git 상태 컬럼) 3가지 뷰
- [x] 역할별 화면 분기: 대시보드(PM=팀 전체 KPI·워크로드 / MEMBER=개인 요약), 문서생성, 업무관리, 결재함(승인함), 직원관리 — 전부 검증됨
- [x] 직원관리(FR-02-003 필드 100% 반영): employeeNo/position/jobTitle/status/hireDate/skills/certs/pastProjects, 상태탭, PM만 CRUD 가능. **PM 정보수정 모달 2단 컬럼 레이아웃**(2026-08-24, 세로로 너무 길다는 피드백 반영)
- [x] 온보딩 2단계 위저드(비밀번호 변경 → 개인정보: phone/techStack/certifications/pastProjects)
- [x] 프로필 페이지: 좌(이름/이메일/권한 + 비밀번호변경 모달 버튼) / 우(내정보수정) 2단 레이아웃
- [x] 히스토리 페이지: 전체/문서/업무/**에이전트** 4개 탭. "에이전트" 탭은 별도 이벤트 로그 테이블이 없어 문서·업무의 현재 상태 스냅샷에서 AI 생성 흔적(`proposalContent`/`reqSpecContent`/`sourceDocumentId` 존재 여부)을 역추적해서 재구성함 (2026-08-24 추가)
- [x] "HeyZzabi V2 리뉴얼" 프로젝트명 배지를 전 화면(문서/업무/승인함/PDF/PPTX)에서 제거 — 단, `/projects/[id]` 자체 상세페이지의 H1 타이틀은 유지(그 페이지의 본질적 기능이므로)
- [x] 새 회의록/문서 작성 모달 — 좌(파일첨부)/우(직접입력) 2단 레이아웃으로 개편, 파일 첨부 시 파싱된 텍스트가 자동으로 우측 textarea에 채워짐 (2026-08-24)
- [x] 문서 상세 패널 폭 고정 버그 수정 — `grid-cols-[360px_1fr]` → `minmax(0,1fr)`로 변경해 문서 내용(표 등)에 따라 우측 패널 폭이 밀려서 달라지던 문제 해결, 전체 페이지 폭도 `max-w-7xl→max-w-[1600px]`로 확장하고 문서 템플릿 내부 max-width도 넓힘 (2026-08-24)
- [x] 원본 회의록/메모 표시 규칙 정리 (2026-08-24) — 기획서 생성 전엔 펼쳐서, 생성 후엔 접어서(토글 가능) 보여주고, 요구사항정의서 탭에서는 아예 표시 안 함 (`documents/page.tsx`)
- [x] DEV 롤 토글 실제 계정 전환 (2026-08-24, 위 2번 항목 참고) — `auth.tsx`
- [x] 반려된 기획서/요구사항정의서 **직접 수정** 기능 (2026-08-24) — 담당자가 AI 재생성 없이 `ProposalTemplate`/`ReqSpecTemplate`을 편집 모드(`editable` prop)로 바로 고쳐서 저장 가능. 저장하면 재생성과 동일하게 상태가 DRAFT로 돌아가고 반려 사유가 지워짐. PATCH `/api/projects/[id]/documents/[docId]`가 `proposalContent`/`reqSpecContent`/상태/반려사유 필드를 받도록 확장함
- [x] 히스토리 페이지 페이지네이션 (2026-08-24) — 목록이 길어지면서 요청, 10건씩 잘라서 보여주고 하단에 페이지 번호 버튼 추가 (필터 바꾸면 1페이지로 리셋)
- [x] **업무분배 탭** 신규 추가 (2026-08-24) — 문서생성 파이프라인의 3번째 탭. 요구사항정의서 승인 후, 이 문서에서 나온 업무 전체를 한 번에 보고 AI가 담당자를 추천(워크로드 분산 고려) + WBS 시작/종료일을 코드로 결정적 계산 → PM이 담당자/일정을 리뷰·조정 후 확정하면 바로 진행중 상태로 전환. 담당자별 간트 바 뷰 포함, 확정 후에도 PM은 담당자 재배정 가능(근거는 재배정 시 함께 지워짐). `assign-tasks` 라우트 신규, `Task.assignmentReason` 필드 추가, `/tasks` 페이지에도 10건 페이지네이션 적용. 업무현황(`/tasks`) 리스트/WBS 뷰에도 동일하게 10건 페이지네이션 적용
- [x] `/settings` 페이지 신규 구현 + 고아 라우트 `/roles` 삭제 (2026-08-24) — **에이전트 설정 3종**
  (기획서/요구사항정의서/업무 배분 생성 에이전트별 temperature, 업무 배분 에이전트의 업무 추출
  개수 범위)만 다룸. 처음엔 기본 정보(프로젝트명/설명)·외부 연동(Slack/GitHub) 섹션도 넣었으나,
  기본 정보는 `/projects/[id]` 설정 탭과 중복이고 외부 연동은 아직 실제로 동작하는 기능이 없어
  화면에 있을 이유가 없다는 피드백으로 제거 — 지금 이 화면에서만 의미 있는 것만 남김.
  `Project.agentConfig`(JSON string) 필드를 신설했고 `generate`/`extract-tasks` 라우트가 하드코딩
  값 대신 이 값을 실제로 읽어 OpenAI 호출에 반영함. 환각 방지 원칙(아래 참고)을 지키기 위해
  temperature는 화면 슬라이더뿐 아니라 서버(`src/lib/agentConfig.ts`의 `parseAgentConfig`)에서도
  0~0.3으로 강제 clamp — API를 직접 쳐도 못 벗어남. PM만 수정 가능, 값이 없는(설정 페이지 방문
  전) 프로젝트는 기존 하드코딩 기본값과 완전히 동일하게 동작.
- [x] 문서생성 목록에서 PM에게 아직 검토 요청 전(DRAFT)인 문서 숨김 (2026-08-24) — PM이 직접 만든
  문서는 생성 즉시 APPROVED로 넘어가므로(`autoApprove` 로직), 목록에 DRAFT로 남은 문서는 전부 PM이
  액션할 게 없는 팀원의 작업 중 문서였음. `MEMBER` 화면은 기존과 동일(자기 초안 계속 보임).
- [x] "업무분배"→"업무 배분" 용어 통일 (2026-08-24) — 처음엔 문서생성 상단 스텝퍼만 바꿨다가
  `AgentBadge`/"업무분배 실행" 버튼 등 다른 곳은 그대로라 한 화면에 두 표현이 같이 보이는 걸
  나중에 발견해서 전부 맞춤. 대시보드 카드도 PM/MEMBER가 같은 값(배분승인대기 건수)을 보면서
  서로 다른 라벨("승인 대기"/"검토 요청중")을 쓰던 걸 통일 — "검토 요청중"은 문서 검토 상태
  라벨과 이름이 겹쳐 혼동을 일으켰음. "배분완료" 필터 칩 추가, 문서 목록 카드에 날짜 표시도 같이 함.
- [x] 인앱 알림 (2026-08-24) — `heyzzabi`(v1)의 Notification 모델 + 종 아이콘 패턴을 이식(구조가
  달라 좌측 사이드바가 아니라 대시보드 헤더 우측에 배치, 사용자 지정). `Notification` 모델 신규,
  서버 세션이 없어 다른 라우트와 동일하게 `userId`를 쿼리/바디로 받음. 트리거 4곳: 업무
  `PENDING_APPROVAL` 진입 시 전체 PM, 배분 승인/반려 시 담당자, 문서 검토요청 시 전체 PM —
  문서엔 작성자 필드가 없어 문서 승인/반려는 특정 개인에게 보낼 수 없어 제외(후속 과제, 아래 4절
  "문서 작성자 필드 없음" 참고). `NotificationBell.tsx`: 30초 폴링 + 안읽음 배지 + 드롭다운 + 모두읽음.
- [x] 히스토리 빈 상태 CTA, 승인함 링크, 삭제불가 아이콘 자물쇠 표시, WBS 읽기전용 필드 자물쇠+사유
  표시, 업무 상세 모달 일정/예상시간 재계획 UI(PM 전용) (2026-08-24) — `TODO.md`에 있던 중간/낮은
  우선순위 UX 항목들.
- [x] 직원관리 표: "입사일 / 퇴사일" 헤더 줄바꿈 지점 수정, "OO팀 · 직무명" 셀 강제 한 줄 (2026-08-24)
- [x] 새 회의록/문서 모달의 참석자 선택 목록에서 이름 없는(온보딩 전) 계정이 빈 체크박스로
  뜨던 버그 수정 (2026-08-24) — 다른 화면들과 동일한 `name?.trim()` 필터 적용
- [x] 업무분배 관련 버그 수정 라운드 (2026-08-24, 코드리뷰로 발견) — AI 후보 풀에 PM이 섞여 담당자 드롭다운과 안 맞던 문제, WBS 추천 날짜가 UTC 변환으로 하루 밀리던 타임존 버그, 배치를 여러 번 돌리면 이미 확정된 일정과 겹치던 문제, 칸반에서 수동/AI 배정할 때 `assignmentReason`이 안 지워지거나 안 저장되던 문제, 업무분배 탭 확정 목록의 담당자 드롭다운이 일반유저에게도 열려있던 권한 누락, 페이지네이션이 필터 변경 외의 이유로 목록이 줄면 빈 페이지를 보여주던 경계 버그, Git상태/업무상태 변경 실패 시 조용히 무시되던 문제, 다크테마에서 드롭다운 옵션 글씨 안 보이던 문제 — 전부 수정 완료. 문서 삭제 시 그 문서에서 나온 업무가 `sourceDocumentId`만 남기고 고아가 되는 문제는 발견했으나 수정 안 함(캐스케이드 삭제할지 연결만 끊을지 제품 결정 필요)

## 4. 알려진 미구현 / 개선 필요 항목 (다음에 할 일 후보)

우선순위는 없음 — 사용자와 논의 후 순서 결정 필요.

### 보안/프로덕션 전환 전 필수
- [x] ~~서버 사이드 RBAC 없음~~ — 2026-08-25 **해결**. `src/lib/session.ts`(HttpOnly 서명 쿠키,
  jsonwebtoken 등 새 의존성 없이 HMAC 자체 서명), `src/lib/requireAuth.ts`(`requireAuth`/`requirePM`
  가드)를 추가하고, PM 전용으로 판단되는 라우트 전체(문서/업무 승인·반려, 프로젝트 생성/설정,
  직원 role 변경/삭제/비밀번호 강제초기화/계정생성)에 적용. 부수적으로 발견한 버그도 같이 고침:
  `/api/auth/onboarding`이 클라이언트가 보낸 email만으로 대상을 찾아서(세션 검증 없음) 다른
  계정의 비밀번호를 덮어쓸 수 있던 계정 탈취 경로, `/api/users/[id]/profile`이 본인/타인
  구분과 role 같은 인사정보 필드를 안 가려서 자기 자신을 PM으로 올릴 수 있던 권한상승 경로.
  로그인 페이지의 "DEV 롤 토글"은 이제 UI 미리보기 전용이고(localStorage만 바꿈) 실제 API 권한과
  무관해짐 — 자세한 이유는 `auth.tsx`의 `devToggleRole` 주석 참고.
- [x] ~~비밀번호 평문 저장~~ — 2026-08-25 **해결**. `bcryptjs`로 해싱(`src/lib/passwordHash.ts`).
  기존 평문 계정은 강제 마이그레이션 스크립트 없이, 로그인 성공 시점에 그 계정만 자동으로
  해시로 재저장하는 방식(과도기 동안 평문/해시 계정이 섞여 있어도 `verifyPassword`가 둘 다 지원).
  계정 생성/비밀번호 초기화/변경/온보딩 등 비밀번호를 쓰는 곳 전부 해시로 통일.
- [ ] DEV 롤 토글(`DevRoleToggle.tsx`)은 배포 전 반드시 제거하거나 `NODE_ENV==='development'` 가드 추가
  — 위 RBAC 수정으로 실제 권한에 영향은 없어졌지만(화면 미리보기 전용), 그래도 배포 전엔 정리 필요.

### 기능 미구현 (요구사항 문서에는 있으나 아직 없음)
- [ ] 챗봇/AI 리서치 기능 — 사용자 요청으로 현재 UI에서 의도적으로 숨김 처리됨 (완전 미구현은 아니고 "숨김" 상태, 필요 시 재노출 검토)
- [ ] Slack/Git 실제 연동 — 현재 `gitStatus` 필드는 있지만 수동 드롭다운 선택일 뿐, 실제 GitHub PR 상태 연동이나 Slack 알림 발송은 없음
- [x] ~~지연 업무 자동 감지/알림~~ — 2026-08-25 **해결**. 배경 스케줄러(cron)가 없는 앱이라 업무 목록을
  조회하는 API(`/api/tasks`, `/api/projects/current`)가 호출될 때마다 편승해서 새로 마감일을
  넘긴 업무를 훑는 방식(`src/lib/overdueCheck.ts`)으로 구현 — 담당자+PM 전원에게 알림, `Task.overdueNotifiedAt`으로
  중복 알림 방지(동시 요청 경쟁 상태까지 `UPDATE ... RETURNING` 원자적 처리로 막음). 칸반 카드/업무 리스트/WBS/상세모달에
  "지연" 배지 표시(`src/lib/taskOverdue.ts`). 마감일 당일은 지연으로 안 치고(UTC 자정 기준) 다음날부터 지연 처리.
- [x] ~~설정(`/settings`) 화면~~ — 2026-08-24 **해결**. 아래 3절 참고. 어디에도 안 걸려있던
  고아 라우트 `/roles`는 삭제(역할 변경은 이미 직원관리에서 가능).
- [x] ~~AI 담당자 추천 이력이 영구 저장되지 않음~~ — 2026-08-25 **완전 해결**. 아래 4.1 설계 메모대로 `AssigneeRecommendation` 테이블을 추가해 recommend-assignees(칸반 단건)/assign-tasks(업무분배 배치) 두 경로 모두, 확정 여부와 무관하게 추천 시점의 후보 전체를 저장. 히스토리 페이지에 "담당자 추천 실행" 항목으로 노출.

- [x] ~~`/project/new` "AI 기획 자동화 마법사" — 실제 파이프라인과 어긋난 프로토타입~~ — 2026-08-24 **해결**.
  문서생성 페이지의 정식 파이프라인(회의록→기획서→PM검토/승인→요구사항정의서→승인→업무추출→업무분배)이
  생기기 전에 만들어진 원샷 마법사였음. `/api/ai/parse-meeting`을 `type`별로 3번 나눠 불렀지만 그 라우트는
  `type`을 아예 안 읽어 매번 같은 응답이었고, 검토·승인 게이트를 전부 건너뛰었으며, "음성 녹음"/"파일 업로드"는
  고정된 가짜 텍스트만 붙이는 눈속임이었음(발견 당시 기록은 git log 참고). 마법사를 없애고 `/project/new`를
  프로젝트 이름/설명만 입력받는 단순 폼으로 교체 → 생성 후 `/documents`로 이동해서 정식 파이프라인(회의록
  등록 → AI 기획서 생성 → 검토 → 승인 → …)을 그대로 타도록 함. "새 프로젝트 (AI)" 버튼 라벨들도 "AI"/"마법사"
  표현을 빼서 실제 동작과 맞춤.

### 코드 품질 / 잠재 버그
- [x] ~~`parseProposalDoc(content)!` 같은 non-null assertion 패턴이 여러 곳에 남아있음~~ — 2026-08-25 **해결**. `documents/page.tsx`의 `DocDetail`에서 파싱 결과를 한 번만 계산(`parsedContent`/`parsedProposalRef`)해 null이면 "문서 내용을 표시할 수 없습니다" 폴백 문구를 보여주도록 교체.
- [ ] `history/page.tsx`에 `import Link from "next/link"`가 있는데 실제로는 안 씀 (미사용 import, 사전부터 있던 것으로 이번 세션 변경분 아님)
- [ ] 히스토리 페이지는 진짜 이벤트 로그 테이블이 아니라 현재 상태 스냅샷에서 역추적하는 방식이라, "누가 언제 무엇을 바꿨는지"의 완전한 감사(audit) 이력은 아님. 정확한 감사가 필요하면 `ActivityLog` 같은 전용 테이블을 새로 만들어야 함. (단, 담당자 추천 이력은 이제 `AssigneeRecommendation`이라는 진짜 이벤트 로그 테이블로 저장됨 — 위 4.1 참고.)
- [x] ~~**문서 삭제 시 그 문서에서 나온 업무가 고아가 됨**~~ — 2026-08-25 **해결**. 근본 원인은 approve/reject API가 문서의 현재 상태를 검증하지 않아, 이미 APPROVED된 요구사항정의서를 직접 API 호출로 REJECTED로 되돌린 뒤 삭제(REJECTED는 삭제 가능 상태)할 수 있었던 것 — PENDING_REVIEW 상태에서만 승인/반려 가능하도록 서버에서 검증 추가. `Task.sourceDocumentId`가 실제 relation이 아닌 점(cascade 없음) 자체는 그대로지만, 승인된 문서가 삭제되는 경로 자체를 막았으므로 고아화가 발생하지 않음.

### 4.1 AI 추천 이력 저장 (설계 메모)
필요 시 다음과 같은 최소 스키마로 확장 가능:
```prisma
model AssigneeRecommendation {
  id            String   @id @default(uuid())
  taskId        String
  candidateData String   // JSON: 추천 당시 후보 리스트 + fitScore 등
  createdAt     DateTime @default(now())
}
```
`recommend-assignees` 라우트 마지막에 `prisma.assigneeRecommendation.create(...)` 한 줄 추가하고,
`history/page.tsx`의 `AGENT_KINDS`에 `"agent-recommend"` 종류를 추가하면 됨.

## 5. 이번 세션에서 실제로 고친 버그 (재발 방지용 기록)

- `PUT` vs `PATCH` 불일치로 칸반 드래그/배정이 조용히 실패하던 버그 (405, 화면엔 표시 안 되고 새로고침하면 원복)
- `/project/[id]`(단수, 죽은 라우트) vs `/projects/[id]`(복수, 실제 라우트) 혼용 — 여러 내부 링크가 죽은 라우트를 가리키고 있었음
- 완료검토 게이트로 잘못 설계되어 있던 업무 승인 파이프라인을 배분승인 게이트로 전면 수정 (3번 항목 참고)
- AI 담당자 추천이 항상 빈 배열을 반환하던 버그 — LLM이 UUID 대신 사람 이름을 돌려줘서 매칭 실패, `candidateIndex`(정수) 참조 방식으로 전환해 해결
- 칸반 구현이 3곳에 중복되어 있던 것 → `KanbanBoard.tsx` 하나로 통합
- `backdrop-blur`가 `position:fixed` 모달을 가두는 CSS 버그 → `createPortal(..., document.body)`로 해결

## 6. 개발 환경 메모

- 로컬 실행: `npm run dev --prefix heyzzabi2` (포트 3000), `.claude/launch.json`에 `"heyzzabi2"` 설정으로 등록되어 있음
- Prisma 스키마 변경 시: 반드시 dev 서버를 먼저 내린 뒤(`prisma generate`가 Windows에서 DLL 파일 잠금으로 EPERM 나기 때문) `npx prisma db push --accept-data-loss` → `npx prisma generate` → 서버 재기동 순서로 진행. **2026-08-24 확인**: 다른 세션(다른 터미널/채팅)에서 띄워둔 `next dev`도 똑같이 이 DLL을 잠근다 — `netstat -ano`로 3000번 포트 PID를 찾아 그 프로세스를 내려야 `prisma generate`가 성공함.
- git 저장소로 전환됨(`origin`: `github.com/kimjae9360/heyzzabi2`, 기본 브랜치 `main`) — 커밋 로그도 이제 기록의 일부이니 `git log`도 함께 참고할 것.
