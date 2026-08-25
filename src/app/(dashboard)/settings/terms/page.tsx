"use client";

import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";

// 임의로 작성한 표준 양식 초안 — 실제 서비스 전환 전 법무 검토가 필요하다(사용자 확인 하에 우선 채워넣음).
const ARTICLES = [
  {
    title: "제1조 (목적)",
    body: "이 약관은 헤이짜비(이하 \"회사\")가 제공하는 AI 기반 팀 업무 자동화 서비스(이하 \"서비스\")의 이용과 관련하여 회사와 이용자 간의 권리, 의무 및 책임사항을 규정함을 목적으로 합니다.",
  },
  {
    title: "제2조 (정의)",
    body: "① \"서비스\"란 회의록 등록, AI 기반 기획서·요구사항정의서 생성, 업무 자동 배분, 진행 현황 관리 등 회사가 제공하는 일체의 기능을 말합니다.\n② \"이용자\"란 이 약관에 따라 회사와 이용계약을 체결하고 서비스를 이용하는 임직원을 말합니다.\n③ \"계정\"이란 이용자의 식별과 서비스 이용을 위해 회사가 부여한 이메일 및 비밀번호의 조합을 말합니다.",
  },
  {
    title: "제3조 (약관의 효력 및 변경)",
    body: "① 이 약관은 서비스 화면에 게시하거나 기타의 방법으로 이용자에게 공지함으로써 효력이 발생합니다.\n② 회사는 필요한 경우 관련 법령을 위배하지 않는 범위에서 이 약관을 변경할 수 있으며, 변경된 약관은 공지 후 효력이 발생합니다.",
  },
  {
    title: "제4조 (서비스의 제공)",
    body: "① 회사는 회의록으로부터 기획서·요구사항정의서를 생성하고, 승인된 요구사항을 업무 단위로 분해·배분하는 일련의 파이프라인을 제공합니다.\n② 회사는 서비스의 내용, 운영상 또는 기술상 필요에 따라 제공하는 서비스의 전부 또는 일부를 변경할 수 있습니다.\n③ 서비스는 원칙적으로 연중무휴, 1일 24시간 제공함을 원칙으로 하나, 시스템 점검 등 필요한 경우 일시 중단될 수 있습니다.",
  },
  {
    title: "제5조 (이용자의 의무)",
    body: "① 이용자는 계정 정보를 선량한 관리자의 주의로 관리해야 하며, 이를 제3자에게 양도하거나 대여할 수 없습니다.\n② 이용자는 서비스를 이용하여 얻은 정보를 회사의 사전 승낙 없이 복제, 유통하거나 영리 목적으로 이용할 수 없습니다.\n③ 이용자는 서비스에 허위 정보를 등록하거나 타인의 정보를 도용해서는 안 됩니다.",
  },
  {
    title: "제6조 (회사의 의무)",
    body: "① 회사는 관련 법령과 이 약관이 금지하거나 미풍양속에 반하는 행위를 하지 않으며, 계속적이고 안정적으로 서비스를 제공하기 위해 노력합니다.\n② 회사는 이용자의 개인정보를 보호하기 위해 개인정보처리방침을 수립·공개하고 이를 준수합니다.",
  },
  {
    title: "제7조 (계정 관리)",
    body: "① 계정에 관한 관리 책임은 이용자에게 있으며, 회사는 이용자의 관리 소홀로 인해 발생한 손해에 대해 책임을 지지 않습니다.\n② 이용자는 계정이 도용되거나 제3자에 의해 사용되고 있음을 인지한 경우 즉시 관리자(PM)에게 통지해야 합니다.",
  },
  {
    title: "제8조 (서비스 이용 제한)",
    body: "회사는 이용자가 이 약관의 의무를 위반하거나 서비스의 정상적인 운영을 방해한 경우, 사전 통지 후 서비스 이용을 제한하거나 계정을 정지할 수 있습니다.",
  },
  {
    title: "제9조 (지적재산권)",
    body: "① 서비스에 대한 저작권 및 지적재산권은 회사에 귀속됩니다.\n② 이용자가 서비스를 이용하며 생성한 문서·업무 데이터의 소유권은 해당 이용자가 속한 조직(회사/팀)에 귀속됩니다.",
  },
  {
    title: "제10조 (면책조항)",
    body: "① 회사는 천재지변, 시스템 장애 등 불가항력으로 인해 서비스를 제공할 수 없는 경우 책임이 면제됩니다.\n② 서비스가 제공하는 AI 생성 결과(기획서, 요구사항정의서, 업무 분해 등)는 참고 자료이며, 최종 검토와 판단의 책임은 이용자 및 담당 조직에 있습니다.",
  },
];

export default function TermsPage() {
  return (
    <div className="w-full max-w-3xl mx-auto space-y-6 animate-in fade-in duration-500 pb-20">
      <div className="flex flex-col gap-2">
        <Link href="/settings" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit">
          <ArrowLeft className="w-4 h-4" /> 설정으로 돌아가기
        </Link>
        <div className="flex items-center gap-3 text-muted-foreground mt-2">
          <FileText className="w-5 h-5 text-primary" />
          <h1 className="text-3xl font-black text-foreground tracking-tight">이용약관</h1>
        </div>
        <p className="text-xs text-muted-foreground">시행일: 2026년 8월 25일</p>
      </div>

      <div className="glass rounded-2xl border border-white/5 p-6 md:p-8 space-y-6">
        {ARTICLES.map((a) => (
          <div key={a.title}>
            <h2 className="font-bold text-sm mb-2">{a.title}</h2>
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{a.body}</p>
          </div>
        ))}
        <div className="pt-4 border-t border-white/5">
          <p className="text-sm text-muted-foreground">부칙: 이 약관은 2026년 8월 25일부터 시행합니다.</p>
        </div>
      </div>
    </div>
  );
}
