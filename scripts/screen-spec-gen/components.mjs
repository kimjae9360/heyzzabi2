// 실제 헤이짜비2 라이트 테마 색상/컴포넌트를 재현하는 SVG 조립 도구
// 실측: body #f8fafc, 카드보더 #e2e8f0, 텍스트 #020817, active nav blue #2563eb (getComputedStyle 실측)

const C = {
  canvasBg: "#ffffff",
  appBg: "#f8fafc",
  sidebarBg: "#ffffff",
  border: "#e2e8f0",
  borderStrong: "#cbd5e1",
  navText: "#334155",
  navActiveBg: "#eaf1ff",
  navActiveText: "#2563eb",
  navIcon: "#94a3b8",
  textPrimary: "#0f172a",
  textMuted: "#64748b",
  textFaint: "#94a3b8",
  cardBg: "#ffffff",
  accent: "#2563eb",
  accentSoft: "#dbeafe",
  amber: "#f59e0b",
  amberSoft: "#fef3c7",
  amberText: "#92400e",
  green: "#16a34a",
  greenSoft: "#dcfce7",
  greenText: "#166534",
  red: "#dc2626",
  redSoft: "#fee2e2",
  redText: "#991b1b",
  slateSoft: "#f1f5f9",
  badge: "#f5a623",
  badgeText: "#ffffff",
  calloutBox: "#e0455f",
};

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function estCharWidth(fontSize) {
  return fontSize * 1.0;
}
function wrapText(text, fontSize, maxWidth) {
  const charW = estCharWidth(fontSize);
  const maxChars = Math.max(4, Math.floor(maxWidth / charW));
  const words = String(text).split(/(\s+)/);
  const lines = [];
  let cur = "";
  for (const w of words) {
    if ((cur + w).length > maxChars && cur.trim().length > 0) {
      lines.push(cur.trim());
      cur = w;
    } else cur += w;
  }
  if (cur.trim().length > 0) lines.push(cur.trim());
  return lines.length ? lines : [""];
}

