"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Wand2, FileText, CheckCircle2, ArrowRight, Loader2, PlayCircle, PlusCircle, LayoutList, Bot, Mic, UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";

type AITask = {
  title: string;
  description: string;
  difficulty: string;
};


const SAMPLE_NOTES = [
  `[신규 프로젝트 회의록]
일자: 2026-08-20
참석자: PM, 개발팀, 디자인팀
내용:
- 사내 인트라넷 모바일 앱 버전을 신규 개발하기로 결정.
- 안드로이드/iOS 동시 출시를 위해 React Native 사용 예정.
- 주요 기능: 푸시 알림, 사원증 바코드 생성, 결재 승인 푸시.
- 1차 배포는 3개월 뒤 목표.`,
  `[서비스 개선 회의]
일자: 2026-08-21
참석자: 기획팀, 프론트엔드팀
내용:
- 기존 웹사이트의 결제 페이지 이탈률이 너무 높음.
- 결제 프로세스를 기존 5단계에서 3단계로 축소해야 함.
- 카카오페이, 네이버페이 간편결제 연동 필수.
- 로그인 안 한 유저도 비회원 결제 가능하게 UI 변경 요망.`,
  `[백오피스 고도화 회의]
일자: 2026-08-22
참석자: 백엔드팀, 운영팀
내용:
- 현재 운영팀에서 엑셀로 다운받아 처리하는 정산 작업을 자동화.
- 어드민 페이지에 '월별 정산 대시보드' 차트 추가.
- 매월 1일 자정에 정산 데이터를 집계하는 배치(Batch) 프로그램 개발 필요.
- 권한이 없는 직원이 정산 메뉴에 접근하지 못하도록 권한(Role) 시스템 강화.`
];

