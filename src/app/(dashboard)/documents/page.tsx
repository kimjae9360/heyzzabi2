"use client";

import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/lib/auth";
import {
  FileText, Plus, Bot, Loader2, Send, CheckCircle2, XCircle,
  AlertCircle, Clock, RotateCcw, MessageSquare, X, FolderKanban,
  Download, Printer, Trash2, Save, ChevronDown, Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NewDocumentModal } from "@/components/projects/NewDocumentModal";
import { ProposalTemplate } from "@/components/documents/ProposalTemplate";
import { ReqSpecTemplate } from "@/components/documents/ReqSpecTemplate";
import { exportProposalPptx } from "@/lib/exportProposalPptx";
import { parseProposalDoc, parseReqSpecDoc } from "@/lib/documentTemplates";
import { TaskAssignmentPanel } from "@/components/documents/TaskAssignmentPanel";

type DocType = "proposal" | "reqSpec";
type PipelineTab = DocType | "taskAssignment";

type ProjectDocument = {
  id: string;
  title: string;
  rawContent: string | null;
  proposalContent: string | null;
  reqSpecContent: string | null;
  proposalStatus: string;
  proposalRejectReason: string | null;
  reqSpecStatus: string;
  reqSpecRejectReason: string | null;
  updatedAt: string;
};

const STATUS_META: Record<string, { label: string; className: string; icon: any }> = {
  DRAFT: { label: "초안", className: "bg-muted text-muted-foreground", icon: FileText },
  PENDING_REVIEW: { label: "검토 요청중", className: "bg-orange-500/10 text-orange-500", icon: Clock },
  APPROVED: { label: "승인됨", className: "bg-emerald-500/10 text-emerald-500", icon: CheckCircle2 },
  REJECTED: { label: "반려됨", className: "bg-red-500/10 text-red-500", icon: XCircle },
};

const TAB_LABEL: Record<DocType, string> = { proposal: "기획서", reqSpec: "요구사항정의서" };
const PIPELINE_TAB_LABEL: Record<PipelineTab, string> = { proposal: "기획서", reqSpec: "요구사항정의서", taskAssignment: "업무분배" };
const TASK_ASSIGN_META = {
  NOT_GENERATED: { label: "미생성", className: "bg-muted text-muted-foreground", icon: FileText },
  NEEDS_ASSIGNMENT: { label: "배분 필요", className: "bg-orange-500/10 text-orange-500", icon: Clock },
  ASSIGNED: { label: "배분완료", className: "bg-emerald-500/10 text-emerald-500", icon: CheckCircle2 },
} as const;
const CONTENT_FIELD: Record<DocType, "proposalContent" | "reqSpecContent"> = { proposal: "proposalContent", reqSpec: "reqSpecContent" };
const STATUS_FIELD: Record<DocType, "proposalStatus" | "reqSpecStatus"> = { proposal: "proposalStatus", reqSpec: "reqSpecStatus" };
const REASON_FIELD: Record<DocType, "proposalRejectReason" | "reqSpecRejectReason"> = { proposal: "proposalRejectReason", reqSpec: "reqSpecRejectReason" };