function T(x, y, str, opts = {}) {
  const { size = 14, weight = 400, fill = C.textPrimary, anchor = "start", family = "'Malgun Gothic','Apple SD Gothic Neo',sans-serif" } = opts;
  return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${esc(str)}</text>`;
}
function R(x, y, w, h, opts = {}) {
  const { fill = "none", stroke = "none", sw = 1, rx = 0 } = opts;
  return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(0, w).toFixed(1)}" height="${Math.max(0, h).toFixed(1)}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
}
function L(x1, y1, x2, y2, opts = {}) {
  const { stroke = C.border, sw = 1, dash } = opts;
  return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${stroke}" stroke-width="${sw}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;
}
function Circle(cx, cy, r, opts = {}) {
  const { fill = "none", stroke = "none", sw = 1 } = opts;
  return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
}

function card(x, y, w, h, opts = {}) {
  return R(x, y, w, h, { fill: C.cardBg, stroke: C.border, sw: 1, rx: 12, ...opts });
}

function button(x, y, w, h, label, variant = "primary") {
  const parts = [];
  if (variant === "primary") {
    parts.push(R(x, y, w, h, { fill: C.accent, rx: 8 }));
    parts.push(T(x + w / 2, y + h / 2 + 5, label, { size: 13.5, weight: 600, fill: "#fff", anchor: "middle" }));
  } else if (variant === "outline") {
    parts.push(R(x, y, w, h, { fill: "#fff", stroke: C.borderStrong, sw: 1, rx: 8 }));
    parts.push(T(x + w / 2, y + h / 2 + 5, label, { size: 13.5, weight: 600, fill: C.textPrimary, anchor: "middle" }));
  } else if (variant === "ghost") {
    parts.push(T(x + w / 2, y + h / 2 + 5, label, { size: 13.5, weight: 500, fill: C.textMuted, anchor: "middle" }));
  }
  return parts.join("");
}

function badge(x, y, label, variant = "slate") {
  const map = {
    amber: [C.amberSoft, C.amberText],
    green: [C.greenSoft, C.greenText],
    red: [C.redSoft, C.redText],
    blue: [C.accentSoft, C.accent],
    slate: [C.slateSoft, C.textMuted],
  };
  const [bg, fg] = map[variant] || map.slate;
  const w = label.length * 8.6 + 20;
  const h = 24;
  const parts = [R(x, y, w, h, { fill: bg, rx: 999 })];
  parts.push(T(x + w / 2, y + h / 2 + 4.5, label, { size: 12, weight: 600, fill: fg, anchor: "middle" }));
  return { svg: parts.join(""), w, h };
}

function avatar(cx, cy, r, initial) {
  return [
    Circle(cx, cy, r, { fill: "#e2e8f0" }),
    T(cx, cy + r * 0.35, initial, { size: r * 0.85, weight: 700, fill: C.textMuted, anchor: "middle" }),
  ].join("");
}

function inputField(x, y, w, h, label, value) {
  const parts = [];
  if (label) parts.push(T(x, y - 8, label, { size: 12.5, weight: 600, fill: C.textMuted }));
  parts.push(R(x, y, w, h, { fill: "#fff", stroke: C.border, sw: 1, rx: 8 }));
  if (value) parts.push(T(x + 14, y + h / 2 + 5, value, { size: 13.5, weight: 400, fill: C.textFaint }));
  return parts.join("");
}

function tabsPill(x, y, tabs) {
  const parts = [];
  let cx = x;
  const h = 34;
  for (const t of tabs) {
    const w = t.label.length * 9 + 28;
    if (t.active) {
      parts.push(R(cx, y, w, h, { fill: "#fff", stroke: C.border, sw: 1, rx: 8 }));
      parts.push(T(cx + w / 2, y + h / 2 + 5, t.label, { size: 13.5, weight: 700, fill: C.textPrimary, anchor: "middle" }));
    } else {
      parts.push(T(cx + w / 2, y + h / 2 + 5, t.label, { size: 13.5, weight: 500, fill: C.textMuted, anchor: "middle" }));
    }
    cx += w + 4;
  }
  return { svg: parts.join(""), width: cx - x };
}

function topTabs(x, y, tabs) {
  // 문서생성 상단 스텝형 탭 (기획서 / 요구사항정의서 / 업무 배분)
  const parts = [];
  let cx = x;
  tabs.forEach((t, i) => {
    const w = 190;
    parts.push(Circle(cx + 14, y + 10, 9, { fill: t.active ? C.accent : t.done ? C.green : "#cbd5e1" }));
    if (t.done && !t.active) parts.push(T(cx + 14, y + 14, "✓", { size: 11, weight: 700, fill: "#fff", anchor: "middle" }));
    parts.push(T(cx + 32, y + 15, t.label, { size: 14.5, weight: t.active ? 700 : 500, fill: t.active ? C.textPrimary : C.textMuted }));
    if (i < tabs.length - 1) parts.push(L(cx + w - 20, y + 10, cx + w + 10, y + 10, { stroke: C.border, sw: 2 }));
    cx += w;
  });
  return parts.join("");
}

// ---- 앱 셸 ----
function sidebar(x, y, w, h, activeIndex) {
  const items = [
    { label: "대시보드" },
    { label: "문서생성" },
    { label: "업무관리" },
    { label: "히스토리" },
    { label: "직원관리" },
  ];
  const parts = [R(x, y, w, h, { fill: C.sidebarBg, stroke: C.border, sw: 1 })];
  // logo
  parts.push(Circle(x + 28, y + 30, 14, { fill: C.accent }));
  parts.push(T(x + 28, y + 35, "Zz", { size: 12, weight: 700, fill: "#fff", anchor: "middle" }));
  parts.push(T(x + 50, y + 35, "헤이 짜비", { size: 15, weight: 700, fill: C.textPrimary }));
  parts.push(L(x, y + 56, x + w, y + 56, { stroke: C.border }));

  let iy = y + 72;
  items.forEach((it, i) => {
    const active = i === activeIndex;
    if (active) parts.push(R(x + 10, iy, w - 20, 38, { fill: C.navActiveBg, rx: 8 }));
    parts.push(Circle(x + 30, iy + 19, 4, { fill: active ? C.navActiveText : C.navIcon }));
    parts.push(T(x + 44, iy + 24, it.label, { size: 13.5, weight: active ? 700 : 500, fill: active ? C.navActiveText : C.navText }));
    iy += 44;
  });

  // 하단 프로필 영역
  const by = y + h - 96;
  parts.push(L(x, by, x + w, by, { stroke: C.border }));
  parts.push(R(x + 12, by + 12, w - 24, 22, { fill: "#fef3c7", rx: 6 }));
  parts.push(T(x + 24, by + 27, "DEV  PM  일반유저", { size: 10.5, weight: 600, fill: "#92400e" }));
  parts.push(avatar(x + 26, by + 56, 13, "김"));
  parts.push(T(x + 44, by + 60, "김피엠", { size: 13, weight: 600, fill: C.textPrimary }));
  parts.push(T(x + w - 16, by + 60, "Logout", { size: 11.5, weight: 500, fill: C.textFaint, anchor: "end" }));
  return parts.join("");
}

function topbar(x, y, w, h, title) {
  const parts = [R(x, y, w, h, { fill: "#fff", stroke: C.border, sw: 1 })];
  parts.push(T(x + 28, y + h / 2 + 6, title, { size: 19, weight: 700, fill: C.textPrimary }));
  // bell
  const bx = x + w - 40;
  parts.push(Circle(bx, y + h / 2, 15, { fill: C.slateSoft }));
  parts.push(R(bx - 5, y + h / 2 - 6, 10, 8, { fill: "none", stroke: C.textMuted, sw: 1.4, rx: 3 }));
  parts.push(Circle(bx + 7, y + h / 2 - 7, 4, { fill: C.red }));
  return parts.join("");
}

function kpiCard(x, y, w, h, label, value, accent = C.accent) {
  const parts = [card(x, y, w, h)];
  parts.push(R(x + 16, y + 16, 8, 8, { fill: accent, rx: 2 }));
  parts.push(T(x + 16, y + h - 16, label, { size: 12.5, weight: 500, fill: C.textMuted }));
  parts.push(T(x + 16, y + h / 2 + 8, value, { size: 26, weight: 800, fill: C.textPrimary }));
  return parts.join("");
}

function listRow(x, y, w, title, meta, dotColor = C.accent) {
  const parts = [];
  parts.push(Circle(x + 6, y - 4, 4, { fill: dotColor }));
  parts.push(T(x + 20, y, title, { size: 13.5, weight: 600, fill: C.textPrimary }));
  parts.push(T(x + w, y, meta, { size: 12, weight: 400, fill: C.textFaint, anchor: "end" }));
  return parts.join("");
}

function progressBar(x, y, w, h, pct, color = C.accent) {
  const parts = [R(x, y, w, h, { fill: C.slateSoft, rx: h / 2 })];
  parts.push(R(x, y, Math.max(6, (w * pct) / 100), h, { fill: color, rx: h / 2 }));
  return parts.join("");
}

function barChart(x, y, w, h, data) {
  // data: [{label, value, color}]  단순 세로 막대 그래프
  const max = Math.max(1, ...data.map((d) => d.value));
  const gap = 18;
  const bw = (w - gap * (data.length - 1)) / data.length;
  const parts = [];
  parts.push(L(x, y + h, x + w, y + h, { stroke: C.border }));
  data.forEach((d, i) => {
    const bx = x + i * (bw + gap);
    const bh = Math.max(4, (h - 24) * (d.value / max));
    parts.push(R(bx, y + h - bh, bw, bh, { fill: d.color || C.accent, rx: 4 }));
    parts.push(T(bx + bw / 2, y + h - bh - 8, String(d.value), { size: 11.5, weight: 700, fill: C.textPrimary, anchor: "middle" }));
    parts.push(T(bx + bw / 2, y + h + 16, d.label, { size: 11, weight: 500, fill: C.textMuted, anchor: "middle" }));
  });
  return parts.join("");
}

function stackedBar(x, y, w, h, segs) {
  // segs: [{value,color,label}]
  const total = Math.max(1, segs.reduce((s, d) => s + d.value, 0));
  const parts = [R(x, y, w, h, { fill: C.slateSoft, rx: h / 2 })];
  let cx = x;
  segs.forEach((s) => {
    const sw = (w * s.value) / total;
    parts.push(R(cx, y, sw, h, { fill: s.color, rx: 0 }));
    cx += sw;
  });
  let ly = y + h + 20;
  segs.forEach((s) => {
    parts.push(Circle(x + 6, ly - 4, 5, { fill: s.color }));
    parts.push(T(x + 18, ly, `${s.label}  ${s.value}건`, { size: 12.5, weight: 500, fill: C.textMuted }));
    ly += 22;
  });
  return parts.join("");
}

function table(x, y, w, headers, rows, colWidths) {
  const parts = [];
  const hH = 34;
  parts.push(R(x, y, w, hH, { fill: C.slateSoft }));
  let cx = x;
  headers.forEach((h, i) => {
    parts.push(T(cx + 12, y + hH / 2 + 4.5, h, { size: 12, weight: 700, fill: C.textMuted }));
    cx += colWidths[i];
  });
  let ry = y + hH;
  const rowH = 40;
  rows.forEach((row, ri) => {
    parts.push(L(x, ry, x + w, ry, { stroke: C.border }));
    let cx2 = x;
    row.forEach((cell, ci) => {
      parts.push(T(cx2 + 12, ry + rowH / 2 + 4.5, String(cell), { size: 12.5, weight: 500, fill: C.textPrimary }));
      cx2 += colWidths[ci];
    });
    ry += rowH;
  });
  parts.push(R(x, y, w, ry - y, { fill: "none", stroke: C.border, sw: 1 }));
  return { svg: parts.join(""), height: ry - y };
}

function taskCard(x, y, w, h, title, assignee, tag) {
  const parts = [card(x, y, w, h, { rx: 10 })];
  const lines = wrapText(title, 12.5, w - 24);
  lines.slice(0, 2).forEach((ln, i) => parts.push(T(x + 12, y + 22 + i * 17, ln, { size: 12.5, weight: 600, fill: C.textPrimary })));
  if (assignee) {
    parts.push(avatar(x + 20, y + h - 20, 10, assignee[0]));
    parts.push(T(x + 34, y + h - 16, assignee, { size: 11.5, weight: 500, fill: C.textMuted }));
  }
  if (tag) {
    const bd = badge(x + w - tag.length * 8 - 30, y + 10, tag, "blue");
    parts.push(bd.svg);
  }
  return parts.join("");
}

function kanbanColumn(x, y, w, h, title, count, cards, color = C.textMuted) {
  const parts = [];
  parts.push(Circle(x + 8, y + 8, 4, { fill: color }));
  parts.push(T(x + 20, y + 13, title, { size: 13.5, weight: 700, fill: C.textPrimary }));
  parts.push(T(x + w - 10, y + 13, String(count), { size: 12, weight: 600, fill: C.textFaint, anchor: "end" }));
  parts.push(R(x, y + 26, w, h - 26, { fill: C.appBg, stroke: C.border, sw: 1, rx: 10 }));
  let cy = y + 40;
  cards.forEach((c) => {
    const ch = 64;
    if (cy + ch < y + h - 6) {
      parts.push(taskCard(x + 10, cy, w - 20, ch, c.title, c.assignee, c.tag));
      cy += ch + 10;
    }
  });
  return parts.join("");
}

function sectionLabel(x, y, str) {
  return T(x, y, str, { size: 16, weight: 700, fill: C.textPrimary });
}

function iconCircle(cx, cy, r, fill) {
  return Circle(cx, cy, r, { fill });
}

export {
  C,
  T,
  R,
  L,
  Circle,
  esc,
  wrapText,
  card,
  button,
  badge,
  avatar,
  inputField,
  tabsPill,
  topTabs,
  sidebar,
  topbar,
  kpiCard,
  listRow,
  progressBar,
  barChart,
  stackedBar,
  table,
  taskCard,
  kanbanColumn,
  sectionLabel,
  iconCircle,
};
