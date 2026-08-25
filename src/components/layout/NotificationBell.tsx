"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCircle2, AlertTriangle, XCircle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";

type NotificationItem = {
  id: string;
  message: string;
  type: "info" | "success" | "warning" | "error";
  link: string | null;
  read: boolean;
  createdAt: string;
};

const TYPE_ICON: Record<NotificationItem["type"], any> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
};
const TYPE_COLOR: Record<NotificationItem["type"], string> = {
  info: "text-blue-500",
  success: "text-emerald-500",
  warning: "text-orange-500",
  error: "text-red-500",
};

const relativeTime = (dateStr: string) => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "방금 전";
  if (mins < 60) return `${mins}분 전`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}시간 전`;
  return `${Math.floor(hrs / 24)}일 전`;
};

// 대시보드 헤더 우측(사용자 지정 위치)의 알림 종 — 배분승인대기 발생/승인/반려, 문서 검토요청
// 같은, 당사자가 화면을 직접 열어보기 전엔 알 방법이 없던 이벤트를 보여준다.
// 서버 세션이 없는 앱이라 다른 라우트(/api/tasks?assigneeId=)와 동일하게 user.id를 쿼리로 넘긴다.
export function NotificationBell() {
  const { user } = useAuth();
  const router = useRouter();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch(`/api/notifications?userId=${user.id}`);
      const data = await res.json();
      if (data.success) setNotifications(data.data);
    } catch (e) {
      console.error(e);
    }
  }, [user]);

  useEffect(() => {
    fetchNotifications();
    // 실시간 푸시가 없어 짧은 폴링으로 대신한다 — 알림이 생기고 나서 화면을 새로고침해야만
    // 보이면 "인앱 알림"이라 부르기 민망하므로, 열려있는 동안은 30초마다 스스로 갱신한다.
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAllRead = async () => {
    if (!user || unreadCount === 0) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    try {
      await fetch("/api/notifications/read-all", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleItemClick = (n: NotificationItem) => {
    setIsOpen(false);
    if (n.link) router.push(n.link);
  };

  if (!user) return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setIsOpen((v) => !v)}
        className={cn(
          "relative p-2.5 rounded-xl transition-colors",
          isOpen ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5"
        )}
        aria-label="알림"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-red-500 rounded-full text-white text-[9px] flex items-center justify-center font-black px-0.5">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-96 max-w-[90vw] bg-background rounded-xl shadow-2xl border border-border z-50 overflow-hidden animate-in fade-in duration-150">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-black/5 dark:bg-white/5">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-muted-foreground" />
              <span className="font-bold text-sm">알림</span>
              {unreadCount > 0 && <span className="bg-red-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full">{unreadCount}개 미확인</span>}
            </div>
            <button onClick={markAllRead} disabled={unreadCount === 0} className="text-[11px] font-bold text-primary hover:text-primary/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              모두 읽음
            </button>
          </div>
          <div className="max-h-96 overflow-y-auto divide-y divide-border">
            {notifications.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-sm">새로운 알림이 없습니다.</div>
            ) : (
              notifications.map((n) => {
                const Icon = TYPE_ICON[n.type] ?? Info;
                return (
                  <button
                    key={n.id}
                    onClick={() => handleItemClick(n)}
                    className={cn("w-full flex items-start gap-3 px-4 py-3 hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-left", !n.read && "bg-primary/5")}
                  >
                    <Icon className={cn("w-4 h-4 mt-0.5 shrink-0", TYPE_COLOR[n.type] ?? "text-muted-foreground")} />
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-sm leading-snug", !n.read && "font-semibold")}>{n.message}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{relativeTime(n.createdAt)}</p>
                    </div>
                    {!n.read && <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1.5" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