export default function DocumentsPage() {
  const { user } = useAuth();
  const isPM = user?.role === "PM";

  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<PipelineTab>("proposal");
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [newDocModalOpen, setNewDocModalOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null); // action key currently in flight
  const [rejectModal, setRejectModal] = useState<{ docId: string; type: DocType } | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchProject = async () => {
    setLoading(true);
    try {
      const listRes = await fetch("/api/projects");
      const list = await listRes.json();
      const projects = Array.isArray(list) ? list : list.data || [];
      if (projects.length === 0) {
        setProject(null);
        return;
      }
      // Single-project assumption: 문서생성은 항상 첫 번째(유일한) 프로젝트를 기준으로 진행합니다.
      const detailRes = await fetch(`/api/projects/${projects[0].id}`);
      const detail = await detailRes.json();
      if (detail.success) setProject(detail.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchProject(); }, []);

  const documents: ProjectDocument[] = project?.documents ?? [];
  const selectedDoc = useMemo(
    () => documents.find(d => d.id === selectedDocId) ?? documents[0] ?? null,
    [documents, selectedDocId]
  );

  useEffect(() => {
    if (!selectedDocId && documents.length > 0) setSelectedDocId(documents[0].id);
  }, [documents, selectedDocId]);

  const patchDoc = (docId: string, patch: Partial<ProjectDocument>) => {
    setProject((prev: any) => ({
      ...prev,
      documents: prev.documents.map((d: ProjectDocument) => d.id === docId ? { ...d, ...patch } : d),
    }));
  };

  const handleGenerate = async (doc: ProjectDocument, type: DocType) => {
    setBusy(`${doc.id}-generate-${type}`);
    try {
      const res = await fetch(`/api/projects/${project.id}/documents/${doc.id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const data = await res.json();
      if (res.ok) {
        if (type === "proposal") {
          patchDoc(doc.id, {
            proposalContent: JSON.stringify(data.content),
            proposalStatus: "DRAFT",
            proposalRejectReason: null,
          });
        } else {
          patchDoc(doc.id, {
            reqSpecContent: JSON.stringify(data.content),
            reqSpecStatus: "DRAFT",
            reqSpecRejectReason: null,
          });
        }
      } else {
        alert(data.error || "생성 중 오류가 발생했습니다.");
      }
    } catch {
      alert("네트워크 오류가 발생했습니다.");
    } finally {
      setBusy(null);
    }
  };

  const handleSubmitReview = async (doc: ProjectDocument, type: DocType) => {
    setBusy(`${doc.id}-submit-${type}`);
    try {
      const res = await fetch(`/api/projects/${project.id}/documents/${doc.id}/submit-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const data = await res.json();
      if (data.success) patchDoc(doc.id, { [STATUS_FIELD[type]]: "PENDING_REVIEW" } as Partial<ProjectDocument>);
      else alert(data.error || "검토 요청 실패");
    } finally {
      setBusy(null);
    }
  };

  const handleApprove = async (doc: ProjectDocument, type: DocType) => {
    setBusy(`${doc.id}-approve-${type}`);
    try {
      const res = await fetch(`/api/projects/${project.id}/documents/${doc.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const data = await res.json();
      if (data.success) patchDoc(doc.id, { [STATUS_FIELD[type]]: "APPROVED", [REASON_FIELD[type]]: null } as Partial<ProjectDocument>);
    } finally {
      setBusy(null);
    }
  };

  const handleReject = async () => {
    if (!rejectModal || !rejectReason.trim()) return;
    const { docId, type } = rejectModal;
    setBusy(`${docId}-reject-${type}`);
    try {
      const res = await fetch(`/api/projects/${project.id}/documents/${docId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, reason: rejectReason }),
      });
      const data = await res.json();
      if (data.success) {
        patchDoc(docId, { [STATUS_FIELD[type]]: "REJECTED", [REASON_FIELD[type]]: rejectReason } as Partial<ProjectDocument>);
        setRejectModal(null);
        setRejectReason("");
      }
    } finally {
      setBusy(null);
    }
  };

  const handleDeleteDoc = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/documents/${deleteTarget.id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setProject((prev: any) => ({
          ...prev,
          documents: prev.documents.filter((d: ProjectDocument) => d.id !== deleteTarget.id),
        }));
        // 선택된 문서가 삭제된 경우 선택 해제 → useEffect가 남은 첫 번째 문서를 자동 선택
        if (selectedDocId === deleteTarget.id) setSelectedDocId(null);
        setDeleteTarget(null);
      } else {
        alert(data.error || "삭제에 실패했습니다.");
      }
    } finally {
      setDeleting(false);
    }
  };

  const handleSaveRawContent = async (doc: ProjectDocument, rawContent: string) => {
    setBusy(`${doc.id}-save-raw`);
    try {
      const res = await fetch(`/api/projects/${project.id}/documents/${doc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawContent }),
      });
      const data = await res.json();
      if (data.success) {
        patchDoc(doc.id, { rawContent });
      } else {
        alert(data.error || "저장에 실패했습니다.");
      }
    } catch {
      alert("네트워크 오류가 발생했습니다.");
    } finally {
      setBusy(null);
    }
  };

  // 반려된 기획서/요구사항정의서를 AI 재생성 없이 직접 고쳐서 저장 — 재생성과 마찬가지로
  // 저장하면 DRAFT로 돌아가고 반려 사유는 지워져서 다시 검토요청할 수 있는 상태가 된다.
  const handleSaveDocContent = async (doc: ProjectDocument, type: DocType, content: string) => {
    setBusy(`${doc.id}-save-content-${type}`);
    try {
      const res = await fetch(`/api/projects/${project.id}/documents/${doc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          [CONTENT_FIELD[type]]: content,
          [STATUS_FIELD[type]]: "DRAFT",
          [REASON_FIELD[type]]: null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        patchDoc(doc.id, {
          [CONTENT_FIELD[type]]: content,
          [STATUS_FIELD[type]]: "DRAFT",
          [REASON_FIELD[type]]: null,
        } as Partial<ProjectDocument>);
      } else {
        alert(data.error || "저장에 실패했습니다.");
      }
    } catch {
      alert("네트워크 오류가 발생했습니다.");
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center gap-3">
        <FolderKanban className="w-10 h-10 text-muted-foreground/30" />
        <p className="text-muted-foreground">아직 프로젝트가 없습니다. 먼저 프로젝트를 생성해주세요.</p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6 animate-in fade-in duration-500">
      {/* Header + Tabs */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-8">
          <h1 className="text-2xl font-bold shrink-0">문서생성</h1>
          <div className="flex items-center gap-6 border-b border-transparent">
            {(["proposal", "reqSpec", "taskAssignment"] as PipelineTab[]).map(type => (
              <button
                key={type}
                onClick={() => setActiveTab(type)}
                className={cn(
                  "pb-1 text-base font-medium transition-colors border-b-2",
                  activeTab === type ? "border-primary text-primary font-bold" : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {PIPELINE_TAB_LABEL[type]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 우측 상세 패널의 너비가 문서마다 안의 콘텐츠(표/긴 텍스트) 크기에 따라 밀려서 달라지지 않도록,
          1fr 대신 minmax(0,1fr)로 트랙 크기를 컨테이너 폭에 고정하고 내부에서만 overflow 스크롤되게 한다 */}
      <div className="grid grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)] gap-6 items-start">
        {/* Document list */}
        <div className="glass rounded-2xl border border-white/5 p-4 space-y-3">
          <button
            onClick={() => setNewDocModalOpen(true)}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" /> 새 회의록 / 문서
          </button>

          <div className="space-y-2">
            {documents.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10">등록된 문서가 없습니다.<br />회의록을 등록하세요.</p>
            ) : (
              documents.map(doc => {
                let meta: { label: string; className: string; icon: any };
                if (activeTab === "taskAssignment") {
                  const docTasks = (project.tasks ?? []).filter((t: any) => t.sourceDocumentId === doc.id);
                  meta = docTasks.length === 0
                    ? TASK_ASSIGN_META.NOT_GENERATED
                    : docTasks.every((t: any) => t.assigneeId)
                    ? TASK_ASSIGN_META.ASSIGNED
                    : TASK_ASSIGN_META.NEEDS_ASSIGNMENT;
                } else {
                  meta = STATUS_META[doc[STATUS_FIELD[activeTab]]];
                }
                const Icon = meta.icon;
                return (
                  <div
                    key={doc.id}
                    className={cn(
                      "group w-full flex items-start gap-1 p-3 rounded-xl border transition-colors",
                      selectedDoc?.id === doc.id
                        ? "border-primary/50 bg-primary/5"
                        : "border-transparent hover:bg-black/5 dark:hover:bg-white/5"
                    )}
                  >
                    <button onClick={() => setSelectedDocId(doc.id)} className="flex-1 min-w-0 text-left">
                      <p className="font-semibold text-sm truncate mb-1.5">{doc.title}</p>
                      <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold", meta.className)}>
                        <Icon className="w-3 h-3" /> {meta.label}
                      </span>
                    </button>
                    <button
                      onClick={() => setDeleteTarget({ id: doc.id, title: doc.title })}
                      title="문서 삭제"
                      className="shrink-0 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Detail / preview panel */}
        <div className="glass rounded-2xl border border-white/5 p-6 min-h-[500px]">
          {!selectedDoc ? (
            <div className="h-full flex items-center justify-center text-muted-foreground text-sm py-20">
              왼쪽에서 문서를 선택하거나 새로 등록해주세요.
            </div>
          ) : activeTab === "taskAssignment" ? (
            <TaskAssignmentPanel
              doc={selectedDoc}
              tasks={(project.tasks ?? []).filter((t: any) => t.sourceDocumentId === selectedDoc.id)}
              isPM={isPM}
              projectId={project.id}
              onRefresh={fetchProject}
            />
          ) : (
            <DocDetail
              doc={selectedDoc}
              type={activeTab}
              isPM={isPM}
              busy={busy}
              onGenerate={() => handleGenerate(selectedDoc, activeTab)}
              onSubmitReview={() => handleSubmitReview(selectedDoc, activeTab)}
              onApprove={() => handleApprove(selectedDoc, activeTab)}
              onReject={() => setRejectModal({ docId: selectedDoc.id, type: activeTab })}
              onSaveRawContent={(rawContent) => handleSaveRawContent(selectedDoc, rawContent)}
              onSaveDocContent={(content) => handleSaveDocContent(selectedDoc, activeTab, content)}
            />
          )}
        </div>
      </div>

      {newDocModalOpen && (
        <NewDocumentModal
          projectId={project.id}
          onClose={() => { setNewDocModalOpen(false); fetchProject(); }}
        />
      )}

      {rejectModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-background border border-white/10 rounded-2xl p-6 shadow-2xl max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-bold flex items-center gap-2 text-red-400">
                <RotateCcw className="w-5 h-5" /> 반려 사유 입력
              </h3>
              <button onClick={() => setRejectModal(null)} className="p-1.5 rounded-lg hover:bg-white/5"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-sm text-muted-foreground mb-4">반려 사유는 작성자에게 그대로 전달됩니다.</p>
            <div className="relative mb-4">
              <MessageSquare className="w-4 h-4 absolute left-3 top-3.5 text-muted-foreground" />
              <textarea
                autoFocus
                className="w-full pl-9 pr-4 py-3 bg-black/5 dark:bg-white/5 border border-white/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30 resize-none h-28"
                placeholder="예: 3번 항목 재검토가 필요합니다."
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setRejectModal(null)} className="flex-1 py-2.5 rounded-xl border border-white/10 text-sm font-semibold hover:bg-white/5">취소</button>
              <button
                onClick={handleReject}
                disabled={!rejectReason.trim() || !!busy}
                className="flex-1 py-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-semibold hover:bg-red-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <XCircle className="w-4 h-4" /> 반려 처리
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 문서 삭제 확인 모달 */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-background border border-white/10 rounded-2xl p-6 shadow-2xl max-w-sm w-full mx-4">
            <h3 className="text-xl font-bold mb-2 flex items-center gap-2 text-red-400">
              <Trash2 className="w-5 h-5" /> 문서 삭제
            </h3>
            <p className="text-sm text-muted-foreground mb-6">
              <span className="font-bold text-foreground">"{deleteTarget.title}"</span> 문서를 삭제하시겠습니까?<br />
              이 작업은 되돌릴 수 없습니다.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 py-2.5 rounded-xl border border-white/10 text-sm font-semibold hover:bg-white/5">취소</button>
              <button
                onClick={handleDeleteDoc}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-semibold hover:bg-red-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DocDetail({
  doc, type, isPM, busy, onGenerate, onSubmitReview, onApprove, onReject, onSaveRawContent, onSaveDocContent,
}: {
  doc: ProjectDocument; type: DocType; isPM: boolean; busy: string | null;
  onGenerate: () => void;
  onSubmitReview: () => void; onApprove: () => void; onReject: () => void;
  onSaveRawContent: (rawContent: string) => void;
  onSaveDocContent: (content: string) => void;
}) {
  const content = doc[CONTENT_FIELD[type]];
  const status = doc[STATUS_FIELD[type]];
  const reason = doc[REASON_FIELD[type]];
  const meta = STATUS_META[status];
  const canGenerateReqSpec = type === "reqSpec" ? doc.proposalStatus === "APPROVED" : true;
  const dateLabel = new Date(doc.updatedAt).toLocaleDateString("ko-KR");

  const busyKey = (action: string) => `${doc.id}-${action}-${type}`;

  const handlePrint = () => window.print();

  const handlePptx = async () => {
    const parsed = parseProposalDoc(doc.proposalContent);
    if (!parsed) return;
    await exportProposalPptx(parsed, doc.title);
  };

  // 원본 회의록/메모는 문서를 옮겨다녀도(doc.id 변경) 이전 문서의 미저장 편집분이 남지 않도록
  // doc.id가 바뀔 때마다 로컬 편집 상태를 서버 값으로 리셋한다
  const [rawDraft, setRawDraft] = useState(doc.rawContent ?? "");
  useEffect(() => { setRawDraft(doc.rawContent ?? ""); }, [doc.id]);
  const rawDirty = rawDraft !== (doc.rawContent ?? "");
  const rawSaving = busy === busyKey("save-raw");

  // 기획서 생성 전에는 원본을 펼쳐서 보여주고, 생성되고 나면 접어서 기획서에 집중하게 한다.
  // doc.id가 바뀌거나 방금 생성이 끝나 content가 생기면 이 기본값으로 다시 맞춘다.
  const [rawExpanded, setRawExpanded] = useState(!content);
  useEffect(() => { setRawExpanded(!content); }, [doc.id, !!content]);

  // 반려된 문서를 AI 재생성 없이 직접 고쳐 쓰는 모드 — 문서를 옮기면 편집 중이던 내용은 버린다.
  const [editMode, setEditMode] = useState(false);
  const [editDraft, setEditDraft] = useState<any>(null);
  useEffect(() => { setEditMode(false); setEditDraft(null); }, [doc.id, type]);
  const editSaving = busy === busyKey("save-content");

  const startEdit = () => {
    setEditDraft(type === "proposal" ? parseProposalDoc(content) : parseReqSpecDoc(content));
    setEditMode(true);
  };
  const saveEdit = () => {
    if (!editDraft) return;
    onSaveDocContent(JSON.stringify(editDraft));
    setEditMode(false);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-lg">{doc.title}</h2>
        <span className={cn("inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold", meta.className)}>
          <meta.icon className="w-3.5 h-3.5" /> {meta.label}
        </span>
      </div>

      {/* 요구사항정의서 탭에서는 기획서 산출물에 집중하도록 원본 회의록을 아예 보여주지 않는다.
          기획서 탭에서는 생성 전엔 펼쳐서, 생성 후엔 접어서 보여준다(rawExpanded).
          직접 수정 가능하도록 textarea로 변경 — 원본 내용과 달라졌을 때만 저장 버튼이 활성화된다 */}
      {type === "proposal" && (
        <div className="text-sm">
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={() => setRawExpanded(v => !v)}
              className="flex items-center gap-1.5 text-muted-foreground font-medium hover:text-foreground transition-colors"
            >
              <ChevronDown className={cn("w-4 h-4 transition-transform", !rawExpanded && "-rotate-90")} />
              원본 회의록 / 메모
            </button>
            {rawDirty && rawExpanded && (
              <button
                onClick={() => onSaveRawContent(rawDraft)}
                disabled={rawSaving}
                className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 disabled:opacity-50 transition-colors"
              >
                {rawSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                저장
              </button>
            )}
          </div>
          {rawExpanded && (
            <textarea
              value={rawDraft}
              onChange={e => setRawDraft(e.target.value)}
              placeholder="내용이 없습니다."
              className="w-full bg-black/5 dark:bg-white/5 border border-white/10 rounded-xl p-4 whitespace-pre-wrap h-64 overflow-y-auto text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          )}
        </div>
      )}

      {reason && status === "REJECTED" && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div><span className="font-semibold">반려 사유:</span> {reason}</div>
        </div>
      )}

      <div className="border border-white/10 rounded-xl overflow-hidden">
        <div className="max-h-[520px] overflow-y-auto bg-black/5 dark:bg-black/20">
          {content ? (
            <div id="print-area">
              {type === "proposal" ? (
                <ProposalTemplate
                  doc={editMode ? editDraft : parseProposalDoc(content)!}
                  title={doc.title} dateLabel={dateLabel}
                  editable={editMode} onChange={setEditDraft}
                />
              ) : (
                <ReqSpecTemplate
                  doc={editMode ? editDraft : parseReqSpecDoc(content)!}
                  title={doc.title} dateLabel={dateLabel}
                  editable={editMode} onChange={setEditDraft}
                />
              )}
            </div>
          ) : (
            <div className="p-10 text-center text-muted-foreground text-sm">
              {!canGenerateReqSpec
                ? "기획서가 승인되면 요구사항정의서를 생성할 수 있습니다."
                : `AI가 아직 ${TAB_LABEL[type]}를 생성하지 않았습니다.`}
            </div>
          )}
        </div>
      </div>

      {/* Action bar */}
      <div className="flex justify-end items-center gap-3 pt-2">
        {content && (
          <div className="flex items-center gap-2 mr-auto">
            <button onClick={handlePrint} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-xs font-semibold transition-colors">
              <Printer className="w-3.5 h-3.5" /> PDF 다운로드
            </button>
            {type === "proposal" && (
              <button onClick={handlePptx} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-xs font-semibold transition-colors">
                <Download className="w-3.5 h-3.5" /> PPTX 다운로드
              </button>
            )}
          </div>
        )}

        {!content && canGenerateReqSpec && !isPM && (
          <button
            onClick={onGenerate}
            disabled={busy === busyKey("generate")}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 disabled:opacity-50"
          >
            {busy === busyKey("generate") ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
            {type === "proposal" ? "AI로 기획서 생성" : "AI로 요구사항정의서 생성"}
          </button>
        )}

        {content && !isPM && status === "DRAFT" && (
          <button
            onClick={onSubmitReview}
            disabled={busy === busyKey("submit")}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 disabled:opacity-50"
          >
            {busy === busyKey("submit") ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            검토요청
          </button>
        )}

        {content && !isPM && status === "REJECTED" && !editMode && (
          <>
            <button
              onClick={startEdit}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-sm font-bold transition-colors"
            >
              <Pencil className="w-4 h-4" /> 직접 수정
            </button>
            <button
              onClick={onGenerate}
              disabled={busy === busyKey("generate")}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-500/10 text-red-400 border border-red-500/30 text-sm font-bold hover:bg-red-500/20 disabled:opacity-50"
            >
              {busy === busyKey("generate") ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
              다시 생성하기
            </button>
          </>
        )}

        {status === "REJECTED" && editMode && (
          <>
            <button
              onClick={() => setEditMode(false)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-sm font-bold transition-colors"
            >
              취소
            </button>
            <button
              onClick={saveEdit}
              disabled={editSaving}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 disabled:opacity-50"
            >
              {editSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              저장하고 다시 검토요청
            </button>
          </>
        )}

        {content && !isPM && status === "PENDING_REVIEW" && (
          <span className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-muted text-muted-foreground text-sm font-bold">
            <Clock className="w-4 h-4" /> 요청완료
          </span>
        )}

        {content && isPM && status === "PENDING_REVIEW" && (
          <>
            <button
              onClick={onReject}
              disabled={busy === busyKey("reject")}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-bold hover:bg-red-500/20 disabled:opacity-50"
            >
              <XCircle className="w-4 h-4" /> 반려
            </button>
            <button
              onClick={onApprove}
              disabled={busy === busyKey("approve")}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-bold hover:bg-emerald-600 disabled:opacity-50"
            >
              {busy === busyKey("approve") ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              승인
            </button>
          </>
        )}

      </div>
    </div>
  );
}
