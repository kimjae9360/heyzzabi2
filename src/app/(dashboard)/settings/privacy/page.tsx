"use client";

import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";

// 임의로 작성한 표준 양식 초안 — 실제 서비스 전환 전 법무 검토가 필요하다(사용자 확인 하에 우선 채워넣음).
// 항목은 실제로 이 앱이 수집하는 데이터(직원관리 필드, AI 파이프라인의 OpenAI 전송 등)를 근거로 작성함.
const SECTIONS = [
  {
    title: "1. 수집하는 개인정보 항목",
    body: "회사는 서비스 제공을 위해 다음과 같은 개인정보를 수집합니다.\n\n필수 항목: 이름, 이메일, 비밀번호\n선택 항목(직원관리): 사번, 부서, 직급, 직무, 입사일/퇴사일, 연락처, 기술스택, 자격증, 참여 프로젝트 이력\n서비스 이용 과정에서 자동 생성되는 정보: 등록한 회의록/문서 내용, 업무 배정·진행 이력",
  },
  {
    title: "2. 개인정보의 수집 및 이용 목적",
    body: "① 회원 식별 및 로그인 등 계정 관리\n② 업무 배정, 진행 현황 파악, 승인 처리 등 팀 업무 관리\n③ AI 기반 문서(기획서/요구사항정의서) 생성 및 업무 자동 배분 기능 제공\n④ 직원 현황 관리(직원관리 화면)",
  },
  {
    title: "3. 개인정보의 보유 및 이용 기간",
    body: "이용자가 계정을 삭제하거나 회사와의 이용계약이 종료될 때까지 보유하며, 관계 법령에 따라 보존할 필요가 있는 경우 해당 기간 동안 보관합니다.",
  },
  {
    title: "4. 개인정보의 제3자 제공 및 처리위탁",
    body: "회사는 원칙적으로 이용자의 개인정보를 외부에 제공하지 않습니다. 다만 AI 기능(기획서·요구사항정의서 생성, 업무 자동 배분) 이용 시, 입력한 회의록·문서 내용이 서비스 제공을 위해 AI 모델 제공업체(OpenAI)로 전송됩니다. 전송되는 내용은 이용자가 등록한 원본 텍스트 및 그로부터 파생된 문서 내용이며, 별도 동의 없이 다른 목적으로 이용되지 않습니다.",
  },
  {
    title: "5. 이용자의 권리",
    body: "이용자는 언제든지 자신의 개인정보 열람, 정정을 요청할 수 있으며, 관리자(PM)를 통해 처리할 수 있습니다. 계정 삭제 등 개인정보 파기를 원하는 경우 아래 문의처로 연락해 주세요.",
  },
  {
    title: "6. 개인정보 보호 책임자",
    body: "개인정보 관련 문의, 불만 처리, 피해 구제 등을 위해 아래와 같이 개인정보 보호 책임자를 지정하고 있습니다.\n\n담당: 헤이짜비 운영팀\n이메일: kimjae9360@gmail.com",
  },
];

export default function PrivacyPolicyPage() {
  return (
    <div className="w-full max-w-3xl mx-auto space-y-6 animate-in fade-in duration-500 pb-20">
      <div className="flex flex-col gap-2">
        <Link href="/settings" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit">
          <ArrowLeft className="w-4 h-4" /> 설정으로 돌아가기
        </Link>
        <div className="flex items-center gap-3 text-muted-foreground mt-2">
          <ShieldCheck className="w-5 h-5 text-primary" />
          <h1 className="text-3xl font-black text-foreground tracking-tight">개인정보처리방침</h1>
        </div>
        <p className="text-xs text-muted-foreground">시행일: 2026년 8월 25일</p>
      </div>

      <div className="glass rounded-2xl border border-white/5 p-6 md:p-8 space-y-6">
        {SECTIONS.map((s) => (
          <div key={s.title}>
            <h2 className="font-bold text-sm mb-2">{s.title}</h2>
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{s.body}</p>
          </div>
        ))}
        <div className="pt-4 border-t border-white/5">
          <p className="text-sm text-muted-foreground">부칙: 이 방침은 2026년 8월 25일부터 시행합니다.</p>
        </div>
      </div>
    </div>
  );
}
