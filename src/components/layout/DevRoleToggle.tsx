"use client";

// DEV ONLY — top-fixed segmented toggle to switch the current session between
// PM and a real team member account instantly, so both role-specific views
// (with real per-user data) can be tested without re-logging in. Safe to
// delete this file (and its usage in the dashboard layout) before ship.

import { useAuth } from "@/lib/auth";
import { ShieldCheck, User as UserIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function DevRoleToggle() {
  const { user, devToggleRole } = useAuth();
  if (!user) return null;

  const isPM = user.role === "PM";

  return (
    <div className="fixed top-3 right-3 z-[200] flex items-center gap-1.5 p-1 rounded-full shadow-2xl bg-yellow-400 border border-yellow-500">
      <span className="pl-2 pr-1 text-[10px] font-black text-black/60 uppercase tracking-wider">DEV</span>
      <button
        onClick={() => !isPM && devToggleRole()}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-colors",
          isPM ? "bg-black text-yellow-300" : "text-black/60 hover:text-black"
        )}
      >
        <ShieldCheck className="w-3.5 h-3.5" /> PM
      </button>
      <button
        onClick={() => isPM && devToggleRole()}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-colors",
          !isPM ? "bg-black text-yellow-300" : "text-black/60 hover:text-black"
        )}
      >
        <UserIcon className="w-3.5 h-3.5" /> 일반유저
      </button>
    </div>
  );
}
