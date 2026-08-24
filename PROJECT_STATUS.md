# HeyZzabi v2 — 프로젝트 현황 / 인수인계 문서

> 이 문서는 다른 계정·다른 세션에서도 바로 이어서 작업할 수 있도록 작성된 현황 요약입니다.
> 최종 갱신: 2026-08-24

## 0. 프로젝트 개요

**헤이 짜비(Hey Zzabi)** — SK Networks AI Camp 31기 캡스톤 프로젝트.
AI 에이전트가 회의록 → 기획서 → 요구사항정의서 → 업무 자동생성/배분까지 이어주는
Next.js 기반 AI 팀 업무 자동화 시스템.

- **개발 방식**: Figma 목업이 아니라 코드 우선(code-first)으로 진행 중. (Figma는 Starter 플랜 레이트리밋에 걸려 보류)
- **단일 프로젝트 전제**: 현재 앱은 "프로젝트가 항상 1개만 존재한다"는 전제로 여러 화면(문서생성/히스토리 등)이 `projects[0]`을 그대로 사용함. 멀티 프로젝트로 확장하려면 이 전제를 깨야 함.
- **스택**: Next.js 16(App Router, Turbopack) · React 19 · Prisma ORM v5.22 + SQLite(`dev.db`) · TypeScript · Tailwind v4 · OpenAI SDK(`gpt-4o-mini`)

## 1. 벤치마킹 대상 (오픈소스 레퍼런스)

Figma가 막힌 이후 "벤치마킹을 직접 코드로 구현" 하는 방향으로 전환. 참고 중인 프로젝트:

- **cdeust/ai-prd-generator** — AI 기반 PRD(제품 요구사항 문서) 자동 생성
- **Zackriya-Solutions/meetily** — 회의록 → 요약/액션아이템 추출
- **Abdulbasit110/meeting-minutes-agent** — 회의록 에이전트 파이프라인
- 로컬 `참고` 폴더에 있는 **NocoBase / OpenProject / Plane** — 칸반/WBS/직원관리 UX 참고

이 레퍼런스들에서 아직 우리 쪽에 반영 안 된 아이디어(향후 검토 가치 있음):
- PRD 버전 히스토리 diff 뷰 (ai-prd-generator)
- 회의록 자동 요약 + 화자별 발언 태깅 (meetily류) — 현재는 원본 텍스트를 그대로 AI에 넘기기만 함
- WBS 간트차트 시각화 (OpenProject/Plane) — 현재 WBS는 표 형태만 존재, 타임라인 시각화 없음

## 2. 핵심 아키텍처 / 컨벤션 (새 세션에서 반드시 알아야 할 것)

- **AI 에이전트 3곳** (사용자가 정의한 범위):
  1. 회의록 → 기획서 생성 (`/api/projects/[id]/documents/[docId]/generate`, type=`proposal`)
  2. 기획서 → 요구사항정의서 생성 (같은 route, type=`reqSpec`, 기획서 `APPROVED` 이후에만 가능)
  3. 요구사항정의서 → 업무 자동 추출(`extract-tasks`) + AI 배치 배정(`assign-tasks`, 2026-08-24부터 — 문서의 업무 전체를 한 번에 보고 배정해 워크로드 분산) + WBS 일정 계산. 문서생성 페이지의 "업무분배" 탭이 이 흐름의 UI. `/tasks` 페이지 칸반 카드의 개별 담당자 배정/재배정은 별도 경로(`recommend-assignees`, 업무 1건씩)로 계속 존재 — 둘 다 `assignmentReason`을 남기므로 어느 경로로 배정해도 근거가 남는다
- **환각(hallucination) 방지 원칙**: 모든 생성 프롬프트에 `NO_HALLUCINATION_RULE`("원본에 없는 사실/기능/수치/일정은 절대 추가하지 마라")을 시스템 메시지에 명시. `temperature: 0.0`, `response_format: json_object`로 구조화 출력 강제. **새 AI 기능을 추가할 때도 이 패턴을 반드시 유지할 것.**
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
- [x] 칸반 보드 통합 — 예전에 3개의 중복 칸반 구현이 있었으나 `KanbanBoard.tsx` 하나로 통합, 배분승인 게이트/반려사유 모두 반영
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
- [x] 업무분배 관련 버그 수정 라운드 (2026-08-24, 코드리뷰로 발견) — AI 후보 풀에 PM이 섞여 담당자 드롭다운과 안 맞던 문제, WBS 추천 날짜가 UTC 변환으로 하루 밀리던 타임존 버그, 배치를 여러 번 돌리면 이미 확정된 일정과 겹치던 문제, 칸반에서 수동/AI 배정할 때 `assignmentReason`이 안 지워지거나 안 저장되던 문제, 업무분배 탭 확정 목록의 담당자 드롭다운이 일반유저에게도 열려있던 권한 누락, 페이지네이션이 필터 변경 외의 이유로 목록이 줄면 빈 페이지를 보여주던 경계 버그, Git상태/업무상태 변경 실패 시 조용히 무시되던 문제, 다크테마에서 드롭다운 옵션 글씨 안 보이던 문제 — 전부 수정 완료. 문서 삭제 시 그 문서에서 나온 업무가 `sourceDocumentId`만 남기고 고아가 되는 문제는 발견했으나 수정 안 함(캐스케이드 삭제할지 연결만 끊을지 제품 결정 필요)

