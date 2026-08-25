"use client";

import React from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { useSidebar } from "@/components/layout/SidebarContext";
import { cn } from "@/lib/utils";
import { NotificationBell } from "@/components/layout/NotificationBell";

export function DashboardContent({ children }: { children: React.ReactNode }) {
  const { isOpen } = useSidebar();

  return (
    <>
      <Sidebar />
      <div
        className={cn(
          "pb-16 md:pb-0 flex flex-col min-h-screen transition-[padding] duration-300 ease-in-out",
          isOpen ? "md:pl-64" : "md:pl-16"
        )}
      >
        {/* 페이지마다 따로 헤더를 만드는 이 앱 구조상 "모든 탭에서 항상 상단 우측"에 두려면
            공용 바가 필요하다(사용자 요청 — 처음엔 사이드바에 뒀다가 위치를 옮김) */}
        <div className="h-14 shrink-0 flex items-center justify-end px-4 md:px-8 border-b border-white/5">
          <NotificationBell />
        </div>
        {/* 상하 여백을 좌우보다 확 줄임 — 알림 바 아래 여백이 과하다는 피드백, 한 번 줄이고도
            더 줄여달라는 요청이 있어 최종적으로 원래(p-8)의 1/4 수준까지 좁힘(모든 탭 공용) */}
        <main className="flex-1 px-4 md:px-8 py-1.5 md:py-2 min-w-0 flex flex-col">
          {children}
        </main>
      </div>
    </>
  );
}
