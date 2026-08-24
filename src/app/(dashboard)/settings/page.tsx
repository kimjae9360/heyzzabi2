"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { Settings as SettingsIcon, Loader2, Save, CheckCircle2, MessageSquare, GitBranch, Sparkles, FolderKanban } from "lucide-react";
import { cn } from "@/lib/utils";
import { AgentBadge } from "@/components/ui/AgentBadge";
import { parseAgentConfig, DEFAULT_AGENT_CONFIG, type AgentConfig } from "@/lib/agentConfig";

type Project = {
  id: string;
  name: string;
  description: string | null;
  slackWebhookUrl: string | null;
  githubOwner: string | null;
  githubRepo: string | null;
  agentConfig: string | null;
};

export default function SettingsPage() {
  const { user } = useAuth();
  const isPM = user?.role === "PM";

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [slackWebhookUrl, setSlackWebhookUrl] = useState("");
  const [githubOwner, setGithubOwner] = useState("");
  const [githubRepo, setGithubRepo] = useState("");
  const [agentConfig, setAgentConfig] = useState<AgentConfig>(DEFAULT_AGENT_CONFIG);

  const [savingBasic, setSavingBasic] = useState(false);
  const [savedBasic, setSavedBasic] = useState(false);
  const [savingIntegrations, setSavingIntegrations] = useState(false);
  const [savedIntegrations, setSavedIntegrations] = useState(false);
  const [savingAgents, setSavingAgents] = useState(false);
  const [savedAgents, setSavedAgents] = useState(false);

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
        if (detail.success) {
          const p: Project = detail.data;
          setProject(p);
          setName(p.name);
          setDescription(p.description || "");
          setSlackWebhookUrl(p.slackWebhookUrl || "");
          setGithubOwner(p.githubOwner || "");
          setGithubRepo(p.githubRepo || "");
          setAgentConfig(parseAgentConfig(p.agentConfig));
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const saveBasic = async () => {
    if (!project || !name.trim()) return;
    setSavingBasic(true); setSavedBasic(false);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description }),
      });
      if (res.ok) { setSavedBasic(true); setTimeout(() => setSavedBasic(false), 2000); }
    } finally {
      setSavingBasic(false);
    }
  };

  const saveIntegrations = async () => {
    if (!project) return;
    setSavingIntegrations(true); setSavedIntegrations(false);
    try {
      const res = await fetch(`/api/projects/${project.id}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slackWebhookUrl, githubOwner, githubRepo }),
      });
      if (res.ok) { setSavedIntegrations(true); setTimeout(() => setSavedIntegrations(false), 2000); }
    } finally {
      setSavingIntegrations(false);
    }
  };

  const saveAgents = async () => {
    if (!project) return;
    setSavingAgents(true); setSavedAgents(false);
    try {
      const res = await fetch(`/api/projects/${project.id}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentConfig }),
      });
      const data = await res.json();
      // 서버가 clamp한 최종값으로 화면을 맞춘다 — 슬라이더로는 이미 범위 안이라 보통 그대로지만,
      // min/max 업무 개수처럼 두 값이 서로 얽힌 필드는 서버 쪽 보정이 있을 수 있다.
      if (res.ok && data.data?.agentConfig) setAgentConfig(parseAgentConfig(data.data.agentConfig));
      if (res.ok) { setSavedAgents(true); setTimeout(() => setSavedAgents(false), 2000); }
    } finally {
      setSavingAgents(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center gap-3">
        <FolderKanban className="w-10 h-10 text-muted-foreground/30" />
        <p className="text-muted-foreground">
          {isPM ? "아직 프로젝트가 없습니다. 먼저 프로젝트를 생성해주세요." : "아직 프로젝트가 없습니다. PM에게 프로젝트 생성을 요청해주세요."}
        </p>
        {isPM && (
          <Link href="/project/new" className="inline-block mt-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-bold hover:bg-primary/90 transition-colors">
            첫 프로젝트 만들기
          </Link>
        )}
      </div>
    );
  }

  const inputClass = (editable: boolean) => cn(
    "w-full px-4 py-2 bg-black/5 dark:bg-white/5 border border-white/10 rounded-lg text-sm",
    editable && "focus:outline-none focus:ring-2 focus:ring-primary/40"
  );

  return (
    <div className="w-full max-w-3xl mx-auto space-y-6 animate-in fade-in duration-500 pb-20">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3 text-muted-foreground mb-1">
          <SettingsIcon className="w-5 h-5 text-primary" />
          <h1 className="text-3xl font-black text-foreground tracking-tight">설정</h1>
        </div>
        <p className="text-muted-foreground">이 앱은 단일 프로젝트 전제로 동작해 여기서 바로 프로젝트 설정을 다룹니다.</p>
      </div>

      {/* 기본 정보 */}
      <section className="glass rounded-2xl border border-white/5 p-6 space-y-4">
        <h2 className="text-lg font-bold">기본 정보</h2>
        <div>
          <label className="text-sm font-semibold mb-1 block text-muted-foreground">프로젝트명</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)} readOnly={!isPM} className={inputClass(isPM)} />
        </div>
        <div>
          <label className="text-sm font-semibold mb-1 block text-muted-foreground">설명</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} readOnly={!isPM} rows={3} className={inputClass(isPM)} />
        </div>
        {isPM ? (
          <button onClick={saveBasic} disabled={savingBasic || !name.trim()} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 disabled:opacity-50">
            {savingBasic ? <Loader2 className="w-4 h-4 animate-spin" /> : savedBasic ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {savedBasic ? "저장됨" : "저장하기"}
          </button>
        ) : (
          <p className="text-xs text-muted-foreground">* 설정 수정은 PM만 가능합니다.</p>
        )}
      </section>

      {/* 외부 연동 */}
      <section className="glass rounded-2xl border border-white/5 p-6 space-y-4">
        <div>
          <h2 className="text-lg font-bold">외부 연동</h2>
          <p className="text-xs text-muted-foreground mt-1">
            연동 정보를 저장해두는 자리입니다 — Slack 알림 발송이나 GitHub PR 상태 동기화 같은 실제 연동 동작은
            아직 구현되어 있지 않습니다(업무관리의 Git 상태는 지금은 수동 선택입니다).
          </p>
        </div>
        <div>
          <label className="text-sm font-semibold mb-1 flex items-center gap-1.5 text-muted-foreground">
            <MessageSquare className="w-3.5 h-3.5" /> Slack Webhook URL
          </label>
          <input
            type="text"
            placeholder="https://hooks.slack.com/services/..."
            value={slackWebhookUrl}
            onChange={e => setSlackWebhookUrl(e.target.value)}
            readOnly={!isPM}
            className={inputClass(isPM)}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-semibold mb-1 flex items-center gap-1.5 text-muted-foreground">
              <GitBranch className="w-3.5 h-3.5" /> GitHub Owner
            </label>
            <input type="text" placeholder="org-or-user" value={githubOwner} onChange={e => setGithubOwner(e.target.value)} readOnly={!isPM} className={inputClass(isPM)} />
          </div>
          <div>
            <label className="text-sm font-semibold mb-1 block text-muted-foreground">GitHub Repo</label>
            <input type="text" placeholder="repo-name" value={githubRepo} onChange={e => setGithubRepo(e.target.value)} readOnly={!isPM} className={inputClass(isPM)} />
          </div>
        </div>
        {isPM ? (
          <button onClick={saveIntegrations} disabled={savingIntegrations} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 disabled:opacity-50">
            {savingIntegrations ? <Loader2 className="w-4 h-4 animate-spin" /> : savedIntegrations ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {savedIntegrations ? "저장됨" : "저장하기"}
          </button>
        ) : (
          <p className="text-xs text-muted-foreground">* 설정 수정은 PM만 가능합니다.</p>
        )}
      </section>

      {/* 에이전트 설정 */}
      <section className="glass rounded-2xl border border-white/5 p-6 space-y-5">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" /> 에이전트 설정
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            문서생성 파이프라인의 AI 에이전트 3종을 세부 조정합니다. 값은 실제 생성 API 호출에 그대로 반영됩니다.
            &ldquo;원본에 없는 내용은 지어내지 않는다&rdquo;는 환각 방지 원칙을 지키기 위해 다양성(temperature)은
            0~0.3 범위로만 조정할 수 있습니다.
          </p>
        </div>

        <AgentTemperatureCard
          agent="proposal"
          title="기획서 생성 에이전트"
          description="회의록/메모를 바탕으로 프로젝트 기획서 초안을 작성합니다."
          temperature={agentConfig.proposal.temperature}
          onChange={t => setAgentConfig(c => ({ ...c, proposal: { temperature: t } }))}
          editable={isPM}
        />
        <AgentTemperatureCard
          agent="reqSpec"
          title="요구사항정의서 생성 에이전트"
          description="승인된 기획서를 바탕으로 개발 가능한 수준의 요구사항정의서를 작성합니다."
          temperature={agentConfig.reqSpec.temperature}
          onChange={t => setAgentConfig(c => ({ ...c, reqSpec: { temperature: t } }))}
          editable={isPM}
        />
        <AgentTemperatureCard
          agent="taskAssign"
          title="업무 배분 에이전트"
          description="승인된 요구사항정의서를 실행 가능한 업무 단위로 쪼갭니다."
          temperature={agentConfig.taskAssign.temperature}
          onChange={t => setAgentConfig(c => ({ ...c, taskAssign: { ...c.taskAssign, temperature: t } }))}
          editable={isPM}
        >
          <div className="flex items-center gap-3 mt-3 pt-3 border-t border-white/5">
            <label className="text-xs font-semibold text-muted-foreground shrink-0">한 번에 추출할 업무 개수</label>
            <input
              type="number" min={1} max={agentConfig.taskAssign.maxTasks} step={1}
              value={agentConfig.taskAssign.minTasks}
              onChange={e => setAgentConfig(c => ({ ...c, taskAssign: { ...c.taskAssign, minTasks: Math.max(1, Number(e.target.value) || 1) } }))}
              disabled={!isPM}
              className="w-16 px-2 py-1 bg-black/5 dark:bg-white/5 border border-white/10 rounded-lg text-xs text-center focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-60"
            />
            <span className="text-xs text-muted-foreground">~</span>
            <input
              type="number" min={agentConfig.taskAssign.minTasks} max={15} step={1}
              value={agentConfig.taskAssign.maxTasks}
              onChange={e => setAgentConfig(c => ({ ...c, taskAssign: { ...c.taskAssign, maxTasks: Math.min(15, Number(e.target.value) || c.taskAssign.minTasks) } }))}
              disabled={!isPM}
              className="w-16 px-2 py-1 bg-black/5 dark:bg-white/5 border border-white/10 rounded-lg text-xs text-center focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-60"
            />
            <span className="text-xs text-muted-foreground">개 (기본 3~7)</span>
          </div>
        </AgentTemperatureCard>

        {isPM ? (
          <button onClick={saveAgents} disabled={savingAgents} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 disabled:opacity-50">
            {savingAgents ? <Loader2 className="w-4 h-4 animate-spin" /> : savedAgents ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {savedAgents ? "저장됨" : "저장하기"}
          </button>
        ) : (
          <p className="text-xs text-muted-foreground">* 설정 수정은 PM만 가능합니다.</p>
        )}
      </section>
    </div>
  );
}

function AgentTemperatureCard({
  agent, title, description, temperature, onChange, editable, children,
}: {
  agent: "proposal" | "reqSpec" | "taskAssign";
  title: string;
  description: string;
  temperature: number;
  onChange: (t: number) => void;
  editable: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/10 p-4">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-semibold text-sm flex items-center gap-2">{title} <AgentBadge agent={agent} /></h3>
        <span className="text-xs font-mono text-muted-foreground">{temperature.toFixed(2)}</span>
      </div>
      <p className="text-xs text-muted-foreground mb-3">{description}</p>
      <input
        type="range" min={0} max={0.3} step={0.05}
        value={temperature}
        onChange={e => onChange(Number(e.target.value))}
        disabled={!editable}
        className="w-full accent-primary disabled:opacity-60"
      />
      <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
        <span>0 · 항상 같은 결과(결정적)</span>
        <span>0.3 · 표현에 약간의 다양성</span>
      </div>
      {children}
    </div>
  );
}
