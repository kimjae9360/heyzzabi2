import { C, T, R, L, Circle, wrapText } from "./components.mjs";

const CANVAS_W = 2116;
const CANVAS_H = 1110;

const COLORS = {
  headerLabelLight: "#f1f5f9",
  headerLabelDark: "#1e293b",
  headerValue: "#ffffff",
  headerBorder: "#cbd5e1",
  descHeaderBg: "#1e293b",
  descHeaderText: "#ffffff",
  badge: "#f5a623",
  badgeText: "#ffffff",
  badgeHash: "#94a3b8",
  descTitle: "#0f172a",
  descBullet: "#334155",
  descBulletSub: "#94a3b8",
  divider: "#e2e8f0",
};

function circleBadge(cx, cy, num, opts = {}) {
  const { r = 15, fill = COLORS.badge, textFill = COLORS.badgeText, size = 15 } = opts;
  const label = String(num).padStart(2, "0");
  return [
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="#fff" stroke-width="2"/>`,
    T(cx, cy + size * 0.34, label, { size, weight: 700, fill: textFill, anchor: "middle" }),
  ].join("");
}

// draw() 콜백 안에서 특정 컴포넌트에 번호 배지를 붙일 때 사용
function numbered(number, x, y, innerSvg) {
  return `<g>${innerSvg}${circleBadge(x, y, number)}</g>`;
}

// descriptionPanel과 완전히 동일한 줄바꿈/간격 로직으로 필요한 총 높이만 계산한다.
// (오버플로우로 텍스트가 캔버스 밖으로 밀려나는 것을 막기 위해 렌더링 전에 먼저 호출한다)
function measureDescriptionContentHeight(w, summary, items) {
  const padX = 24;
  const contentW = w - padX * 2;
  let cy = 0;

  if (summary) {
    const lines = wrapText(summary, 21, contentW - 40);
    cy += lines.length * 26 + 22;
    cy += 34;
  }

  items.forEach((item, idx) => {
    const titleLines = wrapText(item.title, 19, contentW - 46);
    cy += titleLines.length * 25 + 6;

    (item.bullets || []).forEach((bItem) => {
      const level = bItem.level || 0;
      const indent = 44 + level * 22;
      const bSize = level === 0 ? 16.5 : 15.5;
      const maxW = contentW - indent + padX - 14;
      const lines = wrapText(bItem.text, bSize, maxW);
      cy += lines.length * (bSize + 6) + 3;
    });

    cy += 18;
    if (idx < items.length - 1) cy += 24;
  });

  return cy;
}

function descriptionPanel(x, y, w, h, screenTitle, summary, items) {
  const parts = [];
  parts.push(R(x, y, w, h, { fill: "#ffffff", stroke: "#dcdcdc", sw: 1 }));
  const headerH = 52;
  parts.push(R(x, y, w, headerH, { fill: COLORS.descHeaderBg }));
  parts.push(T(x + 24, y + headerH / 2 + 8, "Description", { size: 24, weight: 700, fill: COLORS.descHeaderText }));

  let cy = y + headerH + 40;
  const padX = 24;
  const contentW = w - padX * 2;

  if (summary) {
    parts.push(`<circle cx="${x + padX + 12}" cy="${cy - 6}" r="13" fill="${COLORS.badgeHash}"/>`);
    parts.push(T(x + padX + 12, cy - 1, "#", { size: 15, weight: 700, fill: "#fff", anchor: "middle" }));
    const lines = wrapText(summary, 21, contentW - 40);
    lines.forEach((ln, i) => {
      parts.push(T(x + padX + 36, cy - 6 + i * 26, ln, { size: 21, weight: 700, fill: COLORS.descTitle }));
    });
    cy += lines.length * 26 + 22;
    parts.push(L(x + padX, cy, x + w - padX, cy, { stroke: COLORS.divider, sw: 1 }));
    cy += 34;
  }

  items.forEach((item, idx) => {
    parts.push(circleBadge(x + padX + 13, cy, idx + 1, { r: 15, size: 15 }));
    const titleLines = wrapText(item.title, 19, contentW - 46);
    titleLines.forEach((ln, i) => {
      parts.push(T(x + padX + 38, cy - 5 + i * 25, ln, { size: 19, weight: 700, fill: COLORS.descTitle }));
    });
    cy += titleLines.length * 25 + 6;

    (item.bullets || []).forEach((bItem) => {
      const level = bItem.level || 0;
      const indent = 44 + level * 22;
      const bulletChar = level === 0 ? "•" : "-";
      const bColor = level === 0 ? COLORS.descBullet : COLORS.descBulletSub;
      const bSize = level === 0 ? 16.5 : 15.5;
      const maxW = contentW - indent + padX - 14;
      const lines = wrapText(bItem.text, bSize, maxW);
      lines.forEach((ln, i) => {
        const prefix = i === 0 ? `${bulletChar} ` : "  ";
        parts.push(T(x + padX + indent, cy + i * (bSize + 6), prefix + ln, { size: bSize, weight: 400, fill: bColor }));
      });
      cy += lines.length * (bSize + 6) + 3;
    });

    cy += 18;
    if (idx < items.length - 1) {
      parts.push(L(x + padX, cy, x + w - padX, cy, { stroke: COLORS.divider, sw: 1 }));
      cy += 24;
    }
  });

  return parts.join("\n");
}

function header(screenName, author, date) {
  const y0 = 16;
  const h = 56;
  const cols = [
    { label: "화면명", labelFill: COLORS.headerLabelLight, labelText: "#0f172a", value: screenName, w: 700 },
    { label: "작성자", labelFill: COLORS.headerLabelDark, labelText: "#fff", value: author, w: 700 },
    { label: "작성일", labelFill: COLORS.headerLabelDark, labelText: "#fff", value: date, w: 716 },
  ];
  const labelW = 150;
  let x = 0;
  const parts = [];
  for (const c of cols) {
    parts.push(R(x, y0, labelW, h, { fill: c.labelFill, stroke: COLORS.headerBorder, sw: 1 }));
    parts.push(T(x + labelW / 2, y0 + h / 2 + 7, c.label, { size: 18, weight: 700, fill: c.labelText, anchor: "middle" }));
    const vx = x + labelW;
    const vw = c.w - labelW;
    parts.push(R(vx, y0, vw, h, { fill: COLORS.headerValue, stroke: COLORS.headerBorder, sw: 1 }));
    parts.push(T(vx + 20, y0 + h / 2 + 7, c.value, { size: 18, weight: 500, fill: "#0f172a" }));
    x += c.w;
  }
  return parts.join("\n");
}

function buildScreenSVG(screen) {
  const { screenName, author, date, wireframeTitle, summary, items, draw } = screen;
  const descX = 1450;
  const descW = CANVAS_W - descX - 20;
  const descY = 90;
  const headerH = 52;
  const topPad = 40;
  const bottomPad = 30;

  // 항목/불릿이 많은 화면(예: 대시보드)에서 텍스트가 캔버스 밖으로 밀려나지 않도록
  // 실제 렌더링 전에 필요한 높이를 먼저 계산해 캔버스 높이를 늘린다.
  const neededContentH = measureDescriptionContentHeight(descW, summary, items);
  const neededDescH = headerH + topPad + neededContentH + bottomPad;
  const CANVAS_H = Math.max(1110, descY + neededDescH + 20);

  const descH = CANVAS_H - descY - 20;

  const wireX = 20;
  const wireY = 90;
  const wireW = descX - 40;
  const wireH = CANVAS_H - wireY - 20;

  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_W}" height="${CANVAS_H}" viewBox="0 0 ${CANVAS_W} ${CANVAS_H}">`);
  parts.push(R(0, 0, CANVAS_W, CANVAS_H, { fill: "#ffffff" }));
  parts.push(header(screenName, author, date));

  parts.push(R(wireX, wireY, wireW, wireH, { fill: "#f8fafc", stroke: "#94a3b8", sw: 1.5 }));
  parts.push(T(wireX + 4, wireY - 14, wireframeTitle || "화면 목업", { size: 16, weight: 700, fill: "#555" }));
  parts.push(`<clipPath id="clip-${Math.random().toString(36).slice(2)}"><rect x="${wireX}" y="${wireY}" width="${wireW}" height="${wireH}"/></clipPath>`);
  parts.push(`<g>${draw(wireX, wireY, wireW, wireH)}</g>`);

  parts.push(descriptionPanel(descX, descY, descW, descH, screenName, summary, items));

  parts.push(`</svg>`);
  return parts.join("\n");
}

export { buildScreenSVG, numbered, circleBadge, wrapText, COLORS };