## 4. 알려진 미구현 / 개선 필요 항목 (다음에 할 일 후보)

우선순위는 없음 — 사용자와 논의 후 순서 결정 필요.

### 보안/프로덕션 전환 전 필수
- [ ] **서버 사이드 RBAC 없음**: 현재 모든 권한 체크가 클라이언트(`isPM` 불리언)에만 있음. `/api/tasks/*`, `/api/projects/*/documents/*` 등 API 라우트에 실제 세션/역할 검증이 없어서, 이론상 MEMBER 계정이 PM 전용 API를 직접 호출하면 막을 수단이 없음.
- [ ] **비밀번호 평문 저장** — bcrypt 등으로 해싱 전환 필요
- [ ] DEV 롤 토글(`DevRoleToggle.tsx`)은 배포 전 반드시 제거하거나 `NODE_ENV==='development'` 가드 추가

### 기능 미구현 (요구사항 문서에는 있으나 아직 없음)
- [ ] 챗봇/AI 리서치 기능 — 사용자 요청으로 현재 UI에서 의도적으로 숨김 처리됨 (완전 미구현은 아니고 "숨김" 상태, 필요 시 재노출 검토)
- [ ] Slack/Git 실제 연동 — 현재 `gitStatus` 필드는 있지만 수동 드롭다운 선택일 뿐, 실제 GitHub PR 상태 연동이나 Slack 알림 발송은 없음
- [ ] 지연 업무 자동 감지/알림 — 마감일(`wbsEnd`) 필드는 있지만 이를 기준으로 한 자동 지연 감지 로직 없음
- [ ] 설정(`/settings`) 화면 — 라우트/콘텐츠 미구현
- [x] ~~AI 담당자 추천 이력이 영구 저장되지 않음~~ — 2026-08-24부로 **부분 해결**: 확정된 배정의 근거(`Task.assignmentReason`)는 이제 저장됨(칸반 경로/업무분배 탭 둘 다). 다만 "확정 안 된 다른 후보들"까지 포함한 전체 추천 이력 로그는 여전히 없음 — 그게 필요하면 여전히 아래 4.1 설계 메모(별도 테이블) 방향으로 확장.

### 코드 품질 / 잠재 버그
- [ ] `parseProposalDoc(content)!` 같은 non-null assertion 패턴이 여러 곳에 남아있음 — 레거시 포맷 문서가 섞여 있으면 다시 크래시 가능(과거 한 번 실제로 발생했었음, 특정 테스트 문서만 수동으로 고쳐서 해결한 상태). 근본적으로는 파싱 실패 시 안전한 폴백 UI를 보여주는 방향으로 고치는 게 좋음.
- [ ] `history/page.tsx`에 `import Link from "next/link"`가 있는데 실제로는 안 씀 (미사용 import, 사전부터 있던 것으로 이번 세션 변경분 아님)
- [ ] 히스토리 페이지는 진짜 이벤트 로그 테이블이 아니라 현재 상태 스냅샷에서 역추적하는 방식이라, "누가 언제 무엇을 바꿨는지"의 완전한 감사(audit) 이력은 아님. 정확한 감사가 필요하면 `ActivityLog` 같은 전용 테이블을 새로 만들어야 함.
- [ ] **문서 삭제 시 그 문서에서 나온 업무가 고아가 됨** (2026-08-24 코드리뷰로 발견) — `Task.sourceDocumentId`가 실제 Prisma relation이 아니라 그냥 `String?`이라 `onDelete` cascade가 없음. 문서를 지워도 그 문서가 만든 업무는 DB/`/tasks`에는 남지만, 업무분배 탭에서는(그 문서를 다시 선택할 수 없으니) 더 이상 찾아볼 수 없게 됨. 캐스케이드로 업무까지 지울지, 그냥 연결만 끊고 업무는 남길지는 제품 판단이 필요해서 일부러 안 고침.

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
- Prisma 스키마 변경 시: 반드시 dev 서버를 먼저 내린 뒤(`prisma generate`가 Windows에서 DLL 파일 잠금으로 EPERM 나기 때문) `npx prisma db push --accept-data-loss` → `npx prisma generate` → 서버 재기동 순서로 진행
- git 저장소 아님 — 버전 관리가 안 되어 있으므로, 이 문서와 코드 변경사항이 유일한 기록임. **git init을 고려해볼 것.**
