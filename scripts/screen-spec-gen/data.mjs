import * as K from "./components.mjs";
import { numbered } from "./lib.mjs";

const AUTHOR = "김재원";
const DATE = "2026-08-27";

function b(text, level = 0) {
  return { text, level };
}
function items(defs) {
  return defs.map(([title, bullets]) => ({ title, bullets: bullets.map((x) => (typeof x === "string" ? b(x) : x)) }));
}

// 공용 앱 셸(사이드바+상단바)을 그리고 콘텐츠 영역 좌표를 반환
function shell(x, y, w, h, activeIndex, title) {
  const sidebarW = 200;
  const topbarH = 60;
  let svg = K.sidebar(x, y, sidebarW, h, activeIndex);
  svg += K.topbar(x + sidebarW, y, w - sidebarW, topbarH, title);
  return {
    svg,
    cx: x + sidebarW + 24,
    cy: y + topbarH + 24,
    cw: w - sidebarW - 48,
    ch: h - topbarH - 72,
  };
}

function screen(screenName, summary, itemDefs, draw, opts = {}) {
  return {
    screenName,
    author: AUTHOR,
    date: DATE,
    wireframeTitle: `${screenName} 목업`,
    summary,
    items: items(itemDefs),
    draw,
  };
}

const screens = [];

// ============ 01. 로그인 ============
screens.push(
  screen(
    "로그인",
    "사내 계정(ID/PW)으로 로그인하는 진입 화면. B2B 전용 서비스로 자체 회원가입 기능은 없다.",
    [
      ["아이디 입력(ID)", ["@heyzzabi.com 도메인이 붙는 사내 계정만 사용", "회사(PM)가 발급한 계정으로만 로그인 가능, 자체 가입 불가"]],
      ["비밀번호 입력", ["bcrypt로 해시 저장(과거 평문 계정은 로그인 성공 시 자동 재해시)", "값을 잘못 입력하면 하단에 에러 메시지 노출"]],
      ["로그인 버튼", ["성공 시 HttpOnly 서명 쿠키 세션 발급(src/lib/session.ts, HMAC 자체 서명)", "역할(PM/MEMBER)에 따라 이후 대시보드 뷰가 분기됨"]],
      ["테스트 계정 안내 영역", ["PM(관리자): 아이디 pm / 비번 admin", "MEMBER(신규): 아이디 newbie / 비번 temp → 최초 로그인 시 온보딩으로 강제 이동"]],
    ],
    (x, y, w, h) => {
      const parts = [K.R(x, y, w, h, { fill: "#f8fafc" })];
      const cw = 460,
        ch = 480;
      const cx = x + w / 2 - cw / 2,
        cy = y + h / 2 - ch / 2;
      parts.push(K.card(cx, cy, cw, ch, { rx: 16 }));
      parts.push(K.iconCircle(cx + cw / 2, cy + 54, 22, K.C.accent));
      parts.push(K.T(cx + cw / 2, cy + 60, "Zz", { size: 18, weight: 700, fill: "#fff", anchor: "middle" }));
      parts.push(K.T(cx + cw / 2, cy + 104, "HeyZzabi 로그인", { size: 18, weight: 700, fill: K.C.textPrimary, anchor: "middle" }));
      parts.push(K.T(cx + cw / 2, cy + 126, "B2B 전용 계정입니다. 계정이 없다면 PM에게 문의하세요.", { size: 11.5, weight: 400, fill: K.C.textFaint, anchor: "middle" }));

      const fx = cx + 36,
        fw = cw - 72;
      parts.push(numbered(1, fx - 14, cy + 154, K.inputField(fx, cy + 162, fw, 40, "사내 아이디 (ID)", "@heyzzabi.com")));
      parts.push(numbered(2, fx - 14, cy + 224, K.inputField(fx, cy + 232, fw, 40, "비밀번호", "••••••••")));
      parts.push(numbered(3, fx - 14, cy + 292, K.button(fx, cy + 292, fw, 44, "로그인", "primary")));

      const iy = cy + 356;
      parts.push(K.R(fx, iy, fw, ch - (iy - cy) - 20, { fill: K.C.slateSoft, rx: 8 }));
      parts.push(numbered(4, fx - 14, iy + 4, ""));
      parts.push(K.T(fx + 14, iy + 24, "테스트 계정 안내", { size: 12.5, weight: 700, fill: K.C.textPrimary }));
      parts.push(K.T(fx + 14, iy + 46, "PM: pm / admin", { size: 12, weight: 500, fill: K.C.textMuted }));
      parts.push(K.T(fx + 14, iy + 66, "MEMBER(신규): newbie / temp", { size: 12, weight: 500, fill: K.C.textMuted }));
      return parts.join("");
    },
    { shell: false }
  )
);

// ============ 02. 온보딩 ============
screens.push(
  screen(
    "온보딩",
    "신규 계정이 최초 로그인 시 강제로 진입하는 2단계 위저드. 완료 전까지 다른 화면에 접근할 수 없다.",
    [
      ["STEP 1. 비밀번호 변경", ["임시 비밀번호(temp)를 본인 비밀번호로 교체", "새 비밀번호 재입력 확인 필드 포함"]],
      ["STEP 2. 개인정보 입력", ["연락처(phone) / 기술 스택(techStack)", "자격증(certifications) / 주요 프로젝트 경험(pastProjects)"]],
      ["단계 진행 인디케이터", ["현재 1/2, 2/2 형태로 진행 단계 표시"]],
      ["완료 버튼", ["제출 시 /api/auth/onboarding 호출(세션 검증 포함)", "완료 후 대시보드로 자동 리다이렉트"]],
    ],
    (x, y, w, h) => {
      const parts = [K.R(x, y, w, h, { fill: "#f8fafc" })];
      const cw = 620,
        ch = 560;
      const cx = x + w / 2 - cw / 2,
        cy = y + h / 2 - ch / 2;
      parts.push(K.card(cx, cy, cw, ch, { rx: 16 }));
      parts.push(K.T(cx + cw / 2, cy + 48, "환영합니다! 처음 로그인하셨네요", { size: 18, weight: 700, fill: K.C.textPrimary, anchor: "middle" }));

      // step indicator
      parts.push(numbered(3, cx + cw / 2 - 90, cy + 76, ""));
      parts.push(K.Circle(cx + cw / 2 - 40, cy + 90, 14, { fill: K.C.accent }));
      parts.push(K.T(cx + cw / 2 - 40, cy + 95, "1", { size: 13, weight: 700, fill: "#fff", anchor: "middle" }));
      parts.push(K.L(cx + cw / 2 - 26, cy + 90, cx + cw / 2 + 26, cy + 90, { stroke: K.C.border, sw: 3 }));
      parts.push(K.Circle(cx + cw / 2 + 40, cy + 90, 14, { fill: K.C.slateSoft, stroke: K.C.border, sw: 1.5 }));
      parts.push(K.T(cx + cw / 2 + 40, cy + 95, "2", { size: 13, weight: 700, fill: K.C.textMuted, anchor: "middle" }));

      const fx = cx + 48,
        fw = cw - 96;
      let fy = cy + 140;
      parts.push(numbered(1, fx - 14, fy - 10, ""));
      parts.push(K.T(fx, fy, "STEP 1. 비밀번호 변경", { size: 15, weight: 700, fill: K.C.textPrimary }));
      parts.push(K.inputField(fx, fy + 16, fw, 40, "새 비밀번호", "••••••••"));
      parts.push(K.inputField(fx, fy + 72, fw, 40, "비밀번호 확인", "••••••••"));

      fy += 150;
      parts.push(numbered(2, fx - 14, fy - 10, ""));
      parts.push(K.T(fx, fy, "STEP 2. 개인정보 입력", { size: 15, weight: 700, fill: K.C.textPrimary }));
      parts.push(K.inputField(fx, fy + 16, fw / 2 - 8, 40, "연락처", "010-0000-0000"));
      parts.push(K.inputField(fx + fw / 2 + 8, fy + 16, fw / 2 - 8, 40, "기술 스택", "React, Node.js"));
      parts.push(K.inputField(fx, fy + 72, fw / 2 - 8, 40, "자격증", "정보처리기사"));
      parts.push(K.inputField(fx + fw / 2 + 8, fy + 72, fw / 2 - 8, 40, "주요 프로젝트 경험", "이커머스 리뉴얼"));

      parts.push(numbered(4, fx - 14, cy + ch - 66, K.button(fx, cy + ch - 66, fw, 44, "완료하고 시작하기", "primary")));
      return parts.join("");
    },
    { shell: false }
  )
);

