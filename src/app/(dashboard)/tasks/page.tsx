"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { FolderKanban, ListTodo, Search, LayoutGrid, CalendarIcon, UserIcon, MoreVertical, Loader2, ArrowRight, ChevronLeft, ChevronRight, ClipboardList, GitBranch, GitPullRequest, GitMerge } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

type Task = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  difficulty: string;
  estimatedHours: number | null;
  gitStatus: string;
  wbsStart: string | null;
  wbsEnd: string | null;
  progress: number;
  project: { id: string; name: string };
  assignee: { id: string; name: string } | null;
};

const STATUSES = [
  { id: "BACKLOG", label: "대기", color: "text-muted-foreground", bg: "bg-muted" },
  { id: "PENDING_APPROVAL", label: "배분승인대기", color: "text-orange-500", bg: "bg-orange-500/10" },
  { id: "IN_PROGRESS", label: "진행 중", color: "text-amber-500", bg: "bg-amber-500/10" },
  { id: "DONE", label: "완료", color: "text-emerald-500", bg: "bg-emerald-500/10" },
];

// FR-07-003: 업무 항목별 Git 상태 배지 (실제 Git 연동 전까지는 수동 표시 — FR-08에서 자동화 예정)
const GIT_STATUSES: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  NONE: { label: "미연동", color: "text-muted-foreground", bg: "bg-muted", icon: GitBranch },
  PENDING: { label: "대기", color: "text-gray-500", bg: "bg-gray-500/10", icon: GitBranch },
  IN_REVIEW: { label: "PR리뷰중", color: "text-orange-500", bg: "bg-orange-500/10", icon: GitPullRequest },
  MERGED: { label: "완료", color: "text-emerald-500", bg: "bg-emerald-500/10", icon: GitMerge },
};

