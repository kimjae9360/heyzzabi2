"use client";

import React from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { useSidebar } from "@/components/layout/SidebarContext";
import { cn } from "@/lib/utils";

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
        <main className="flex-1 p-4 md:p-8 min-w-0 flex flex-col">
          {children}
        </main>
      </div>
    </>
  );
}