// ============ 03. 대시보드 ============
screens.push(
  screen(
    "대시보드 (PM)",
    "역할별로 분기되는 홈 화면. PM은 팀 전체 KPI·워크로드를, MEMBER는 개인 업무 요약을 본다.",
    [
      ["개요 / 성과 통계 탭", ["개요: 실시간 KPI + 최근 활동 / 성과 통계: 기간별 통계 뷰"]],
      ["KPI 카드 4종", ["전체 업무 · 진행 중 · 배분승인대기 · 완료율", "카드 클릭 시 /tasks 또는 /approvals로 이동"]],
      ["최근 업무 활동 리스트", ["최신 상태변경 5건, 클릭 시 해당 프로젝트로 이동", "전체보기 링크 → /tasks"]],
      ["업무 상태 분포 차트", ["대기 / 진행 중 / 완료 건수를 시각화", "구간 클릭 시 상태 필터가 적용된 /tasks로 이동"]],
      ["진행 중인 프로젝트 리스트", ["프로젝트별 완료율(N/M건 · %) 표시", "새 프로젝트 버튼 → /project/new"]],
      ["팀원별 업무량 차트", ["팀원별 보유 업무 건수를 막대 그래프로 표시(PM 전용)"]],
      ["상단 알림 벨", ["미읽음 배지 + 드롭다운, 30초 폴링, 모두읽음 처리"]],
      ["DEV 롤 토글", ["재로그인 없이 PM↔MEMBER 미리보기 전환, 실제 API 권한과는 무관(배포 전 제거 예정)"]],
      ["프로필 · 설정 · 다크모드", ["우측 상단에서 프로필/설정 이동, Logout, 테마 전환 제공"]],
    ],
    (x, y, w, h) => {
      const s = shell(x, y, w, h, 0, "대시보드");
      const parts = [s.svg];
      parts.push(numbered(7, x + w - 260, y + 20, ""));
      parts.push(numbered(8, x + 205 + 30, y + h - 84, ""));
      parts.push(numbered(9, x + 205 + 130, y + h - 40, ""));

      let cy = s.cy;
      parts.push(numbered(1, s.cx - 14, cy - 6, K.tabsPill(s.cx, cy - 24, [{ label: "개요", active: true }, { label: "성과 통계" }]).svg));
      cy += 24;

      const kpis = [
        ["전체 업무", "54", K.C.accent],
        ["진행 중", "28", K.C.green],
        ["배분승인대기", "0", K.C.amber],
        ["완료율", "6%", K.C.textMuted],
      ];
      const kw = (s.cw - 3 * 16) / 4;
      kpis.forEach((k, i) => {
        const kx = s.cx + i * (kw + 16);
        if (i === 0) parts.push(numbered(2, kx - 14, cy - 6, ""));
        parts.push(K.kpiCard(kx, cy, kw, 92, k[0], k[1], k[2]));
      });
      cy += 92 + 24;

      const colW = (s.cw - 24) / 2;
      parts.push(numbered(3, s.cx - 14, cy - 6, ""));
      parts.push(K.card(s.cx, cy, colW, 240));
      parts.push(K.sectionLabel(s.cx + 16, cy + 30, "최근 업무 활동"));
      const acts = [
        ["모바일 웹 반응형 최적화", "14시간 전"],
        ["출장 보고서 알림 기능 개발", "14시간 전"],
        ["알림 기능 구현", "14시간 전"],
        ["영수증 첨부 기능 구현", "14시간 전"],
      ];
      acts.forEach((a, i) => parts.push(K.listRow(s.cx + 16, cy + 66 + i * 34, colW - 32, a[0], a[1])));

      parts.push(numbered(4, s.cx + colW + 24 - 14, cy - 6, ""));
      parts.push(K.card(s.cx + colW + 24, cy, colW, 240));
      parts.push(K.sectionLabel(s.cx + colW + 40, cy + 30, "업무 상태 분포"));
      parts.push(
        K.stackedBar(s.cx + colW + 40, cy + 66, colW - 32, 16, [
          { label: "대기", value: 23, color: K.C.amber },
          { label: "진행 중", value: 28, color: K.C.accent },
          { label: "완료", value: 3, color: K.C.green },
        ])
      );
      cy += 240 + 24;

      parts.push(numbered(5, s.cx - 14, cy - 6, ""));
      parts.push(K.card(s.cx, cy, colW, 230));
      parts.push(K.sectionLabel(s.cx + 16, cy + 30, "진행 중인 프로젝트 (3건)"));
      const projs = [
        ["신규 쇼핑몰 프로젝트 킥오프 회의록", 10],
        ["사내 인트라넷 고도화", 0],
        ["test", 5],
      ];
      projs.forEach((p, i) => {
        const py = cy + 62 + i * 48;
        parts.push(K.T(s.cx + 16, py, p[0], { size: 12.5, weight: 600, fill: K.C.textPrimary }));
        parts.push(K.progressBar(s.cx + 16, py + 10, colW - 32, 8, p[1]));
      });

      parts.push(numbered(6, s.cx + colW + 24 - 14, cy - 6, ""));
      parts.push(K.card(s.cx + colW + 24, cy, colW, 230));
      parts.push(K.sectionLabel(s.cx + colW + 40, cy + 30, "팀원별 업무량"));
      parts.push(
        K.barChart(s.cx + colW + 40, cy + 50, colW - 64, 140, [
          { label: "이백엔", value: 11, color: K.C.accent },
          { label: "김프론", value: 9, color: K.C.accent },
          { label: "김가율", value: 3, color: K.C.accent },
          { label: "박디쟌", value: 4, color: K.C.accent },
        ])
      );
      return parts.join("");
    }
  )
);