export default function NewProjectWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  
  // Projects
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("new");

  // Step 1: Input
  const [contextText, setContextText] = useState("");
  const [projName, setProjName] = useState("");
  
  // Step 2: AI Specs
  const [proposal, setProposal] = useState("");
  const [reqSpec, setReqSpec] = useState("");

  // Step 3: Tasks
    const [aiTasks, setAiTasks] = useState<AITask[]>([]);
  const [isRecording, setIsRecording] = useState(false);

  useEffect(() => {
    fetch("/api/projects").then(res => res.json()).then(data => setProjects(Array.isArray(data) ? data : (data.data || [])));
  }, []);

  
  
  const handleRecord = () => {
    if (isRecording) {
      setIsRecording(false);
      setContextText(prev => prev + `
[음성 녹음 내용]
회의록 자동 기록 테스트입니다. 음성 인식이 완료되었습니다.
`);
    } else {
      setIsRecording(true);
    }
  };

  const handleFileUpload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.doc,.docx,.txt,audio/*';
    input.onchange = () => {
      setLoading(true);
      setTimeout(() => {
        setContextText(prev => prev + `
[파일 업로드 내용]
파일에서 추출된 기획서 내용입니다. 요구사항이 정리되어 있습니다.
`);
        setLoading(false);
      }, 1500);
    };
    input.click();
  };

  const handleLoadSample = () => {
    const randomNote = SAMPLE_NOTES[Math.floor(Math.random() * SAMPLE_NOTES.length)];
    setContextText(randomNote);
  };

  const handleGenerateSpecs = async () => {
    if (!contextText.trim()) return alert("회의록 내용을 입력해주세요.");
    if (selectedProjectId === "new" && !projName.trim()) return alert("새 프로젝트 이름을 입력해주세요.");
    
    setLoading(true);
    try {
      // 1. Generate Proposal
      const resProp = await fetch("/api/ai/parse-meeting", { // Or a new endpoint
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: contextText, type: "proposal" }),
      });
      const propData = await resProp.json();
      setProposal(propData.content || propData.description || "기획서 분석 완료");

      // 2. Generate ReqSpec (Mocking for speed, or we can use the actual API if we expose one)
      // Actually, since it's a wizard, we can hit an API that does both, or do it sequentially.
      // For now, let's just use the existing logic for demo or a combined prompt.
      const resReq = await fetch("/api/ai/parse-meeting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: propData.content || contextText, type: "reqSpec" }),
      });
      const reqData = await resReq.json();
      setReqSpec(reqData.content || reqData.description || "요구사항 분석 완료");

      setStep(2);
    } catch (e: any) {
      alert("AI 분석 중 오류가 발생했습니다: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleExtractTasks = async () => {
    setLoading(true);
    try {
      // In real scenario, we call OpenAI to parse reqSpec into tasks
      const res = await fetch("/api/ai/parse-meeting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: reqSpec, type: "tasks" }),
      });
      const data = await res.json();
      setAiTasks(data.tasks || []);
      setStep(3);
    } catch (e: any) {
      alert("오류 발생: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFinalize = async () => {
    setLoading(true);
    try {
      let finalProjectId = selectedProjectId;

      if (selectedProjectId === "new") {
        const projRes = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: projName,
            description: proposal.substring(0, 100) + "...",
            tasks: aiTasks,
          }),
        });
        const projData = await projRes.json();
        if (!projRes.ok) throw new Error(projData.error || "생성 실패");
        finalProjectId = projData.id;
      } else {
        // Add tasks to existing project
        for (const t of aiTasks) {
          await fetch("/api/tasks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: t.title,
              description: t.description,
              difficulty: t.difficulty,
              status: "BACKLOG",
              projectId: finalProjectId
            }),
          });
        }
        // Save the document as well
        await fetch(`/api/projects/${finalProjectId}/documents`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "마법사 회의록", rawContent: contextText })
        });
      }

      router.push(`/projects/${finalProjectId}`);
    } catch (e: any) {
      alert("적용 중 오류 발생: " + e.message);
      setLoading(false);
    }
  };

  const STEPS = [
    { num: 1, label: "정보 입력" },
    { num: 2, label: "기획 & 요구사항" },
    { num: 3, label: "업무 쪼개기" },
    { num: 4, label: "완료" }
  ];

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 h-full flex flex-col">
      <div className="mb-8 text-center shrink-0">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4 border border-primary/20">
          <Wand2 className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-3xl font-extrabold mb-2">AI 기획 자동화 마법사</h1>
        <p className="text-muted-foreground text-sm">회의록 하나로 기획서 작성부터 업무 쪼개기, 칸반 등록까지 한 번에 끝내보세요.</p>
      </div>

      {/* Stepper */}
      <div className="flex items-center justify-center mb-10 shrink-0">
        {STEPS.map((s, idx) => (
          <div key={s.num} className="flex items-center">
            <div className="flex flex-col items-center">
              <div className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center font-bold border-2 transition-colors",
                step === s.num ? "border-primary bg-primary/10 text-primary" :
                step > s.num ? "border-primary bg-primary text-primary-foreground" :
                "border-muted bg-transparent text-muted-foreground"
              )}>
                {step > s.num ? <CheckCircle2 className="w-5 h-5" /> : s.num}
              </div>
              <span className={cn("text-xs mt-2 font-medium", step >= s.num ? "text-primary" : "text-muted-foreground")}>{s.label}</span>
            </div>
            {idx < STEPS.length - 1 && (
              <div className={cn("w-16 sm:w-32 h-0.5 mx-2 -mt-6 transition-colors", step > s.num ? "bg-primary" : "bg-muted")} />
            )}
          </div>
        ))}
      </div>

      <div className="flex-1 bg-background border border-border rounded-2xl shadow-sm p-6 overflow-hidden flex flex-col min-h-0">
        
        {step === 1 && (
          <div className="space-y-6 flex-1 overflow-y-auto">
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-semibold flex items-center gap-2">
                  <LayoutList className="w-4 h-4" /> 반영할 대상 프로젝트
                </label>
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="w-full bg-black/5 dark:bg-white/5 border border-border rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm font-medium"
                >
                  <option value="new">✨ 새로운 프로젝트 생성하기</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>📁 {p.name} (기존)</option>
                  ))}
                </select>
              </div>
              
              {selectedProjectId === "new" && (
                <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                  <label className="text-sm font-semibold flex items-center gap-2">
                    <PlusCircle className="w-4 h-4" /> 새 프로젝트 이름
                  </label>
                  <input
                    type="text"
                    value={projName}
                    onChange={(e) => setProjName(e.target.value)}
                    placeholder="프로젝트 이름을 입력해주세요."
                    className="w-full bg-black/5 dark:bg-white/5 border border-border rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                  />
                </div>
              )}
            </div>

            <div className="space-y-2">
              
              
            <div className="flex gap-4">
              <button
                onClick={handleRecord}
                className={cn(
                  "flex-1 flex flex-col items-center justify-center gap-3 py-6 rounded-xl border-2 transition-all",
                  isRecording 
                    ? "border-red-500 bg-red-500/10 text-red-500 animate-pulse" 
                    : "border-border hover:border-primary/50 hover:bg-primary/5 text-muted-foreground"
                )}
              >
                <div className={cn("p-4 rounded-full", isRecording ? "bg-red-500/20" : "bg-black/5 dark:bg-white/5")}>
                  <Mic className="w-6 h-6" />
                </div>
                <span className="font-medium">{isRecording ? "녹음 중... (클릭하여 중지)" : "실시간 음성 녹음"}</span>
              </button>

              <button
                onClick={handleFileUpload}
                className="flex-1 flex flex-col items-center justify-center gap-3 py-6 rounded-xl border-2 border-border hover:border-primary/50 hover:bg-primary/5 text-muted-foreground transition-all"
              >
                <div className="p-4 rounded-full bg-black/5 dark:bg-white/5">
                  <UploadCloud className="w-6 h-6" />
                </div>
                <span className="font-medium">기획서 파일 / 음성 업로드</span>
              </button>
            </div>

            <div className="flex justify-between items-center">

                <label className="text-sm font-semibold flex items-center gap-2">
                  <FileText className="w-4 h-4" /> 회의록 또는 메모 내용
                </label>
                <button 
                  onClick={handleLoadSample}
                  className="text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/20 px-3 py-1.5 rounded-md transition-colors"
                >
                  ✨ 샘플 회의록 불러오기
                </button>
              </div>

              <textarea
                value={contextText}
                onChange={(e) => setContextText(e.target.value)}
                placeholder="어떤 기획이 필요한지 회의록이나 메모를 그대로 복사해서 붙여넣으세요..."
                className="w-full h-[300px] bg-black/5 dark:bg-white/5 border border-border rounded-lg p-4 resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm leading-relaxed"
              />
            </div>
            
            <div className="flex justify-end pt-4">
              <button
                onClick={handleGenerateSpecs}
                disabled={loading}
                className="flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 px-8 py-3 rounded-lg font-bold shadow-lg shadow-primary/20 transition-all disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "AI 기획 분석 시작"} <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 grid grid-cols-2 gap-6 min-h-0">
              <div className="flex flex-col min-h-0 border border-border rounded-xl bg-black/5 dark:bg-white/5 p-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2"><Bot className="w-4 h-4 text-primary" /> AI 생성 기획서</h3>
                <textarea 
                  value={proposal}
                  onChange={e => setProposal(e.target.value)}
                  className="flex-1 bg-transparent border-none resize-none focus:outline-none text-sm leading-relaxed" 
                />
              </div>
              <div className="flex flex-col min-h-0 border border-border rounded-xl bg-black/5 dark:bg-white/5 p-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> 요구사항 정의서</h3>
                <textarea 
                  value={reqSpec}
                  onChange={e => setReqSpec(e.target.value)}
                  className="flex-1 bg-transparent border-none resize-none focus:outline-none text-sm leading-relaxed" 
                />
              </div>
            </div>
            <div className="flex justify-between pt-6 shrink-0 border-t border-border mt-6">
              <button onClick={() => setStep(1)} className="px-6 py-2 rounded-lg font-medium text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5 transition-colors">이전 단계</button>
              <button
                onClick={handleExtractTasks}
                disabled={loading}
                className="flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 px-8 py-3 rounded-lg font-bold shadow-lg shadow-primary/20 transition-all disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "이대로 업무 쪼개기"} <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="flex-1 flex flex-col min-h-0">
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><LayoutList className="w-5 h-5 text-primary" /> 생성된 칸반 업무 목록 ({aiTasks.length}개)</h3>
            <p className="text-sm text-muted-foreground mb-4">아래 항목들이 '대기(Backlog)' 상태로 추가됩니다. 불필요한 항목은 삭제하거나 제목을 수정할 수 있습니다.</p>
            
            <div className="flex-1 overflow-y-auto space-y-3 pr-2">
              {aiTasks.map((task, idx) => (
                <div key={idx} className="p-4 border border-border rounded-xl bg-background shadow-sm hover:shadow-md transition-shadow group">
                  <div className="flex justify-between items-start mb-2">
                    <input 
                      type="text" 
                      value={task.title} 
                      onChange={e => {
                        const newTasks = [...aiTasks];
                        newTasks[idx].title = e.target.value;
                        setAiTasks(newTasks);
                      }}
                      className="font-bold text-base bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-primary rounded px-1 -ml-1 w-2/3" 
                    />
                    <select 
                      value={task.difficulty}
                      onChange={e => {
                        const newTasks = [...aiTasks];
                        newTasks[idx].difficulty = e.target.value;
                        setAiTasks(newTasks);
                      }}
                      className="text-xs font-semibold bg-black/5 dark:bg-white/5 border border-border rounded-full px-3 py-1 focus:outline-none"
                    >
                      <option value="낮음">낮음 (Easy)</option>
                      <option value="보통">보통 (Medium)</option>
                      <option value="높음">높음 (Hard)</option>
                    </select>
                  </div>
                  <textarea 
                    value={task.description}
                    onChange={e => {
                        const newTasks = [...aiTasks];
                        newTasks[idx].description = e.target.value;
                        setAiTasks(newTasks);
                    }}
                    className="text-sm text-muted-foreground bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-primary w-full resize-none h-16 rounded px-1 -ml-1 leading-relaxed" 
                  />
                </div>
              ))}
            </div>

            <div className="flex justify-between pt-6 shrink-0 border-t border-border mt-6">
              <button onClick={() => setStep(2)} className="px-6 py-2 rounded-lg font-medium text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5 transition-colors">이전 단계</button>
              <button
                onClick={handleFinalize}
                disabled={loading}
                className="flex items-center gap-2 bg-emerald-500 text-white hover:bg-emerald-600 px-8 py-3 rounded-lg font-bold shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "최종 프로젝트 반영하기"} <PlayCircle className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
