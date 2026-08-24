"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  History as HistoryIcon, FileText, ListTodo, Loader2, CheckCircle2, XCircle,
  Clock, AlertCircle, FolderKanban, Bot, ChevronLeft, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { parseProposalDoc } from "@/lib/documentTemplates";

const STATUS_META: Record<string, { label: string; className: string; icon: any }> = {
  DRAFT: { label: "초안", className: "bg-muted text-muted-foreground", icon: FileText },
  PENDING_REVIEW: { label: "검토 요청중", className: "bg-orange-500/10 text-orange-500", icon: Clock },
  APPROVED: { label: "승인됨", className: "bg-emerald-500/10 text-emerald-500", icon: CheckCircle2 },
  REJECTED: { label: "반려됨", className: "bg-red-500/10 text-red-500", icon: XCircle },
  BACKLOG: { label: "대기", className: "bg-muted text-muted-foreground", icon: Clock },
  PENDING_APPROVAL: { label: "배분승인대기", className: "bg-orange-500/10 text-orange-500", icon: Clock },
  IN_PROGRESS: { label: "진행 중", className: "bg-primary/10 text-primary", icon: FolderKanban },
  DONE: { label: "완료", className: "bg-emerald-500/10 text-emerald-500", icon: CheckCircle2 },
};

type ActivityItem = {
  // "agent-*" kinds는 별도 이벤트 로그 테이블이 없어, 현재 문서/업무 상태 스냅샷에서
  // "AI 에이전트가 생성/실행한 흔적"(생성된 콘텐츠·sourceDocumentId 존재 여부)을 역추적해 재구성한다.
  kind: "document-proposal" | "document-reqspec" | "task" | "agent-proposal" | "agent-reqspec" | "agent-task";
  id: string;
  title: string;
  subtitle: string;
  status: string;
  rejectReason: string | null;
  updatedAt: string;
};

const AGENT_KINDS: ActivityItem["kind"][] = ["agent-proposal", "agent-reqspec", "agent-task"];