// ============ 04. 문서생성 - 목록 ============
screens.push(
  screen(
    "문서생성 - 목록",
    "회의록을 등록하면 AI가 기획서→요구사항정의서→업무배분까지 이어서 만들어주는 파이프라인의 시작 화면.",
    [
      ["상단 탭: 기획서 / 요구사항정의서 / 업무 배분", ["요구사항정의서 탭은 기획서 승인 후에만 진입 가능", "업무 배분 탭은 요구사항정의서 승인 후에만 노출"]],
      ["새 회의록 / 문서 버튼", ["좌: 파일 첨부(.txt/.md/.docx/.pdf) / 우: 직접 입력 2단 모달", "파일 첨부 시 파싱된 텍스트가 우측 입력창에 자동 반영"]],
      ["상태 필터 칩", ["전체 · 검토요청중 · 승인됨 · 반려됨, 각 건수 표시"]],
      ["문서 카드 리스트", ["회의록 제목 · 상태 배지(미생성/배분필요/배분완료/반려됨) · 등록일", "PM 화면에서는 검토요청 전(DRAFT) 문서는 숨김 처리"]],
    ],
    (x, y, w, h) => {
      const s = shell(x, y, w, h, 1, "문서생성");
      const parts = [s.svg];
      let cy = s.cy;
      parts.push(numbered(1, s.cx - 14, cy - 6, K.topTabs(s.cx, cy - 14, [{ label: "기획서", active: true }, { label: "요구사항정의서" }, { label: "업무 배분" }])));
      const bw = 170;
      parts.push(numbered(2, s.cx + s.cw - bw - 14, cy - 24, K.button(s.cx + s.cw - bw, cy - 24, bw, 36, "+ 새 회의록/문서", "primary")));
      cy += 36;

      const chips = [
        ["전체 5", "blue"],
        ["검토요청중 0", "slate"],
        ["승인됨 4", "green"],
        ["반려됨 1", "red"],
      ];
      let chx = s.cx;
      parts.push(numbered(3, s.cx - 14, cy - 6, ""));
      chips.forEach((c) => {
        const bd = K.badge(chx, cy, c[0], c[1]);
        parts.push(bd.svg);
        chx += bd.w + 10;
      });
      cy += 46;

      const docs = [
        ["HeyZzabi V8 대규모 업데이트/기획 회의", "배분 필요", "amber", "2026.08.20"],
        ["HeyZzabi V3 대규모 업데이트 기획 회의", "배분완료", "green", "2026.08.22"],
        ["HeyZzabi V3 대규모 업데이트 기획 회의", "미생성", "slate", "2026.08.13"],
        ["내부 인트라넷 인사관리 기능 추가 회의록", "반려됨", "red", "2026.08.20"],
        ["신규 쇼핑몰 프로젝트 킥오프 회의록", "미생성", "slate", "2026.08.20"],
      ];
      parts.push(numbered(4, s.cx - 14, cy - 6, ""));
      docs.forEach((d, i) => {
        const cw = s.cw;
        const ch = 64;
        const dy = cy + i * (ch + 12);
        parts.push(K.card(s.cx, dy, cw, ch));
        parts.push(K.T(s.cx + 18, dy + 27, d[0], { size: 14, weight: 600, fill: K.C.textPrimary }));
        parts.push(K.T(s.cx + 18, dy + 48, d[3], { size: 11.5, weight: 400, fill: K.C.textFaint }));
        const bd = K.badge(s.cx + cw - 120, dy + 18, d[1], d[2]);
        parts.push(bd.svg);
      });
      return parts.join("");
    }
  )
);

// ============ 05. 문서생성 상세 ============
screens.push(
  screen(
    "문서생성 - 기획서/요구사항정의서",
    "선택한 회의록을 바탕으로 AI가 기획서·요구사항정의서를 생성하고, PM이 검토/승인/반려하는 화면.",
    [
      ["원본 회의록/메모 표시 영역", ["기획서 생성 전엔 펼침, 생성 후엔 접기 토글 가능", "요구사항정의서 탭에서는 표시하지 않음"]],
      ["AI 기획서 생성 버튼(AGENT)", ["gpt-4o-mini 호출, NO_HALLUCINATION_RULE로 원본 외 내용 생성을 금지", "temperature는 /settings의 에이전트 설정에서 읽어옴(서버 0~0.3 강제 clamp)"]],
      ["문서 본문(ProposalTemplate)", ["반려된 문서는 PM이 AI 재생성 없이 직접 수정(editable) 가능", "저장 시 상태는 DRAFT로 복귀되고 반려사유는 초기화"]],
      ["검토요청 / 승인 / 반려 버튼", ["MEMBER가 검토요청 → PM이 승인 또는 반려(사유 필수)", "기획서 승인과 요구사항정의서 승인은 서로 독립적인 게이트"]],
      ["PDF / PPTX 출력", ["문서는 브라우저 인쇄로 PDF, 기획서는 pptxgenjs로 PPTX 내보내기"]],
      ["문서 삭제", ["확인 모달 포함. 삭제 시 파생 업무는 원본 연결만 끊어진 채 남음(정책 미확정)"]],
    ],
    (x, y, w, h) => {
      const s = shell(x, y, w, h, 1, "문서생성");
      const parts = [s.svg];
      let cy = s.cy;
      parts.push(K.topTabs(s.cx, cy - 14, [{ label: "기획서", active: true }, { label: "요구사항정의서" }, { label: "업무 배분" }]));
      cy += 30;

      parts.push(numbered(1, s.cx - 14, cy - 6, ""));
      parts.push(K.card(s.cx, cy, s.cw, 70));
      parts.push(K.T(s.cx + 16, cy + 26, "원본 회의록 (펼침/접기 토글)", { size: 13, weight: 700, fill: K.C.textPrimary }));
      parts.push(K.T(s.cx + 16, cy + 48, "신규 쇼핑몰 프로젝트 킥오프 회의 — 참석자, 논의 안건, 결정 사항 원문 텍스트...", { size: 11.5, weight: 400, fill: K.C.textFaint }));
      cy += 90;

      const bw = 170;
      parts.push(numbered(2, s.cx - 14, cy - 6, K.button(s.cx, cy, bw, 36, "AI 기획서 생성", "primary")));
      parts.push(K.badge(s.cx + bw + 12, cy + 2, "AGENT", "blue").svg);
      cy += 56;

      parts.push(numbered(3, s.cx - 14, cy - 6, ""));
      parts.push(K.card(s.cx, cy, s.cw, 300));
      parts.push(K.T(s.cx + 16, cy + 28, "1. 프로젝트 개요", { size: 13.5, weight: 700, fill: K.C.textPrimary }));
      [0, 1, 2].forEach((i) => parts.push(K.L(s.cx + 16, cy + 46 + i * 16, s.cx + s.cw - 16, cy + 46 + i * 16, { stroke: K.C.border })));
      parts.push(K.T(s.cx + 16, cy + 108, "2. 요구사항 상세", { size: 13.5, weight: 700, fill: K.C.textPrimary }));
      [0, 1, 2, 3].forEach((i) => parts.push(K.L(s.cx + 16, cy + 126 + i * 16, s.cx + s.cw - 16, cy + 126 + i * 16, { stroke: K.C.border })));
      cy += 320;

      parts.push(numbered(4, s.cx - 14, cy - 6, ""));
      parts.push(K.button(s.cx, cy, 140, 36, "검토요청", "outline"));
      parts.push(K.button(s.cx + 152, cy, 100, 36, "승인", "primary"));
      parts.push(K.button(s.cx + 264, cy, 100, 36, "반려", "outline"));

      parts.push(numbered(5, s.cx + s.cw - 260 - 14, cy - 6, ""));
      parts.push(K.button(s.cx + s.cw - 260, cy, 120, 36, "PDF 출력", "outline"));
      parts.push(K.button(s.cx + s.cw - 130, cy, 130, 36, "PPTX 출력", "outline"));

      parts.push(numbered(6, s.cx - 14, cy + 56, K.button(s.cx, cy + 56, 100, 32, "삭제", "ghost")));
      return parts.join("");
    }
  )
);

