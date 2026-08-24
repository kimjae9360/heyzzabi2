"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, CheckCircle, Menu } from "lucide-react";
import { cn } from "@/lib/utils";

export function MobileNav() {
  const pathname = usePathname();

  return (
    <div className="md:hidden fixed bottom-0 left-0 w-full glass border-t border-white/5 z-50">
      <nav className="flex items-center justify-around p-3">
        <Link href="/" className={cn("flex flex-col items-center gap-1", pathname === "/" ? "text-primary" : "text-foreground/70")}>
          <LayoutDashboard className="w-5 h-5" />
          <span className="text-[10px] font-medium">대시보드</span>
        </Link>
        <Link href="/members" className={cn("flex flex-col items-center gap-1", pathname === "/members" ? "text-primary" : "text-foreground/70")}>
          <Users className="w-5 h-5" />
          <span className="text-[10px] font-medium">멤버</span>
        </Link>
        <Link href="/approvals" className={cn("flex flex-col items-center gap-1", pathname === "/approvals" ? "text-primary" : "text-foreground/70")}>
          <CheckCircle className="w-5 h-5" />
          <span className="text-[10px] font-medium">결재</span>
        </Link>
        <button className="flex flex-col items-center gap-1 text-foreground/70">
          <Menu className="w-5 h-5" />
          <span className="text-[10px] font-medium">메뉴</span>
        </button>
      </nav>
    </div>
  );
}