export default function HistoryPage() {
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "document" | "task" | "agent">("all");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const listRes = await fetch("/api/projects");
        const list = await listRes.json();
        const projects = Array.isArray(list) ? list : list.data || [];
        if (projects.length === 0) { setProject(null); return; }
        const detailRes = await fetch(`/api/projects/${projects[0].id}`);
        const detail = await detailRes.json();
        if (detail.success) setProject(detail.data);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const activity: ActivityItem[] = useMemo(() => {
    if (!project) return [];
    const items: ActivityItem[] = [];

    for (const doc of project.documents ?? []) {
      const proposal = parseProposalDoc(doc.proposalContent);
      if (proposal || doc.proposalStatus !== "DRAFT") {
        items.push({
          kind: "document-proposal",
          id: `${doc.id}-proposal`,
          title: doc.title,
          subtitle: "기획서",
          status: doc.proposalStatus,
          rejectReason: doc.proposalRejectReason,
          updatedAt: doc.updatedAt,
        });
      }
      if (doc.reqSpecContent) {
        items.push({
          kind: "document-reqspec",
          id: `${doc.id}-reqspec`,
          title: doc.title,
          subtitle: "요구사항정의서",
          status: doc.reqSpecStatus,
          rejectReason: doc.reqSpecRejectReason,
          updatedAt: doc.updatedAt,
        });
      }
    }

    for (const task of project.tasks ?? []) {
      items.push({
        kind: "task",
        id: task.id,
        title: task.title,
        subtitle: task.assignee ? `담당: ${task.assignee.name}` : "미배정",
        status: task.status,
        rejectReason: task.rejectReason,
        updatedAt: task.updatedAt,
      });

      // 에이전트3(요구사항정의서 기반 업무 자동배분)이 만든 업무는 sourceDocumentId를 가진다 — 이를 근거로 역추적
      if (task.sourceDocumentId) {
        items.push({
          kind: "agent-task",
          id: `${task.id}-agent`,
          title: task.title,
          subtitle: "요구사항정의서 기반 업무 자동 생성",
          status: task.status,
          rejectReason: null,
          updatedAt: task.createdAt ?? task.updatedAt,
        });
      }
    }

    // 에이전트1(회의록/기획서 생성), 에이전트2(요구사항정의서 생성)가 실행된 흔적
    for (const doc of project.documents ?? []) {
      if (doc.proposalContent) {
        items.push({
          kind: "agent-proposal",
          id: `${doc.id}-agent-proposal`,
          title: doc.title,
          subtitle: "회의록 → 기획서 AI 초안 생성",
          status: doc.proposalStatus,
          rejectReason: null,
          updatedAt: doc.updatedAt,
        });
      }
      if (doc.reqSpecContent) {
        items.push({
          kind: "agent-reqspec",
          id: `${doc.id}-agent-reqspec`,
          title: doc.title,
          subtitle: "기획서 → 요구사항정의서 AI 생성",
          status: doc.reqSpecStatus,
          rejectReason: null,
          updatedAt: doc.updatedAt,
        });
      }
    }

    return items
      .filter(i => {
        if (filter === "all") return true;
        if (filter === "agent") return AGENT_KINDS.includes(i.kind);
        if (filter === "document") return i.kind === "document-proposal" || i.kind === "document-reqspec";
        return i.kind === "task";
      })
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [project, filter]);

  // 필터가 바뀌면 목록이 통째로 달라지므로 페이지를 1로 되돌린다
  useEffect(() => { setPage(1); }, [filter]);

  const totalPages = Math.max(1, Math.ceil(activity.length / PAGE_SIZE));
  const pagedActivity = activity.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const relativeTime = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "방금 전";
    if (mins < 60) return `${mins}분 전`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}시간 전`;
    return `${Math.floor(hrs / 24)}일 전`;
  };

  if (loading) {
    return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center gap-3">
        <FolderKanban className="w-10 h-10 text-muted-foreground/30" />
        <p className="text-muted-foreground">아직 프로젝트가 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6 animate-in fade-in duration-500 pb-20">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3 text-muted-foreground mb-1">
          <HistoryIcon className="w-5 h-5 text-primary" />
          <h1 className="text-3xl font-black text-foreground tracking-tight">히스토리</h1>
        </div>
        <p className="text-muted-foreground">
          회의록 등록부터 기획서·요구사항정의서 검토, 업무 진행까지 전체 파이프라인 이력입니다.
        </p>
      </div>

      <div className="flex items-center gap-1 p-1 bg-black/5 dark:bg-white/5 rounded-xl w-fit">
        {([
          { key: "all", label: "전체" },
          { key: "document", label: "문서" },
          { key: "task", label: "업무" },
          { key: "agent", label: "에이전트" },
        ] as { key: typeof filter; label: string }[]).map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-bold transition-all",
              filter === tab.key ? "bg-white dark:bg-white/10 text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activity.length === 0 ? (
        <div className="glass rounded-2xl border border-white/5 p-16 text-center">
          <HistoryIcon className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-muted-foreground text-sm">아직 이력이 없습니다.</p>
        </div>
      ) : (
        <div className="glass rounded-2xl border border-white/5 divide-y divide-white/5 overflow-hidden">
          {pagedActivity.map(item => {
            const meta = STATUS_META[item.status] ?? STATUS_META.DRAFT;
            const Icon = meta.icon;
            const isAgent = AGENT_KINDS.includes(item.kind);
            const KindIcon = isAgent ? Bot : item.kind === "task" ? ListTodo : FileText;
            return (
              <div key={item.id} className="flex items-start gap-4 p-4 hover:bg-white/5 transition-colors">
                <div className={cn(
                  "w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
                  isAgent ? "bg-primary/10" : "bg-black/5 dark:bg-white/5"
                )}>
                  <KindIcon className={cn("w-4 h-4", isAgent ? "text-primary" : "text-muted-foreground")} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm truncate">{item.title}</span>
                    <span className="text-[11px] text-muted-foreground shrink-0">· {item.subtitle}</span>
                  </div>
                  {item.rejectReason && item.status === "REJECTED" && (
                    <p className="text-[11px] text-red-400 mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3 shrink-0" /> {item.rejectReason}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold", meta.className)}>
                    <Icon className="w-3 h-3" /> {meta.label}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{relativeTime(item.updatedAt)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1.5">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="p-2 rounded-lg bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(n => (
            <button
              key={n}
              onClick={() => setPage(n)}
              className={cn(
                "w-8 h-8 rounded-lg text-sm font-bold transition-colors",
                n === page ? "bg-primary text-primary-foreground" : "bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-muted-foreground"
              )}
            >
              {n}
            </button>
          ))}
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="p-2 rounded-lg bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