// ============ 06. 문서생성 - 업무배분 ============
screens.push(
  screen(
    "문서생성 - 업무 배분",
    "요구사항정의서 승인 후, 추출된 업무 전체를 한 번에 보고 담당자·일정을 확정하는 3번째 탭.",
    [
      ["업무 추출 실행", ["요구사항정의서에서 업무 목록을 AI가 자동 생성(extract-tasks)", "재추출 시 아직 손대지 않은(BACKLOG) 업무만 교체, 진행중/완료 업무는 보존"]],
      ["담당자별 간트 바 뷰", ["일자별로 담당자에게 배정된 업무를 막대로 시각화"]],
      ["업무 테이블(업무명/배정근거/담당자/일정/상태)", ["AI 추천 배정근거(기술적합도·업무여유도·유사경험)를 함께 표시", "담당자 드롭다운은 PM만 변경 가능"]],
      ["나머지 배분 추천받기 버튼", ["assign-tasks 라우트 호출, 팀 워크로드 분산을 고려해 일괄 추천"]],
      ["확정 버튼", ["확정 시 배분승인대기를 거치지 않고 바로 진행중으로 전환(PM이 이미 근거를 검토했으므로)", "확정 후에도 PM 재배정 가능(재배정 시 배정근거는 초기화)"]],
    ],
    (x, y, w, h) => {
      const s = shell(x, y, w, h, 1, "문서생성");
      const parts = [s.svg];
      let cy = s.cy;
      parts.push(K.topTabs(s.cx, cy - 14, [{ label: "기획서", done: true }, { label: "요구사항정의서", done: true }, { label: "업무 배분", active: true }]));
      cy += 30;

      parts.push(numbered(1, s.cx - 14, cy - 6, K.button(s.cx, cy, 150, 34, "업무 추출 실행", "outline")));
      cy += 54;

      parts.push(numbered(2, s.cx - 14, cy - 6, ""));
      parts.push(K.card(s.cx, cy, s.cw, 150));
      parts.push(K.T(s.cx + 16, cy + 26, "담당자별 간트 바 (8/26 ~ 8/27)", { size: 13, weight: 700, fill: K.C.textPrimary }));
      const people = ["이백엔", "김가율", "김프론"];
      people.forEach((p, i) => {
        const py = cy + 50 + i * 32;
        parts.push(K.T(s.cx + 16, py + 14, p, { size: 12, weight: 600, fill: K.C.textMuted }));
        parts.push(K.R(s.cx + 100 + i * 140, py, 120, 20, { fill: K.C.accentSoft, rx: 6 }));
      });
      cy += 172;

      parts.push(numbered(3, s.cx - 14, cy - 6, ""));
      const tbl = K.table(
        s.cx,
        cy,
        s.cw,
        ["업무명 / 배정 근거", "담당자", "일정", "상태"],
        [
          ["슬랙 연동 기능 개발", "이백엔", "8.27~8.27", "진행 중"],
          ["파일 첨부 기능 고도화", "김가율", "8.26~8.26", "완료"],
          ["깃허브 연동 기능 개발", "이백엔", "8.26~8.26", "진행 중"],
          ["하위 체크리스트 기능 구현", "김프론", "8.26~8.26", "진행 중"],
        ],
        [s.cw * 0.44, s.cw * 0.16, s.cw * 0.22, s.cw * 0.18]
      );
      parts.push(tbl.svg);
      cy += tbl.height + 20;

      parts.push(numbered(4, s.cx - 14, cy - 6, K.button(s.cx, cy, 190, 36, "나머지 배분 추천받기", "outline")));
      parts.push(numbered(5, s.cx + 210 - 14, cy - 6, K.button(s.cx + 210, cy, 110, 36, "확정", "primary")));
      return parts.join("");
    }
  )
);

// ============ 07. 업무관리 - 칸반 ============
screens.push(
  screen(
    "업무관리 - 칸반 뷰",
    "업무를 상태별 칸반 보드로 관리하는 화면. 내 업무 / 전체 업무 토글을 지원한다.",
    [
      ["내 업무 / 전체 업무 토글", ["MEMBER는 기본적으로 본인 업무만 표시, 토글로 전체 조회"]],
      ["검색창", ["업무명 · 프로젝트 · 담당자 기준으로 필터"]],
      ["뷰 전환: 칸반 / 리스트 / WBS", ["세 가지 보기 방식이 동일한 데이터를 기준으로 렌더링"]],
      ["칸반 컬럼(대기/배분승인대기/진행중/완료)", ["배분승인대기는 '담당자 배분 승인' 게이트이지 완료 검토가 아님"]],
      ["업무 카드", ["담당자 · 마감일 · 지연 배지(마감 익일부터 표시)", "드래그로 상태 변경 시 배정근거가 함께 저장/초기화됨"]],
      ["페이지네이션", ["10건씩 표시, 필터 변경 시 1페이지로 리셋"]],
    ],
    (x, y, w, h) => {
      const s = shell(x, y, w, h, 2, "업무관리");
      const parts = [s.svg];
      let cy = s.cy;
      parts.push(numbered(1, s.cx - 14, cy - 6, K.tabsPill(s.cx, cy - 24, [{ label: "내 업무" }, { label: "전체 업무", active: true }]).svg));
      parts.push(numbered(2, s.cx + 250 - 14, cy - 24, K.inputField(s.cx + 250, cy - 24, 260, 34, null, "업무명, 프로젝트, 담당자 검색...")));
      const vw = 260;
      parts.push(numbered(3, s.cx + s.cw - vw - 14, cy - 24, K.tabsPill(s.cx + s.cw - vw, cy - 24, [{ label: "칸반", active: true }, { label: "리스트" }, { label: "WBS" }]).svg));
      cy += 30;

      const cols = [
        { title: "대기", count: 6, color: K.C.textMuted, cards: [{ title: "알림 기능 구현", assignee: "미할당" }, { title: "영수증 첨부 기능 구현", assignee: "미할당" }] },
        { title: "배분승인대기", count: 0, color: K.C.amber, cards: [] },
        { title: "진행 중", count: 3, color: K.C.accent, cards: [{ title: "슬랙 연동 기능 개발", assignee: "이백엔" }, { title: "깃허브 연동 기능 개발", assignee: "이백엔" }] },
        { title: "완료", count: 1, color: K.C.green, cards: [{ title: "파일 첨부 기능 고도화", assignee: "김가율" }] },
      ];
      const colW = (s.cw - 3 * 16) / 4;
      parts.push(numbered(4, s.cx - 14, cy - 6, ""));
      cols.forEach((c, i) => {
        parts.push(K.kanbanColumn(s.cx + i * (colW + 16), cy, colW, s.ch - 40, c.title, c.count, c.cards, c.color));
      });
      parts.push(numbered(5, s.cx + 2 * (colW + 16) - 14, cy + 40, ""));

      const py = y + h - 34;
      parts.push(numbered(6, s.cx + s.cw / 2 - 60, py - 4, ""));
      [1, 2, 3, 4, 5, 6].forEach((n, i) => {
        const bx = s.cx + s.cw / 2 - 80 + i * 30;
        parts.push(K.R(bx, py, 24, 24, { fill: i === 0 ? K.C.accent : "#fff", stroke: K.C.border, sw: 1, rx: 6 }));
        parts.push(K.T(bx + 12, py + 16, String(n), { size: 11, weight: 600, fill: i === 0 ? "#fff" : K.C.textMuted, anchor: "middle" }));
      });
      return parts.join("");
    }
  )
);

// ============ 08. 업무관리 - 리스트 ============
screens.push(
  screen(
    "업무관리 - 리스트 뷰",
    "업무를 표 형태로 나열해 상태 변경과 정렬을 더 쉽게 하는 뷰.",
    [
      ["테이블 헤더", ["업무명 · 담당자 · 상태 · 마감일 등 컬럼 구성"]],
      ["상태 드롭다운", ["행에서 바로 대기/진행중/완료로 상태 변경, 칸반과 동일 데이터에 반영"]],
      ["지연 배지", ["마감일 경과 업무에 표시, 담당자+PM 전원에게 알림 발송(Task.overdueNotifiedAt으로 중복 방지)"]],
      ["행 클릭 → 업무 상세 모달", ["일정/예상시간 재계획 UI(PM 전용) 포함"]],
    ],
    (x, y, w, h) => {
      const s = shell(x, y, w, h, 2, "업무관리");
      const parts = [s.svg];
      let cy = s.cy;
      parts.push(K.tabsPill(s.cx, cy - 24, [{ label: "칸반" }, { label: "리스트", active: true }, { label: "WBS" }]));
      cy += 20;

      parts.push(numbered(1, s.cx - 14, cy - 6, ""));
      const rows = [
        ["슬랙 연동 기능 개발", "이백엔", "진행 중", "8.27"],
        ["파일 첨부 기능 고도화", "김가율", "완료", "8.26"],
        ["깃허브 연동 기능 개발", "이백엔", "진행 중", "8.26"],
        ["하위 체크리스트 기능 구현", "김프론", "지연", "8.20"],
        ["연차 신청 UI 개발", "박디쟌", "대기", "8.30"],
      ];
      const tbl = K.table(s.cx, cy, s.cw, ["업무명", "담당자", "상태", "마감일"], rows, [s.cw * 0.44, s.cw * 0.18, s.cw * 0.2, s.cw * 0.18]);
      parts.push(tbl.svg);
      parts.push(numbered(2, s.cx + s.cw * 0.44 + s.cw * 0.18 - 14, cy + 34 + 20, ""));
      parts.push(numbered(3, s.cx + s.cw * 0.44 + s.cw * 0.18 + s.cw * 0.2 - 14, cy + 34 + 20 + 40 * 3, K.badge(s.cx + s.cw * 0.44 + s.cw * 0.18 + s.cw * 0.2 + 40, cy + 34 + 20 + 40 * 3 - 4, "지연", "red").svg));
      parts.push(numbered(4, s.cx - 14, cy + tbl.height + 20, ""));
      parts.push(K.T(s.cx, cy + tbl.height + 20, "행 클릭 시 업무 상세 모달이 열립니다", { size: 12.5, weight: 500, fill: K.C.textFaint }));
      return parts.join("");
    }
  )
);

