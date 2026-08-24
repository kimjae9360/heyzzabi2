"use client";

import { Fragment, useState } from "react";
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

type Candidate = { userId: string; name: string; currentActiveTasks: number };

type Suggestion = {
  taskId: string;
  title: string;
  suggestedAssigneeId: string | null;
  suggestedAssigneeName?: string;
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
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [expandedReason, setExpandedReason] = useState<string | null>(null);

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

      setCandidates(data.candidates ?? []);
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

  // 리뷰 중(제안값 편집 화면)
  if (drafts) {
    const ganttItems: GanttItem[] = drafts
      .filter(d => d.assigneeId && d.wbsStart && d.wbsEnd)
      .map(d => ({ id: d.taskId, title: d.title, assigneeName: candidates.find(c => c.userId === d.assigneeId)?.name ?? "미배정", wbsStart: d.wbsStart, wbsEnd: d.wbsEnd }));
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
                        className="flex items-center gap-1 font-semibold hover:text-primary transition-colors"
                      >
                        <ChevronDown className={cn("w-3.5 h-3.5 transition-transform shrink-0", expandedReason !== d.taskId && "-rotate-90")} />
                        {d.title}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={d.assigneeId}
                        onChange={e => updateDraft(d.taskId, { assigneeId: e.target.value })}
                        className="w-full bg-black/5 dark:bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40"
                      >
                        <option value="">미배정</option>
                        {candidates.map(c => (
                          <option key={c.userId} value={c.userId}>{c.name} (진행중 {c.currentActiveTasks}건)</option>
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
        {tasks.length > 0 && <AssignedList tasks={tasks} expandedReason={expandedReason} setExpandedReason={setExpandedReason} />}
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
  return <AssignedList tasks={tasks} expandedReason={expandedReason} setExpandedReason={setExpandedReason} />;
}

function AssignedList({
  tasks, expandedReason, setExpandedReason,
}: {
  tasks: Task[]; expandedReason: string | null; setExpandedReason: (v: string | null) => void;
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
            <th className="px-4 py-3 font-bold">업무명</th>
            <th className="px-4 py-3 font-bold w-32">담당자</th>
            <th className="px-4 py-3 font-bold w-40">일정</th>
            <th className="px-4 py-3 font-bold w-28">상태</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {assigned.map(t => {
            const reason = t.assignmentReason ? JSON.parse(t.assignmentReason) : null;
            return (
              <Fragment key={t.id}>
                <tr className="align-top">
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setExpandedReason(expandedReason === t.id ? null : t.id)}
                      className="flex items-center gap-1 font-semibold hover:text-primary transition-colors disabled:cursor-default"
                      disabled={!reason}
                    >
                      {reason && <ChevronDown className={cn("w-3.5 h-3.5 transition-transform shrink-0", expandedReason !== t.id && "-rotate-90")} />}
                      {t.title}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <UserIcon className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-xs font-medium">{t.assignee?.name}</span>
                      {reason?.fitScore != null && (
                        <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">{reason.fitScore}</span>
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

// 담당자별로 업무 막대를 타임라인 위에 배치하는 가벼운 간트 차트 —
// 드래그로 일정을 조정하는 편집형 간트는 아니고, 배정 결과를 한눈에 보여주는 용도
function GanttChart({ items }: { items: GanttItem[] }) {
  if (items.length === 0) return null;

  const starts = items.map(i => new Date(i.wbsStart).getTime());
  const ends = items.map(i => new Date(i.wbsEnd).getTime());
  const rangeStart = Math.min(...starts);
  const rangeEnd = Math.max(...ends);
  const totalMs = Math.max(1, rangeEnd - rangeStart);
  const pct = (ms: number) => ((ms - rangeStart) / totalMs) * 100;
  const fmt = (ms: number) => new Date(ms).toLocaleDateString("ko-KR", { month: "short", day: "numeric" });

  const byAssignee = new Map<string, GanttItem[]>();
  items.forEach(i => {
    if (!byAssignee.has(i.assigneeName)) byAssignee.set(i.assigneeName, []);
    byAssignee.get(i.assigneeName)!.push(i);
  });

  return (
    <div className="border border-white/10 rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground px-1">
        <span className="flex items-center gap-1"><CalendarIcon className="w-3 h-3" /> {fmt(rangeStart)}</span>
        <span>{fmt(rangeEnd)}</span>
      </div>
      <div className="space-y-3">
        {Array.from(byAssignee.entries()).map(([name, personItems]) => (
          <div key={name} className="space-y-1">
            <p className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
              <UserIcon className="w-3 h-3" /> {name}
            </p>
            <div className="space-y-1">
              {personItems.map(item => {
                const s = new Date(item.wbsStart).getTime();
                const e = new Date(item.wbsEnd).getTime();
                const left = pct(s);
                const width = Math.max(pct(e) - left, 2);
                return (
                  <div key={item.id} className="relative h-6 bg-black/5 dark:bg-white/5 rounded-md">
                    <div
                      title={`${item.title} · ${fmt(s)} ~ ${fmt(e)}`}
                      className="absolute top-0 h-full rounded-md flex items-center px-2 bg-primary/80 hover:bg-primary transition-colors overflow-hidden"
                      style={{ left: `${left}%`, width: `${width}%` }}
                    >
                      <span className="text-[10px] font-semibold text-primary-foreground truncate">{item.title}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
