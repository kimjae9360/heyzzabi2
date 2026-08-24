"use client";

import { Fragment, useEffect, useState } from "react";
import { Bot, Loader2, ChevronDown, UserIcon, CalendarIcon, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Task = {
  id: string;
  title: string;
  description: string | null;
  difficulty: string;
  estimatedHours: number | null;
  status: string;
  assigneeId: string | null;
  assignee: { id: string; name: string } | null;
  wbsStart: string | null;
  wbsEnd: string | null;
  assignmentReason: string | null;
};

type Member = { id: string; name: string };

type Suggestion = {
  taskId: string;
  title: string;
  suggestedAssigneeId: string | null;
  fitScore: number | null;
  techFit: string | null;
  workloadFit: string | null;
  experienceFit: string | null;
  suggestedWbsStart: string | null;
  suggestedWbsEnd: string | null;
};

// 편집 중인 행 하나 — 제안값에서 시작하되 PM이 담당자/일정을 직접 바꿀 수 있다
type DraftRow = {
  taskId: string;
  title: string;
  assigneeId: string;
  fitScore: number | null;
  techFit: string | null;
  workloadFit: string | null;
  experienceFit: string | null;
  wbsStart: string; // yyyy-mm-dd for <input type="date">
  wbsEnd: string;
};

type GanttItem = { id: string; title: string; assigneeName: string; wbsStart: string; wbsEnd: string };

const toDateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

// assignmentReason은 검증 없는 자유 텍스트 컬럼이라, 이 화면이 쓴 게 아닌 값이 들어있을 가능성을 배제할 수 없다
const parseReason = (raw: string | null) => {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
};

export function TaskAssignmentPanel({
  doc, tasks, isPM, projectId, onRefresh,
}: {
  doc: { id: string; reqSpecStatus: string };
  tasks: Task[];
  isPM: boolean;
  projectId: string;
  onRefresh: () => void;
}) {
  const [generating, setGenerating] = useState(false);
  const [drafts, setDrafts] = useState<DraftRow[] | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [candidateMeta, setCandidateMeta] = useState<Record<string, number>>({}); // userId -> currentActiveTasks
  const [confirming, setConfirming] = useState(false);
  const [reassigning, setReassigning] = useState<string | null>(null);
  const [expandedReason, setExpandedReason] = useState<string | null>(null);

  // 담당자 변경 드롭다운에 쓸 팀원 목록은 배정 실행 여부와 무관하게 항상 필요하다
  useEffect(() => {
    fetch("/api/users").then(r => r.json()).then(json => {
      const active = (json.data ?? []).filter((u: any) => u.role === "EMPLOYEE" && u.status === "ACTIVE");
      setMembers(active.map((u: any) => ({ id: u.id, name: u.name })));
    }).catch(() => {});
  }, []);

  if (doc.reqSpecStatus !== "APPROVED") {
    return (
      <div className="p-10 text-center text-muted-foreground text-sm">
        요구사항정의서가 승인되면 업무분배를 진행할 수 있습니다.
      </div>
    );
  }

  const runAssign = async () => {
    setGenerating(true);
    try {
      // 이 문서에서 아직 업무가 추출된 적이 없다면 먼저 추출부터 한다
      if (tasks.length === 0) {
        const res = await fetch(`/api/projects/${projectId}/documents/${doc.id}/extract-tasks`, { method: "POST" });
        const data = await res.json();
        if (!res.ok) { alert(data.error || "업무 생성에 실패했습니다."); return; }
        onRefresh();
      }

      const res = await fetch(`/api/projects/${projectId}/documents/${doc.id}/assign-tasks`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { alert(data.error || "배정 추천 생성에 실패했습니다."); return; }

      const meta: Record<string, number> = {};
      (data.candidates ?? []).forEach((c: any) => { meta[c.userId] = c.currentActiveTasks; });
      setCandidateMeta(meta);
      setDrafts(
        (data.suggestions as Suggestion[]).map(s => ({
          taskId: s.taskId,
          title: s.title,
          assigneeId: s.suggestedAssigneeId ?? "",
          fitScore: s.fitScore,
          techFit: s.techFit,
          workloadFit: s.workloadFit,
          experienceFit: s.experienceFit,
          wbsStart: toDateInput(s.suggestedWbsStart),
          wbsEnd: toDateInput(s.suggestedWbsEnd),
        }))
      );
    } catch {
      alert("네트워크 오류가 발생했습니다.");
    } finally {
      setGenerating(false);
    }
  };

  const updateDraft = (taskId: string, patch: Partial<DraftRow>) => {
    setDrafts(prev => prev?.map(d => d.taskId === taskId ? { ...d, ...patch } : d) ?? null);
  };

  const confirmAssignment = async () => {
    if (!drafts) return;
    setConfirming(true);
    try {
      await Promise.all(
        drafts.filter(d => d.assigneeId).map(d =>
          fetch(`/api/tasks/${d.taskId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              assigneeId: d.assigneeId,
              status: "IN_PROGRESS",
              wbsStart: d.wbsStart || null,
              wbsEnd: d.wbsEnd || null,
              assignmentReason: JSON.stringify({ fitScore: d.fitScore, techFit: d.techFit, workloadFit: d.workloadFit, experienceFit: d.experienceFit }),
            }),
          })
        )
      );
      setDrafts(null);
      onRefresh();
    } finally {
      setConfirming(false);
    }
  };

  // 확정된 업무의 담당자를 나중에 바꾸는 경우 — 근거는 그 담당자를 고른 이유가 아니게 되므로 함께 지운다
  const reassign = async (taskId: string, assigneeId: string) => {
    setReassigning(taskId);
    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigneeId: assigneeId || null, assignmentReason: null }),
      });
      onRefresh();
    } finally {
      setReassigning(null);
    }
  };

  // 리뷰 중(제안값 편집 화면)
  if (drafts) {
    const ganttItems: GanttItem[] = drafts
      .filter(d => d.assigneeId && d.wbsStart && d.wbsEnd)
      .map(d => ({ id: d.taskId, title: d.title, assigneeName: members.find(m => m.id === d.assigneeId)?.name ?? "미배정", wbsStart: d.wbsStart, wbsEnd: d.wbsEnd }));
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          AI가 추천한 담당자와 일정입니다. 필요하면 담당자·일정을 직접 바꾼 뒤 확정하세요.
        </p>
        <GanttChart items={ganttItems} />
        <div className="border border-white/10 rounded-xl overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-black/5 dark:bg-white/5">
              <tr>
                <th className="px-4 py-3 font-bold">업무명</th>
                <th className="px-4 py-3 font-bold w-40">담당자</th>
                <th className="px-4 py-3 font-bold w-24">적합도</th>
                <th className="px-4 py-3 font-bold w-64">시작~종료일</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {drafts.map(d => (
                <Fragment key={d.taskId}>
                  <tr className="align-top">
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setExpandedReason(v => v === d.taskId ? null : d.taskId)}
                        disabled={!d.techFit}
                        className="flex items-start gap-1 font-semibold hover:text-primary transition-colors text-left disabled:cursor-default disabled:hover:text-foreground"
                      >
                        {d.techFit && <ChevronDown className={cn("w-3.5 h-3.5 transition-transform shrink-0 mt-0.5", expandedReason !== d.taskId && "-rotate-90")} />}
                        <span>
                          {d.title}
                          {d.techFit && <span className="block text-xs font-normal text-muted-foreground mt-0.5 line-clamp-1">{d.techFit}</span>}
                        </span>
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={d.assigneeId}
                        onChange={e => updateDraft(d.taskId, { assigneeId: e.target.value })}
                        className="w-full bg-black/5 dark:bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40"
                      >
                        <option value="" className="bg-background text-foreground">미배정</option>
                        {members.map(m => (
                          <option key={m.id} value={m.id} className="bg-background text-foreground">{m.name}{candidateMeta[m.id] != null ? ` (진행중 ${candidateMeta[m.id]}건)` : ""}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      {d.fitScore != null ? (
                        <span className="text-[11px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">{d.fitScore}</span>
                      ) : <span className="text-xs text-muted-foreground">-</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <input type="date" value={d.wbsStart} onChange={e => updateDraft(d.taskId, { wbsStart: e.target.value })}
                          className="bg-black/5 dark:bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40" />
                        <span className="text-muted-foreground">~</span>
                        <input type="date" value={d.wbsEnd} onChange={e => updateDraft(d.taskId, { wbsEnd: e.target.value })}
                          className="bg-black/5 dark:bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40" />
                      </div>
                    </td>
                  </tr>
                  {expandedReason === d.taskId && (
                    <tr className="bg-black/[0.02] dark:bg-white/[0.02]">
                      <td colSpan={4} className="px-4 pb-3 pt-0">
                        <ul className="text-xs text-muted-foreground space-y-1 pl-5">
                          <li>🛠 기술 적합도: {d.techFit ?? "-"}</li>
                          <li>📊 업무 여유도: {d.workloadFit ?? "-"}</li>
                          <li>📁 유사 경험: {d.experienceFit ?? "-"}</li>
                        </ul>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end gap-3">
          <button
            onClick={() => setDrafts(null)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-sm font-bold transition-colors"
          >
            취소
          </button>
          <button
            onClick={confirmAssignment}
            disabled={confirming}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 disabled:opacity-50"
          >
            {confirming ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            배분 확정
          </button>
        </div>
      </div>
    );
  }

  // 아직 업무가 없거나, 미배정 업무가 남아있는 경우
  const unassigned = tasks.filter(t => !t.assigneeId);
  if (tasks.length === 0 || unassigned.length > 0) {
    return (
      <div className="space-y-5">
        {tasks.length > 0 && <AssignedList tasks={tasks} members={members} isPM={isPM} expandedReason={expandedReason} setExpandedReason={setExpandedReason} reassign={reassign} reassigning={reassigning} />}
        {isPM ? (
          <div className="p-10 text-center border border-dashed border-white/10 rounded-xl">
            <Bot className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-4">
              {tasks.length === 0 ? "요구사항정의서를 바탕으로 업무를 추출하고 담당자를 배정합니다." : `미배정 업무 ${unassigned.length}건이 있습니다.`}
            </p>
            <button
              onClick={runAssign}
              disabled={generating}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 disabled:opacity-50 mx-auto"
            >
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
              {tasks.length === 0 ? "AI로 업무분배 시작" : "AI로 나머지 배분 추천받기"}
            </button>
          </div>
        ) : (
          <div className="p-10 text-center text-muted-foreground text-sm">
            {tasks.length === 0 ? "아직 업무분배가 시작되지 않았습니다." : `미배정 업무 ${unassigned.length}건이 있습니다.`}
          </div>
        )}
      </div>
    );
  }

  // 전부 배정 완료
  return <AssignedList tasks={tasks} members={members} isPM={isPM} expandedReason={expandedReason} setExpandedReason={setExpandedReason} reassign={reassign} reassigning={reassigning} />;
}

function AssignedList({
  tasks, members, isPM, expandedReason, setExpandedReason, reassign, reassigning,
}: {
  tasks: Task[]; members: Member[]; isPM: boolean; expandedReason: string | null; setExpandedReason: (v: string | null) => void;
  reassign: (taskId: string, assigneeId: string) => void; reassigning: string | null;
}) {
  const assigned = tasks.filter(t => t.assigneeId);
  if (assigned.length === 0) return null;

  const ganttItems: GanttItem[] = assigned
    .filter(t => t.wbsStart && t.wbsEnd)
    .map(t => ({ id: t.id, title: t.title, assigneeName: t.assignee?.name ?? "미배정", wbsStart: t.wbsStart!, wbsEnd: t.wbsEnd! }));

  return (
    <div className="space-y-4">
      <GanttChart items={ganttItems} />
      <div className="border border-white/10 rounded-xl overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-muted-foreground uppercase bg-black/5 dark:bg-white/5">
            <tr>
              <th className="px-4 py-3 font-bold">업무명 / 배정 근거</th>
              <th className="px-4 py-3 font-bold w-44">담당자</th>
              <th className="px-4 py-3 font-bold w-40">일정</th>
              <th className="px-4 py-3 font-bold w-28">상태</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {assigned.map(t => {
              const reason = parseReason(t.assignmentReason);
              return (
                <Fragment key={t.id}>
                  <tr className="align-top">
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setExpandedReason(expandedReason === t.id ? null : t.id)}
                        className="flex items-start gap-1 font-semibold hover:text-primary transition-colors text-left disabled:cursor-default disabled:hover:text-foreground"
                        disabled={!reason}
                      >
                        {reason && <ChevronDown className={cn("w-3.5 h-3.5 transition-transform shrink-0 mt-0.5", expandedReason !== t.id && "-rotate-90")} />}
                        <span>
                          {t.title}
                          {reason?.techFit ? (
                            <span className="block text-xs font-normal text-muted-foreground mt-0.5 line-clamp-1">{reason.techFit}</span>
                          ) : (
                            <span className="block text-xs font-normal text-muted-foreground/60 mt-0.5">배정 근거 없음(수동 변경됨)</span>
                          )}
                        </span>
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {isPM ? (
                          <select
                            value={t.assigneeId ?? ""}
                            onChange={e => reassign(t.id, e.target.value)}
                            disabled={reassigning === t.id}
                            className="w-full bg-black/5 dark:bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
                          >
                            <option value="" className="bg-background text-foreground">미배정</option>
                            {members.map(m => (
                              <option key={m.id} value={m.id} className="bg-background text-foreground">{m.name}</option>
                            ))}
                          </select>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <UserIcon className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="text-xs font-medium">{t.assignee?.name ?? "미배정"}</span>
                          </div>
                        )}
                        {reason?.fitScore != null && (
                          <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full shrink-0">{reason.fitScore}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {t.wbsStart && t.wbsEnd ? (
                        <span className="flex items-center gap-1"><CalendarIcon className="w-3 h-3" /> {new Date(t.wbsStart).toLocaleDateString()} ~ {new Date(t.wbsEnd).toLocaleDateString()}</span>
                      ) : "-"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">{t.status}</span>
                    </td>
                  </tr>
                  {expandedReason === t.id && reason && (
                    <tr className="bg-black/[0.02] dark:bg-white/[0.02]">
                      <td colSpan={4} className="px-4 pb-3 pt-0">
                        <ul className="text-xs text-muted-foreground space-y-1 pl-5">
                          <li>🛠 기술 적합도: {reason.techFit ?? "-"}</li>
                          <li>📊 업무 여유도: {reason.workloadFit ?? "-"}</li>
                          <li>📁 유사 경험: {reason.experienceFit ?? "-"}</li>
                        </ul>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// 담당자별로 업무 막대를 타임라인 위에 배치하는 가벼운 간트 차트 — 드래그로 일정을 조정하는
// 편집형 간트는 아니고, 배정 결과를 한눈에 보여주는 용도. 눈금 그리드로 날짜를 바로 읽을 수 있게 하고,
// 짧은(하루짜리) 막대는 안에 라벨이 안 들어가므로 막대 오른쪽 바깥에 라벨을 띄운다.
function GanttChart({ items }: { items: GanttItem[] }) {
  if (items.length === 0) return null;

  const starts = items.map(i => new Date(i.wbsStart).getTime());
  const endsRaw = items.map(i => new Date(i.wbsEnd).getTime());
  const rangeStart = Math.min(...starts);
  // 전부 하루짜리 업무면 범위가 0이 되어 나눗셈이 깨지므로 최소 하루는 확보
  const rangeEnd = Math.max(Math.max(...endsRaw), rangeStart + 86400000);
  const totalMs = rangeEnd - rangeStart;
  const pct = (ms: number) => ((ms - rangeStart) / totalMs) * 100;
  const fmt = (ms: number) => new Date(ms).toLocaleDateString("ko-KR", { month: "short", day: "numeric" });

  const TICKS = 6;
  const ticks = Array.from({ length: TICKS + 1 }, (_, i) => rangeStart + (totalMs * i) / TICKS);

  const byAssignee = new Map<string, GanttItem[]>();
  items.forEach(i => {
    if (!byAssignee.has(i.assigneeName)) byAssignee.set(i.assigneeName, []);
    byAssignee.get(i.assigneeName)!.push(i);
  });

  const rows: { label: string | null; item: GanttItem }[] = [];
  byAssignee.forEach((personItems, name) => {
    personItems.forEach((item, idx) => rows.push({ label: idx === 0 ? name : null, item }));
  });

  return (
    <div className="border border-white/10 rounded-xl p-4 overflow-x-auto">
      <div className="min-w-[600px] grid gap-y-2" style={{ gridTemplateColumns: "96px 1fr" }}>
        <div />
        <div className="relative h-4">
          {ticks.map((t, i) => (
            <span
              key={i}
              className="absolute text-[10px] font-semibold text-muted-foreground whitespace-nowrap"
              style={{ left: `${(i / TICKS) * 100}%`, transform: i === 0 ? "translateX(0)" : i === TICKS ? "translateX(-100%)" : "translateX(-50%)" }}
            >
              {fmt(t)}
            </span>
          ))}
        </div>
        {rows.map(({ label, item }) => {
          const s = new Date(item.wbsStart).getTime();
          const e = new Date(item.wbsEnd).getTime();
          const left = pct(s);
          const width = Math.max(pct(e) - left, 2);
          const narrow = width < 16;
          return (
            <Fragment key={item.id}>
              <p className="text-xs font-bold text-muted-foreground flex items-center gap-1 truncate pt-1">
                {label && (<><UserIcon className="w-3 h-3 shrink-0" /><span className="truncate">{label}</span></>)}
              </p>
              <div className="relative h-6">
                {ticks.map((t, ti) => (
                  <div key={ti} className="absolute top-0 bottom-0 w-px bg-white/10" style={{ left: `${(ti / TICKS) * 100}%` }} />
                ))}
                <div
                  title={`${item.title} · ${fmt(s)} ~ ${fmt(e)}`}
                  className="absolute top-0 h-full rounded-md flex items-center px-2 bg-primary/80 hover:bg-primary transition-colors overflow-hidden"
                  style={{ left: `${left}%`, width: `${width}%` }}
                >
                  {!narrow && <span className="text-[10px] font-semibold text-primary-foreground truncate">{item.title}</span>}
                </div>
                {narrow && (
                  <span
                    className="absolute top-1/2 -translate-y-1/2 text-[10px] font-medium text-foreground whitespace-nowrap pointer-events-none"
                    style={{ left: `calc(${left}% + ${width}% + 6px)` }}
                  >
                    {item.title}
                  </span>
                )}
              </div>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