// ============ 09. 업무관리 - WBS ============
screens.push(
  screen(
    "업무관리 - WBS 뷰",
    "프로젝트 업무를 일정 기준으로 보는 뷰. 진행률 요약과 Git 상태 컬럼을 포함한다.",
    [
      ["진행률 요약 바", ["전체 업무 대비 완료 업무 비율 표시"]],
      ["Git 상태 컬럼", ["수동 드롭다운 선택 값(실제 GitHub PR 연동은 아직 없음)"]],
      ["일정(시작일~종료일) 컬럼", ["코드로 결정적으로 계산된 추천 일정, PM이 조정 가능"]],
      ["읽기전용 필드 잠금 표시", ["확정된 업무는 일부 필드가 잠기며 자물쇠 아이콘 + 사유가 함께 표시"]],
    ],
    (x, y, w, h) => {
      const s = shell(x, y, w, h, 2, "업무관리");
      const parts = [s.svg];
      let cy = s.cy;
      parts.push(K.tabsPill(s.cx, cy - 24, [{ label: "칸반" }, { label: "리스트" }, { label: "WBS", active: true }]));
      cy += 20;

      parts.push(numbered(1, s.cx - 14, cy - 6, ""));
      parts.push(K.card(s.cx, cy, s.cw, 54));
      parts.push(K.T(s.cx + 16, cy + 22, "전체 진행률 6% (3/54건 완료)", { size: 12.5, weight: 700, fill: K.C.textPrimary }));
      parts.push(K.progressBar(s.cx + 16, cy + 32, s.cw - 32, 8, 6));
      cy += 74;

      parts.push(numbered(2, s.cx - 14, cy - 6, ""));
      parts.push(numbered(3, s.cx + s.cw * 0.7 - 14, cy - 6, ""));
      const rows = [
        ["슬랙 연동 기능 개발", "PR 리뷰중", "8.27 ~ 8.27", "🔒"],
        ["파일 첨부 기능 고도화", "머지완료", "8.26 ~ 8.26", "🔒"],
        ["깃허브 연동 기능 개발", "작업중", "8.26 ~ 8.26", ""],
      ];
      const tbl = K.table(s.cx, cy, s.cw, ["업무명", "Git 상태", "일정", "잠금"], rows, [s.cw * 0.4, s.cw * 0.3, s.cw * 0.2, s.cw * 0.1]);
      parts.push(tbl.svg);
      parts.push(numbered(4, s.cx + s.cw - s.cw * 0.1 - 14, cy + 34 + 4, ""));
      return parts.join("");
    }
  )
);

// ============ 10. 결재함 ============
screens.push(
  screen(
    "결재함",
    "PM이 팀원의 배분 승인 요청을 처리하는 큐. 업무관리 칸반의 배분승인대기 컬럼과 동일한 목록이다.",
    [
      ["대기 중인 요청 리스트", ["요청이 없을 때는 빈 상태 안내 문구 노출"]],
      ["승인 버튼", ["승인 시 업무 상태가 진행중(IN_PROGRESS)으로 전환"]],
      ["반려 버튼", ["반려 시 대기(BACKLOG)로 되돌리고 담당자 해제, 반려 사유 입력이 필수"]],
      ["요청 클릭 → 원본 이동", ["클릭 시 해당 업무/프로젝트로 이동"]],
    ],
    (x, y, w, h) => {
      const s = shell(x, y, w, h, -1, "결재함");
      const parts = [s.svg];
      let cy = s.cy;
      parts.push(K.T(s.cx, cy - 4, "배분 승인 대기함", { size: 20, weight: 700, fill: K.C.textPrimary }));
      cy += 30;

      parts.push(numbered(1, s.cx - 14, cy - 6, ""));
      const reqs = [
        ["연차 신청 UI 개발", "박디쟌 배정 요청"],
        ["반차 선택 옵션 추가", "김프론 배정 요청"],
      ];
      reqs.forEach((r, i) => {
        const ry = cy + i * 84;
        parts.push(K.card(s.cx, ry, s.cw, 68));
        parts.push(K.T(s.cx + 16, ry + 26, r[0], { size: 13.5, weight: 700, fill: K.C.textPrimary }));
        parts.push(K.T(s.cx + 16, ry + 46, r[1], { size: 11.5, weight: 400, fill: K.C.textFaint }));
        parts.push(numbered(2, s.cx + s.cw - 230 - 14, ry + 18, K.button(s.cx + s.cw - 230, ry + 16, 100, 34, "승인", "primary")));
        parts.push(numbered(3, s.cx + s.cw - 118 - 14, ry + 18, K.button(s.cx + s.cw - 118, ry + 16, 100, 34, "반려", "outline")));
      });
      parts.push(numbered(4, s.cx - 14, cy - 6, ""));
      return parts.join("");
    }
  )
);

// ============ 11. 직원관리 ============
screens.push(
  screen(
    "직원관리",
    "팀원 계정과 역할/권한을 관리하는 화면. PM만 CRUD가 가능하다.",
    [
      ["상태 요약 칩", ["전체 · 활성 · 휴직 · 퇴사 · 잠금 인원수"]],
      ["직원 추가 버튼", ["PM 전용, 계정 생성 시 비밀번호는 해시로 저장"]],
      ["직원 테이블", ["직원/부서·직급·직무/기술스택/입사일·퇴사일/역할/상태/업무량/설정 컬럼(FR-02-003 필드 100% 반영)"]],
      ["역할 드롭다운(PM/일반 멤버/게스트)", ["게스트는 읽기 전용 + 코멘트만 가능"]],
      ["상태 드롭다운(활성/휴직/퇴사/잠금)", []],
      ["설정 버튼 → 정보수정 모달", ["2단 컬럼 레이아웃(세로로 너무 길다는 피드백 반영)", "비밀번호 강제초기화 포함"]],
      ["권한 안내 카드", ["PM/일반 멤버/게스트별로 가능한 동작을 하단에 정리"]],
    ],
    (x, y, w, h) => {
      const s = shell(x, y, w, h, 4, "직원관리");
      const parts = [s.svg];
      let cy = s.cy;
      const chips = [
        ["전체 6", "slate"],
        ["활성 6", "green"],
        ["휴직 0", "amber"],
        ["퇴사 0", "slate"],
        ["잠금 0", "red"],
      ];
      let chx = s.cx;
      parts.push(numbered(1, s.cx - 14, cy - 6, ""));
      chips.forEach((c) => {
        const bd = K.badge(chx, cy - 22, c[0], c[1]);
        parts.push(bd.svg);
        chx += bd.w + 8;
      });
      parts.push(numbered(2, s.cx + s.cw - 130 - 14, cy - 30, K.button(s.cx + s.cw - 130, cy - 30, 130, 34, "+ 직원 추가", "primary")));
      cy += 30;

      parts.push(numbered(3, s.cx - 14, cy - 6, ""));
      const rows = [
        ["김가율", "개발팀", "React,TS,Vue", "PM ▾", "활성 ▾", "3건"],
        ["박디쟌", "디자인팀", "Figma,UI/UX", "PM ▾", "활성 ▾", "4건"],
        ["이백엔", "개발팀", "Node.js,Prisma", "PM ▾", "활성 ▾", "11건"],
        ["김프론", "개발팀", "React,TS", "PM ▾", "활성 ▾", "9건"],
      ];
      const tbl = K.table(s.cx, cy, s.cw, ["직원", "부서/직급", "기술 스택", "역할", "상태", "업무량"], rows, [s.cw * 0.2, s.cw * 0.16, s.cw * 0.24, s.cw * 0.14, s.cw * 0.14, s.cw * 0.12]);
      parts.push(tbl.svg);
      parts.push(numbered(4, s.cx + s.cw * 0.6 - 14, cy + 34 + 4, ""));
      parts.push(numbered(5, s.cx + s.cw * 0.74 - 14, cy + 34 + 4, ""));
      cy += tbl.height + 14;
      parts.push(numbered(6, s.cx + s.cw - 90, cy - 20, K.button(s.cx + s.cw - 90, cy - 40, 80, 28, "설정", "outline")));
      cy += 24;

      parts.push(numbered(7, s.cx - 14, cy + 10, ""));
      parts.push(K.card(s.cx, cy + 16, s.cw, s.ch - (cy + 16 - s.cy)));
      parts.push(K.T(s.cx + 16, cy + 40, "권한 안내: PM(생성/삭제/승인) · 일반 멤버(수정/검토요청) · 게스트(읽기전용)", { size: 12, weight: 500, fill: K.C.textMuted }));
      return parts.join("");
    }
  )
);