export default function TasksPage() {
  const { user } = useAuth();
  const isPM = user?.role === "PM";
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // 일반유저는 "내 업무"가 기본값 — 전체 업무 조회는 PM만 필요하다는 판단(FR-01-005 팀 전체 요약은 PM용)
  const [filterScope, setFilterScope] = useState<"ME" | "ALL">("ME");
  const [viewMode, setViewMode] = useState<"KANBAN" | "LIST" | "WBS">("LIST");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;
  const [collapsedCols, setCollapsedCols] = useState<Record<string, boolean>>({});
  const toggleColumn = (id: string) => setCollapsedCols(prev => ({ ...prev, [id]: !prev[id] }));

  useEffect(() => {
    fetchTasks();
  }, []);

  // 로그인 정보가 로드된 뒤 역할에 맞는 기본 필터로 맞춘다 (PM은 전체 업무를 기본으로 봄)
  useEffect(() => {
    if (isPM) setFilterScope("ALL");
    else setFilterScope("ME");
  }, [isPM]);

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/tasks");
      const json = await res.json();
      if (json.success) setTasks(json.data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (taskId: string, newStatus: string) => {
    setProcessingId(taskId);
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setTasks(tasks.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
      } else {
        alert("상태 변경에 실패했습니다.");
      }
    } catch {
      alert("네트워크 오류로 상태 변경에 실패했습니다.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleGitStatusChange = async (taskId: string, gitStatus: string) => {
    const prevStatus = tasks.find(t => t.id === taskId)?.gitStatus;
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, gitStatus } : t));
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gitStatus }),
      });
      if (!res.ok) throw new Error("failed");
    } catch (e) {
      console.error(e);
      // 저장 실패 시 화면이 실제 상태와 어긋난 채로 남지 않도록 되돌린다
      if (prevStatus !== undefined) setTasks(prev => prev.map(t => t.id === taskId ? { ...t, gitStatus: prevStatus } : t));
      alert("Git 상태 변경에 실패했습니다.");
    }
  };

  const filteredTasks = useMemo(() => {
    let filtered = tasks;
    if (filterScope === "ME" && user) {
      filtered = filtered.filter(t => t.assignee?.id === user.id);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(t => 
        t.title.toLowerCase().includes(q) || 
        t.project.name.toLowerCase().includes(q) ||
        (t.assignee?.name || "").toLowerCase().includes(q)
      );
    }
    return filtered;
  }, [tasks, filterScope, search, user]);

  // 탭·검색어가 바뀌면 목록이 통째로 달라지므로 페이지를 1로 되돌린다
  useEffect(() => { setPage(1); }, [filterScope, search, viewMode]);
  const totalPages = Math.max(1, Math.ceil(filteredTasks.length / PAGE_SIZE));
  // 위 리셋 대상이 아닌 다른 이유로 목록이 줄어들 수도 있으므로(다른 화면에서 상태 변경 후 재조회 등),
  // 지금 페이지가 범위를 넘으면 마지막 페이지로 당겨서 빈 화면이 뜨지 않게 한다
  useEffect(() => { setPage(p => Math.min(p, totalPages)); }, [totalPages]);
  const pagedTasks = filteredTasks.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3 text-muted-foreground mb-2">
          <ListTodo className="w-5 h-5 text-primary" />
          <h1 className="text-3xl font-black text-foreground tracking-tight">업무관리</h1>
        </div>
        <p className="text-muted-foreground">나의 업무를 관리하거나 전체 프로젝트의 진행 상태를 파악하세요.</p>
      </div>

      {/* Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-black/5 dark:bg-white/5 p-2 rounded-2xl border border-black/5 dark:border-white/10">
        <div className="flex items-center gap-2 p-1 bg-black/5 dark:bg-white/5 rounded-xl">
          <button
            onClick={() => setFilterScope("ME")}
            className={cn("px-5 py-2.5 rounded-lg text-sm font-bold transition-all", filterScope === "ME" ? "bg-white dark:bg-white/10 text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
          >
            내 업무
          </button>
          {/* 전체 업무 조회는 PM만 필요 — 일반유저는 본인 업무만 관리하면 되므로 탭 자체를 숨긴다 */}
          {isPM && (
            <button
              onClick={() => setFilterScope("ALL")}
              className={cn("px-5 py-2.5 rounded-lg text-sm font-bold transition-all", filterScope === "ALL" ? "bg-white dark:bg-white/10 text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              전체 업무
            </button>
          )}
        </div>

        <div className="flex items-center gap-4">
          <div className="relative group">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" />
            <input
              type="text"
              placeholder="업무명, 프로젝트, 담당자 검색..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2.5 bg-card border border-transparent hover:border-black/10 dark:hover:border-white/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:bg-background w-64 lg:w-80 transition-all shadow-sm"
            />
          </div>
          
          <div className="flex items-center gap-1 p-1 bg-black/5 dark:bg-white/5 rounded-xl">
            <button
              onClick={() => setViewMode("KANBAN")}
              className={cn("p-2.5 rounded-lg transition-all", viewMode === "KANBAN" ? "bg-white dark:bg-white/10 text-primary shadow-sm" : "text-muted-foreground hover:text-foreground")}
              title="칸반 뷰"
            >
              <FolderKanban className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("LIST")}
              className={cn("p-2.5 rounded-lg transition-all", viewMode === "LIST" ? "bg-white dark:bg-white/10 text-primary shadow-sm" : "text-muted-foreground hover:text-foreground")}
              title="리스트 뷰"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            {/* 업무보드(WBS) 뷰 — FR-07: 전체 진행상황 요약 + Git 상태 배지가 포함된 표 형태 뷰 */}
            <button
              onClick={() => setViewMode("WBS")}
              className={cn("p-2.5 rounded-lg transition-all", viewMode === "WBS" ? "bg-white dark:bg-white/10 text-primary shadow-sm" : "text-muted-foreground hover:text-foreground")}
              title="업무보드(WBS) 뷰"
            >
              <ClipboardList className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary/50" />
        </div>
      ) : (
        <>
          {viewMode === "KANBAN" ? (
            <div className="flex gap-4 overflow-x-auto pb-6 snap-x pt-2 px-1">
              {STATUSES.map(status => {
                const columnTasks = filteredTasks.filter(t => t.status === status.id);
                const isCollapsed = collapsedCols[status.id];
                
                return (
                  <div 
                    key={status.id} 
                    className={cn(
                      "flex flex-col max-h-[75vh] snap-start transition-all duration-300 ease-in-out border rounded-2xl shadow-sm relative",
                      isCollapsed 
                        ? "w-14 min-w-[56px] shrink-0 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 items-center py-4 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800" 
                        : "min-w-[280px] w-[280px] shrink-0 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 p-4 shadow-lg"
                    )}
                    onClick={() => isCollapsed && toggleColumn(status.id)}
                  >
                    {isCollapsed ? (
                      <div className="flex flex-col items-center h-full gap-4">
                        <span className={cn("w-3 h-3 rounded-full", status.bg.replace('/10', ''))} title={status.label} />
                        <span className="bg-black/10 dark:bg-white/10 text-[10px] px-2 py-0.5 rounded-full text-muted-foreground font-bold">{columnTasks.length}</span>
                        <div className="writing-vertical-lr text-sm font-bold text-muted-foreground tracking-widest mt-4" style={{ writingMode: 'vertical-rl' }}>
                          {status.label}
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between mb-4 px-1">
                          <h3 className="font-extrabold flex items-center gap-2 text-sm tracking-tight">
                            <span className={cn("w-2.5 h-2.5 rounded-full shadow-sm", status.bg.replace('/10', ''))} />
                            {status.label}
                            <span className="bg-white dark:bg-white/10 text-xs px-2 py-0.5 rounded-full text-muted-foreground font-semibold shadow-sm">{columnTasks.length}</span>
                          </h3>
                          <button 
                            onClick={(e) => { e.stopPropagation(); toggleColumn(status.id); }}
                            className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 text-muted-foreground transition-colors"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="flex-1 overflow-y-auto space-y-3 pr-1 scrollbar-thin">
                          {columnTasks.map(task => (
                            <div key={task.id} className="bg-white dark:bg-black/40 p-4 rounded-xl border border-black/5 dark:border-white/10 hover:border-primary/40 hover:shadow-lg transition-all shadow-md relative group">
                              {processingId === task.id && (
                                <div className="absolute inset-0 bg-background/50 backdrop-blur-[1px] flex items-center justify-center z-10 rounded-xl">
                                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                                </div>
                              )}
                              <div className="flex items-start justify-between gap-2 mb-2.5">
                                <h4 className="font-bold text-sm leading-snug">{task.title}</h4>
                                {task.status === "PENDING_APPROVAL" ? (
                                  <span className="text-[10px] font-semibold px-1.5 py-1 rounded bg-orange-500/10 text-orange-500 whitespace-nowrap">
                                    PM 승인 대기
                                  </span>
                                ) : (
                                  <select
                                    value={task.status}
                                    onChange={e => handleStatusChange(task.id, e.target.value)}
                                    className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/5 dark:bg-white/5 text-[10px] font-semibold px-1.5 py-1 rounded border border-transparent hover:border-black/10 dark:hover:border-white/10 focus:outline-none focus:opacity-100 cursor-pointer"
                                  >
                                    {STATUSES.filter(s => s.id !== "PENDING_APPROVAL").map(s => <option key={s.id} value={s.id} className="text-foreground">{s.label}</option>)}
                                  </select>
                                )}
                              </div>
                              {task.description && <p className="text-[13px] text-muted-foreground line-clamp-2 mb-4 leading-relaxed">{task.description}</p>}
                              
                              <div className="flex items-center justify-between mt-auto pt-3 border-t border-black/5 dark:border-white/5">
                                <div className="flex items-center gap-2">
                                  {task.assignee ? (
                                    <div className="flex items-center gap-1.5 bg-black/5 dark:bg-white/5 px-2 py-1 rounded-full">
                                      <div className="w-4 h-4 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[9px] font-bold">
                                        {task.assignee.name.charAt(0)}
                                      </div>
                                      <span className="text-[10px] font-semibold">{task.assignee.name}</span>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-1.5 bg-black/5 dark:bg-white/5 px-2 py-1 rounded-full text-muted-foreground">
                                      <UserIcon className="w-3 h-3" />
                                      <span className="text-[10px] font-semibold">미배정</span>
                                    </div>
                                  )}
                                </div>
                                {task.wbsEnd && (
                                  <div className="text-[10px] font-semibold flex items-center gap-1 text-muted-foreground">
                                    <CalendarIcon className="w-3 h-3 opacity-70" />
                                    {new Date(task.wbsEnd).toLocaleDateString()}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                          {columnTasks.length === 0 && (
                            <div className="h-28 flex flex-col items-center justify-center border-2 border-dashed border-black/10 dark:border-white/10 rounded-xl bg-transparent">
                              <FolderKanban className="w-5 h-5 text-muted-foreground/50 mb-2" />
                              <p className="text-xs font-semibold text-muted-foreground">태스크 없음</p>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          ) : viewMode === "LIST" ? (
            <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-black/5 dark:bg-white/5">
                  <tr>
                    <th className="px-6 py-4 font-bold rounded-tl-2xl">업무명</th>
                    <th className="px-6 py-4 font-bold">상태</th>
                    <th className="px-6 py-4 font-bold">담당자</th>
                    <th className="px-6 py-4 font-bold">마감일</th>
                    <th className="px-6 py-4 font-bold text-center rounded-tr-2xl">진행률</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5 dark:divide-white/5">
                  {filteredTasks.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                        조건에 맞는 업무가 없습니다.
                      </td>
                    </tr>
                  ) : (
                    pagedTasks.map(task => {
                      const statusInfo = STATUSES.find(s => s.id === task.status) || STATUSES[0];
                      return (
                        <tr key={task.id} className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors group relative">
                          <td className="px-6 py-4">
                            <div className="font-bold mb-1">{task.title}</div>
                            {task.description && <div className="text-xs text-muted-foreground line-clamp-1 max-w-md">{task.description}</div>}
                          </td>
                          <td className="px-6 py-4">
                            {task.status === "PENDING_APPROVAL" ? (
                              <span className={cn("inline-block text-xs font-bold px-2.5 py-1.5 rounded-lg", statusInfo.bg, statusInfo.color)}>
                                {statusInfo.label} · PM 승인 대기
                              </span>
                            ) : (
                              <select
                                value={task.status}
                                onChange={e => handleStatusChange(task.id, e.target.value)}
                                disabled={processingId === task.id}
                                className={cn(
                                  "text-xs font-bold px-2.5 py-1.5 rounded-lg border border-transparent hover:border-black/10 dark:hover:border-white/10 focus:outline-none transition-all cursor-pointer appearance-none",
                                  statusInfo.bg, statusInfo.color
                                )}
                              >
                                {STATUSES.filter(s => s.id !== "PENDING_APPROVAL").map(s => <option key={s.id} value={s.id} className="bg-background text-foreground">{s.label}</option>)}
                              </select>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            {task.assignee ? (
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[10px] font-bold">
                                  {task.assignee.name.charAt(0)}
                                </div>
                                <span className="font-medium text-[13px]">{task.assignee.name}</span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-[13px]">미배정</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-[13px] text-muted-foreground">
                            {task.wbsEnd ? new Date(task.wbsEnd).toLocaleDateString() : "-"}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-center gap-2">
                              <div className="w-16 h-1.5 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
                                <div className="h-full bg-primary rounded-full" style={{ width: `${task.progress}%` }} />
                              </div>
                              <span className="text-xs font-semibold w-8 text-right">{task.progress}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
              <Pagination page={page} totalPages={totalPages} onChange={setPage} />
            </div>
          ) : (
            // 업무보드(WBS) 뷰 (FR-07-001~003): 전체 진행상황 요약 + Git 상태 배지가 포함된 통합 표
            <WbsBoardView tasks={filteredTasks} onGitStatusChange={handleGitStatusChange} />
          )}
        </>
      )}
    </div>
  );
}

/**
 * 업무보드(WBS) 뷰 — FR-07-003 "조회 상단 WBS: 전체 진행사항을 파악할 수 있는 차트 +
 * Git 상태 배지"를 담당한다. 상단에는 상태별 카운트/전체 진행률 요약 바를,
 * 아래에는 업무별 Git 상태(FR-08 연동 전까지는 수동 표시)를 포함한 표를 그린다.
 */
function WbsBoardView({ tasks, onGitStatusChange }: { tasks: Task[]; onGitStatusChange: (taskId: string, gitStatus: string) => void }) {
  // 상태별 집계 — 진행률 요약 바에 사용 (페이지네이션과 무관하게 항상 전체 tasks 기준)
  const total = tasks.length;
  const counts = STATUSES.reduce((acc, s) => {
    acc[s.id] = tasks.filter(t => t.status === s.id).length;
    return acc;
  }, {} as Record<string, number>);
  const doneCount = counts["DONE"] ?? 0;
  const overallProgress = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  const PAGE_SIZE = 10;
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [tasks]);
  const totalPages = Math.max(1, Math.ceil(tasks.length / PAGE_SIZE));
  const pagedTasks = tasks.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-4">
      {/* 전체 진행상황 요약 (FR-07-003) */}
      <div className="bg-card rounded-2xl border border-border p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-muted-foreground">전체 진행률</h3>
          <span className="text-sm font-black text-primary">{overallProgress}% ({doneCount}/{total}건 완료)</span>
        </div>
        <div className="w-full h-2.5 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden mb-4">
          <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${overallProgress}%` }} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {STATUSES.map(s => (
            <div key={s.id} className={cn("rounded-xl p-3", s.bg)}>
              <p className={cn("text-xs font-bold", s.color)}>{s.label}</p>
              <p className="text-xl font-black mt-1">{counts[s.id] ?? 0}건</p>
            </div>
          ))}
        </div>
      </div>

      {/* 업무별 WBS 표 + Git 상태 배지 */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-muted-foreground uppercase bg-black/5 dark:bg-white/5">
            <tr>
              <th className="px-6 py-4 font-bold">업무명</th>
              <th className="px-6 py-4 font-bold">담당자</th>
              <th className="px-6 py-4 font-bold">상태</th>
              <th className="px-6 py-4 font-bold text-center">진행률</th>
              <th className="px-6 py-4 font-bold">Git 상태</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5 dark:divide-white/5">
            {tasks.length === 0 ? (
              <tr><td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">조건에 맞는 업무가 없습니다.</td></tr>
            ) : (
              pagedTasks.map(task => {
                const statusInfo = STATUSES.find(s => s.id === task.status) || STATUSES[0];
                const gitInfo = GIT_STATUSES[task.gitStatus] ?? GIT_STATUSES.NONE;
                const GitIcon = gitInfo.icon;
                return (
                  <tr key={task.id} className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-bold">{task.title}</div>
                      {task.estimatedHours != null && (
                        <div className="text-[11px] text-muted-foreground mt-0.5">예상 소요 {task.estimatedHours}시간</div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-[13px]">{task.assignee ? task.assignee.name : <span className="text-muted-foreground">미배정</span>}</td>
                    <td className="px-6 py-4">
                      <span className={cn("inline-block text-xs font-bold px-2.5 py-1.5 rounded-lg", statusInfo.bg, statusInfo.color)}>
                        {statusInfo.label}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-16 h-1.5 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full" style={{ width: `${task.progress}%` }} />
                        </div>
                        <span className="text-xs font-semibold w-8 text-right">{task.progress}%</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {/* FR-08 Git 연동 전까지는 팀원이 직접 상태를 표시 */}
                      <select
                        value={task.gitStatus}
                        onChange={e => onGitStatusChange(task.id, e.target.value)}
                        className={cn(
                          "inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-lg border border-transparent hover:border-black/10 dark:hover:border-white/10 focus:outline-none cursor-pointer appearance-none",
                          gitInfo.bg, gitInfo.color
                        )}
                      >
                        {Object.entries(GIT_STATUSES).map(([key, meta]) => (
                          <option key={key} value={key} className="bg-background text-foreground">{meta.label}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        <Pagination page={page} totalPages={totalPages} onChange={setPage} />
      </div>
    </div>
  );
}

function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (page: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-1.5 py-4">
      <button
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={page === 1}
        className="p-2 rounded-lg bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
        <button
          key={n}
          onClick={() => onChange(n)}
          className={cn(
            "w-8 h-8 rounded-lg text-sm font-bold transition-colors",
            n === page ? "bg-primary text-primary-foreground" : "bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-muted-foreground"
          )}
        >
          {n}
        </button>
      ))}
      <button
        onClick={() => onChange(Math.min(totalPages, page + 1))}
        disabled={page === totalPages}
        className="p-2 rounded-lg bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}