// ============ 12. 프로젝트 신규 생성 ============
screens.push(
  screen(
    "프로젝트 신규 생성",
    "프로젝트명/설명만 입력받는 단순 폼. 예전의 'AI 기획 자동화 마법사'는 실제 파이프라인과 어긋나 폐기되었다.",
    [
      ["프로젝트 이름 입력(필수)", []],
      ["설명 입력(선택)", []],
      ["프로젝트 생성하고 문서생성으로 이동 버튼", ["생성 후 /documents로 이동해 회의록 등록부터 정식 파이프라인을 그대로 진행"]],
    ],
    (x, y, w, h) => {
      const s = shell(x, y, w, h, -1, "새 프로젝트 만들기");
      const parts = [s.svg];
      const cw = 640;
      const cx = s.cx + (s.cw - cw) / 2;
      let cy = s.cy + 30;
      parts.push(K.card(cx, cy, cw, 300, { rx: 16 }));
      parts.push(K.T(cx + 32, cy + 42, "새 프로젝트 만들기", { size: 18, weight: 700, fill: K.C.textPrimary }));
      parts.push(K.T(cx + 32, cy + 64, "프로젝트를 만들고 나면 문서생성 화면에서 회의록을 등록해 시작합니다.", { size: 11.5, weight: 400, fill: K.C.textFaint }));

      parts.push(numbered(1, cx + 18, cy + 100, K.inputField(cx + 32, cy + 108, cw - 64, 42, "프로젝트 이름 *", "예: 사내 인트라넷 고도화")));
      parts.push(numbered(2, cx + 18, cy + 168, K.inputField(cx + 32, cy + 176, cw - 64, 60, "설명 (선택)", "프로젝트에 대한 간단한 설명")));
      parts.push(numbered(3, cx + 18, cy + 250, K.button(cx + 32, cy + 250, cw - 64, 44, "프로젝트 생성하고 문서생성으로 이동", "primary")));
      return parts.join("");
    }
  )
);

// ============ 13. 프로젝트 상세 ============
screens.push(
  screen(
    "프로젝트 상세",
    "프로젝트 단위로 업무를 칸반/WBS로 보고 설정을 관리하는 화면.",
    [
      ["진행률 / 완료 업무 요약", ["N/M건 · % 형태로 표시"]],
      ["탭: 칸반 보드 / WBS(목록) / 설정", []],
      ["업무 검색창 + 새 업무 버튼", ["프로젝트 내에서 수동으로 업무 추가 가능"]],
      ["칸반 보드(대기/배분승인대기/진행중/완료)", ["업무관리(/tasks) 페이지와 동일한 KanbanBoard 컴포넌트를 재사용"]],
      ["설정 탭", ["프로젝트명/설명 등 기본 정보 수정(에이전트 설정은 별도 /settings 화면)"]],
    ],
    (x, y, w, h) => {
      const s = shell(x, y, w, h, -1, "신규 쇼핑몰 프로젝트 킥오프 회의록");
      const parts = [s.svg];
      let cy = s.cy;
      parts.push(numbered(1, s.cx - 14, cy - 6, ""));
      parts.push(K.T(s.cx, cy - 6, "진행률 10%  ·  완료 업무 1/10", { size: 13, weight: 600, fill: K.C.textMuted }));
      cy += 20;
      parts.push(numbered(2, s.cx - 14, cy - 6, K.tabsPill(s.cx, cy - 24, [{ label: "칸반 보드", active: true }, { label: "WBS(목록)" }, { label: "설정" }]).svg));
      parts.push(numbered(3, s.cx + s.cw - 260 - 14, cy - 24, K.inputField(s.cx + s.cw - 260, cy - 24, 140, 34, null, "업무 검색...")));
      parts.push(K.button(s.cx + s.cw - 108, cy - 24, 108, 34, "+ 새 업무", "primary"));
      cy += 30;

      const cols = [
        { title: "대기", count: 6, color: K.C.textMuted, cards: [{ title: "알림 기능 구현" }, { title: "출장 보고서 알림" }] },
        { title: "배분승인대기", count: 0, color: K.C.amber, cards: [] },
        { title: "진행 중", count: 3, color: K.C.accent, cards: [{ title: "슬랙 연동 기능 개발", assignee: "이백엔" }] },
        { title: "완료", count: 1, color: K.C.green, cards: [{ title: "파일 첨부 기능 고도화", assignee: "김가율" }] },
      ];
      const colW = (s.cw - 3 * 16) / 4;
      parts.push(numbered(4, s.cx - 14, cy - 6, ""));
      cols.forEach((c, i) => parts.push(K.kanbanColumn(s.cx + i * (colW + 16), cy, colW, s.ch - 30, c.title, c.count, c.cards, c.color)));
      parts.push(numbered(5, s.cx + 3 * (colW + 16) - 14, s.cy - 26, ""));
      return parts.join("");
    }
  )
);

// ============ 14. AI 허브 ============
screens.push(
  screen(
    "AI 허브",
    "프로젝트 데이터 기반 사내 업무 어시스턴트 챗봇. 사용자 요청으로 현재 UI 내비게이션에서는 숨김 처리된 기능(직접 URL 접근 시에만 노출).",
    [
      ["채팅 입력창 + 전송 버튼", ["프로젝트 데이터 범위 밖 질문에는 '해당 내용은 프로젝트 데이터에 없습니다'로 응답"]],
      ["대화 이력 영역", ["사용자(ME) / AI 메시지 말풍선 형태"]],
      ["숨김 처리 안내", ["네비게이션 어디에도 링크되어 있지 않음. 필요 시 재노출 검토 대상"]],
    ],
    (x, y, w, h) => {
      const s = shell(x, y, w, h, -1, "AI Hub");
      const parts = [s.svg];
      let cy = s.cy;
      parts.push(K.T(s.cx, cy - 6, "프로젝트 데이터 기반 사내 업무 어시스턴트", { size: 13, weight: 500, fill: K.C.textFaint }));
      cy += 20;

      parts.push(numbered(3, s.cx + s.cw - 200, cy - 6, ""));
      parts.push(K.R(s.cx + s.cw - 210, cy - 24, 210, 26, { fill: K.C.amberSoft, rx: 6 }));
      parts.push(K.T(s.cx + s.cw - 200, cy - 6, "숨김 라우트 (직접 접근시 노출)", { size: 10.5, weight: 600, fill: K.C.amberText }));

      parts.push(numbered(2, s.cx - 14, cy - 6, ""));
      parts.push(K.card(s.cx, cy, s.cw, s.ch - 90));
      parts.push(K.R(s.cx + s.cw - 260, cy + 20, 220, 44, { fill: K.C.accentSoft, rx: 12 }));
      parts.push(K.T(s.cx + s.cw - 150, cy + 46, "해당 내용은 프로젝트 데이터에 없습니다.", { size: 11, weight: 500, fill: K.C.accent, anchor: "middle" }));
      parts.push(K.R(s.cx + 20, cy + 80, 260, 44, { fill: K.C.slateSoft, rx: 12 }));
      parts.push(K.T(s.cx + 150, cy + 106, "다음 프로젝트 마감 알려줘", { size: 11, weight: 500, fill: K.C.textMuted, anchor: "middle" }));

      const iy = s.cy + s.ch - 46;
      parts.push(numbered(1, s.cx - 14, iy - 6, K.inputField(s.cx, iy, s.cw - 100, 44, null, "메시지를 입력하세요...")));
      parts.push(K.button(s.cx + s.cw - 90, iy, 90, 44, "전송", "primary"));
      return parts.join("");
    }
  )
);

// ============ 15. AI 에이전트 관리센터 ============
screens.push(
  screen(
    "AI 에이전트 관리센터",
    "AI 관련 기능을 한 곳에 모은 화면(에이전트 설정/AI 대화/AI 리서치). AI 허브와 마찬가지로 현재 숨김 처리된 라우트.",
    [
      ["에이전트 설정 섹션", ["/settings의 에이전트 설정과 목적이 중복됨"]],
      ["AI 어시스턴트 대화 섹션", ["AI 허브와 동일한 챗봇 UI를 재사용"]],
      ["AI 리서치 보고서 섹션", ["심층 리서치 시작 버튼 + 최근 리서치 히스토리 목록", "리서치 기능 자체는 아직 미구현(항상 빈 히스토리)"]],
    ],
    (x, y, w, h) => {
      const s = shell(x, y, w, h, -1, "AI 관리 센터");
      const parts = [s.svg];
      let cy = s.cy;
      const colW = (s.cw - 32) / 3;
      const sections = [
        ["에이전트 설정", "temperature 슬라이더 3종"],
        ["AI 어시스턴트 대화", "채팅 UI (AI 허브와 동일)"],
        ["AI 리서치 보고서", "심층 리서치 시작 / 히스토리 없음"],
      ];
      sections.forEach((sec, i) => {
        const cx = s.cx + i * (colW + 16);
        parts.push(numbered(i + 1, cx - 14, cy - 6, ""));
        parts.push(K.card(cx, cy, colW, s.ch - 20));
        parts.push(K.T(cx + 16, cy + 30, sec[0], { size: 14.5, weight: 700, fill: K.C.textPrimary }));
        parts.push(K.T(cx + 16, cy + 54, sec[1], { size: 11.5, weight: 400, fill: K.C.textFaint }));
        if (i === 2) parts.push(K.button(cx + 16, cy + 76, colW - 32, 34, "심층 리서치 시작", "outline"));
      });
      return parts.join("");
    }
  )
);

// ============ 16. 히스토리 ============
screens.push(
  screen(
    "히스토리",
    "회의록 등록부터 문서 검토·업무 진행까지, 전체 파이프라인 이력을 모아보는 화면.",
    [
      ["탭: 전체 / 문서 / 업무 / 에이전트", ["에이전트 탭은 별도 이벤트 로그가 없어, 문서·업무의 현재 상태 스냅샷에서 AI 생성 흔적을 역추적해 재구성"]],
      ["이력 리스트", ["항목명 · 액션(예: 담당자 추천 실행) · 수행 주체 · 상태 · 경과시간"]],
      ["빈 상태 CTA", ["이력이 없을 때 안내 문구와 이동 링크 제공"]],
      ["페이지네이션", ["10건씩, 필터 변경 시 1페이지로 리셋"]],
    ],
    (x, y, w, h) => {
      const s = shell(x, y, w, h, 3, "히스토리");
      const parts = [s.svg];
      let cy = s.cy;
      parts.push(numbered(1, s.cx - 14, cy - 6, K.tabsPill(s.cx, cy - 24, [{ label: "전체", active: true }, { label: "문서" }, { label: "업무" }, { label: "에이전트" }]).svg));
      cy += 26;

      parts.push(numbered(2, s.cx - 14, cy - 6, ""));
      const rows = [
        ["연차 신청 UI 개발", "담당자 추천 실행", "업무 배분 AGENT", "대기", "14시간 전"],
        ["알림 기능 구현", "담당자 추천 실행", "업무 배분 AGENT", "대기", "14시간 전"],
        ["모바일 웹 반응형 최적화", "담당자 추천 실행", "업무 배분 AGENT", "대기", "14시간 전"],
        ["출장 보고서 알림 기능 개발", "담당자 추천 실행", "업무 배분 AGENT", "대기", "14시간 전"],
      ];
      const tbl = K.table(s.cx, cy, s.cw, ["항목명", "액션", "수행 주체", "상태", "경과"], rows, [s.cw * 0.3, s.cw * 0.22, s.cw * 0.22, s.cw * 0.12, s.cw * 0.14]);
      parts.push(tbl.svg);
      cy += tbl.height + 20;

      parts.push(numbered(3, s.cx - 14, cy - 6, ""));
      parts.push(K.T(s.cx, cy + 4, "이력이 없을 때: '아직 기록된 이력이 없습니다' + 문서생성으로 이동 버튼", { size: 12, weight: 500, fill: K.C.textFaint }));
      cy += 30;

      parts.push(numbered(4, s.cx - 14, cy - 6, ""));
      [1, 2, 3, 4, 5, 6, 7].forEach((n, i) => {
        const bx = s.cx + i * 30;
        parts.push(K.R(bx, cy, 24, 24, { fill: i === 0 ? K.C.accent : "#fff", stroke: K.C.border, sw: 1, rx: 6 }));
        parts.push(K.T(bx + 12, cy + 16, String(n), { size: 11, weight: 600, fill: i === 0 ? "#fff" : K.C.textMuted, anchor: "middle" }));
      });
      return parts.join("");
    }
  )
);

// ============ 17. 프로필 ============
screens.push(
  screen(
    "프로필",
    "본인 계정 정보를 확인하고 수정하는 화면. 좌(기본정보) / 우(내정보수정) 2단 레이아웃.",
    [
      ["기본 정보 카드", ["이름 · 이메일 · 권한(PM 또는 일반유저) 표시"]],
      ["비밀번호 변경 버튼(모달)", ["본인만 변경 가능, 저장 시 해시로 재저장"]],
      ["내 정보 수정 폼", ["연락처 · 기술 스택 · 자격증 · 주요 프로젝트 경험"]],
      ["내 정보 저장 버튼", ["role 등 인사정보 필드는 본인이 수정할 수 없도록 서버에서 차단"]],
    ],
    (x, y, w, h) => {
      const s = shell(x, y, w, h, -1, "프로필");
      const parts = [s.svg];
      const leftW = s.cw * 0.32;
      let cy = s.cy;
      parts.push(numbered(1, s.cx - 14, cy - 6, ""));
      parts.push(K.card(s.cx, cy, leftW, 220));
      parts.push(K.avatar(s.cx + leftW / 2, cy + 48, 26, "김"));
      parts.push(K.T(s.cx + leftW / 2, cy + 92, "김피엠", { size: 15, weight: 700, fill: K.C.textPrimary, anchor: "middle" }));
      parts.push(K.T(s.cx + leftW / 2, cy + 112, "pm@heyzzabi.com", { size: 11.5, weight: 400, fill: K.C.textFaint, anchor: "middle" }));
      parts.push(K.badge(s.cx + leftW / 2 - 24, cy + 126, "PM", "blue").svg);
      parts.push(numbered(2, s.cx + 12, cy + 168, K.button(s.cx + 16, cy + 170, leftW - 32, 34, "비밀번호 변경", "outline")));

      const rx = s.cx + leftW + 24,
        rw = s.cw - leftW - 24;
      parts.push(numbered(3, rx - 14, cy - 6, ""));
      parts.push(K.card(rx, cy, rw, 220));
      parts.push(K.T(rx + 16, cy + 28, "내 정보 수정", { size: 14, weight: 700, fill: K.C.textPrimary }));
      parts.push(K.inputField(rx + 16, cy + 46, rw / 2 - 24, 38, "연락처", "010-0000-0000"));
      parts.push(K.inputField(rx + rw / 2, cy + 46, rw / 2 - 32, 38, "기술 스택", "Notion, Jira"));
      parts.push(K.inputField(rx + 16, cy + 100, rw / 2 - 24, 38, "자격증", "-"));
      parts.push(K.inputField(rx + rw / 2, cy + 100, rw / 2 - 32, 38, "주요 프로젝트 경험", "-"));
      parts.push(numbered(4, rx + 16 - 14, cy + 170, K.button(rx + 16, cy + 170, 140, 36, "내 정보 저장", "primary")));
      return parts.join("");
    }
  )
);

// ============ 18. 설정 ============
screens.push(
  screen(
    "설정",
    "AI 에이전트 설정, 자주 묻는 질문, 법적 고지를 모아둔 화면. PM만 에이전트 설정을 수정할 수 있다.",
    [
      ["에이전트 설정 아코디언", ["기획서/요구사항정의서/업무배분 생성 에이전트별 temperature 슬라이더", "서버에서 0~0.3으로 강제 clamp(환각 방지 원칙 유지)"]],
      ["고객지원(FAQ) 아코디언", ["자주 묻는 질문 7건 펼침/접기"]],
      ["오류 문의하기 링크", ["mailto 링크로 담당자 이메일 연결"]],
      ["법적 고지 섹션", ["이용약관 / 개인정보처리방침 버튼 → 각 상세 화면으로 이동"]],
    ],
    (x, y, w, h) => {
      const s = shell(x, y, w, h, -1, "설정");
      const parts = [s.svg];
      let cy = s.cy;
      parts.push(numbered(1, s.cx - 14, cy - 6, ""));
      parts.push(K.card(s.cx, cy, s.cw, 70));
      parts.push(K.T(s.cx + 16, cy + 26, "▸ 에이전트 설정", { size: 14, weight: 700, fill: K.C.textPrimary }));
      parts.push(K.T(s.cx + 16, cy + 48, "기획서 · 요구사항정의서 · 업무배분 temperature 슬라이더 (0~0.3)", { size: 11.5, weight: 400, fill: K.C.textFaint }));
      cy += 90;

      parts.push(numbered(2, s.cx - 14, cy - 6, ""));
      parts.push(K.card(s.cx, cy, s.cw, 220));
      parts.push(K.T(s.cx + 16, cy + 28, "고객지원 (FAQ)", { size: 14, weight: 700, fill: K.C.textPrimary }));
      const faqs = ["문서는 어떻게 만드나요?", "업무 담당자는 어떻게 배정하나요?", "\"배분승인대기\"는 무슨 뜻인가요?", "알림은 어디서 확인하나요?"];
      faqs.forEach((f, i) => {
        const fy = cy + 54 + i * 34;
        parts.push(K.L(s.cx + 16, fy + 12, s.cx + s.cw - 16, fy + 12, { stroke: K.C.border }));
        parts.push(K.T(s.cx + 16, fy, f, { size: 12.5, weight: 500, fill: K.C.textMuted }));
      });
      parts.push(numbered(3, s.cx - 14, cy + 200, ""));
      parts.push(K.T(s.cx + 16, cy + 214, "오류 문의하기 (kimjae9360@gmail.com)", { size: 11.5, weight: 500, fill: K.C.accent }));
      cy += 240;

      parts.push(numbered(4, s.cx - 14, cy - 6, ""));
      parts.push(K.card(s.cx, cy, s.cw, 70));
      parts.push(K.T(s.cx + 16, cy + 28, "법적 고지", { size: 14, weight: 700, fill: K.C.textPrimary }));
      parts.push(K.button(s.cx + 16, cy + 42, 120, 20, "이용약관", "ghost"));
      parts.push(K.button(s.cx + 150, cy + 42, 160, 20, "개인정보처리방침", "ghost"));
      return parts.join("");
    }
  )
);

// ============ 19. 설정 - 이용약관 ============
function legalDoc(title, effDate, sections) {
  return (x, y, w, h) => {
    const s = shell(x, y, w, h, -1, "설정");
    const parts = [s.svg];
    let cy = s.cy;
    parts.push(numbered(1, s.cx - 14, cy - 6, ""));
    parts.push(K.T(s.cx, cy - 6, "← 설정으로 돌아가기", { size: 12.5, weight: 600, fill: K.C.accent }));
    cy += 30;
    parts.push(K.T(s.cx, cy, title, { size: 20, weight: 700, fill: K.C.textPrimary }));
    cy += 26;
    parts.push(numbered(2, s.cx - 14, cy - 6, ""));
    parts.push(K.T(s.cx, cy, effDate, { size: 12, weight: 500, fill: K.C.textFaint }));
    cy += 30;
    parts.push(numbered(3, s.cx - 14, cy - 6, ""));
    parts.push(K.card(s.cx, cy, s.cw, s.ch - (cy - s.cy)));
    let ty = cy + 30;
    sections.forEach((sec) => {
      parts.push(K.T(s.cx + 20, ty, sec, { size: 13, weight: 700, fill: K.C.textPrimary }));
      ty += 20;
      parts.push(K.L(s.cx + 20, ty + 6, s.cx + s.cw - 20, ty + 6, { stroke: K.C.border }));
      parts.push(K.L(s.cx + 20, ty + 22, s.cx + s.cw * 0.7, ty + 22, { stroke: K.C.border }));
      ty += 38;
    });
    return parts.join("");
  };
}
screens.push(
  screen(
    "설정 - 이용약관",
    "서비스 이용약관 전문을 보여주는 정적 문서 화면.",
    [
      ["설정으로 돌아가기 링크", []],
      ["시행일 표기", []],
      ["조항별 본문(제1조~)", ["목적 · 정의 · 효력/변경 · 서비스 제공 · 이용자 의무 · 회사 의무 · 계정관리 · 이용제한 · 지적재산권 · 면책조항"]],
    ],
    legalDoc("이용약관", "시행일: 2026년 8월 25일", ["제1조 (목적)", "제2조 (정의)", "제3조 (약관의 효력 및 변경)", "제4조 (서비스의 제공)", "제5조 (이용자의 의무)"])
  )
);

// ============ 20. 설정 - 개인정보처리방침 ============
screens.push(
  screen(
    "설정 - 개인정보처리방침",
    "개인정보 수집·이용·보관에 관한 고지 화면. 이용약관과 동일한 레이아웃을 사용한다.",
    [
      ["설정으로 돌아가기 링크", []],
      ["시행일 표기", []],
      ["조항별 본문", ["수집 항목 · 이용 목적 · 보관 기간 · 제3자 제공 · 이용자 권리 등"]],
    ],
    legalDoc("개인정보처리방침", "시행일: 2026년 8월 25일", ["1. 수집하는 개인정보 항목", "2. 개인정보의 이용 목적", "3. 개인정보의 보유 및 이용 기간", "4. 개인정보의 제3자 제공", "5. 이용자의 권리와 행사 방법"])
  )
);

export { screens };
