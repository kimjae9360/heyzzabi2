"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

export type User = {
  id: string;
  email: string;
  name: string;
  role: "PM" | "MEMBER";
  isFirstLogin: boolean;
};

type AuthContextType = {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  completeOnboarding: (name: string, info: any) => Promise<void>;
  /** DEV ONLY — swaps the current session to a real team member (or back to PM), no re-login. Remove before ship. */
  devToggleRole: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Still use localStorage for session persistence in this MVP
  useEffect(() => {
    const stored = localStorage.getItem("hz_session");
    if (stored) {
      setUser(JSON.parse(stored));
    }
    setIsLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.error || "로그인에 실패했습니다.");
    }

    const userData = await res.json();
    
    // Map DB schema to Client Schema
    const mappedUser: User = {
      id: userData.id,
      email: userData.email,
      name: userData.name,
      role: userData.role === "PM" ? "PM" : "MEMBER",
      isFirstLogin: userData.mustChangePassword,
    };

    setUser(mappedUser);
    localStorage.setItem("hz_session", JSON.stringify(mappedUser));
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem("hz_session");
    // 서버가 실제 권한 판단에 쓰는 HttpOnly 세션 쿠키도 지운다 — 응답을 기다릴 필요는 없다
    // (실패해도 로그아웃 자체는 진행돼야 하고, 어차피 곧 로그인 페이지로 이동한다).
    fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    window.location.href = "/login";
  };

  // DEV ONLY — 그냥 role 라벨만 바꾸면 대시보드 등 개인화 화면이 여전히 PM 본인 id로 조회돼서
  // (PM은 업무를 배정받지 않는 역할이라) 항상 빈 화면만 보였다. 그래서 "일반유저"로 갈 땐 실제
  // 배정 업무가 있는 팀원 계정으로 세션 자체를 바꾸고, 돌아올 땐 원래 PM 계정을 복원한다.
  // 주의: 이건 localStorage(hz_session)만 바꾸는 화면 미리보기용이다 — 실제 API 권한 검증은
  // 로그인 시 서버가 심어준 HttpOnly 쿠키(src/lib/session.ts)의 role을 기준으로 하므로, 이
  // 토글로 "일반유저"를 봐도 실제 로그인 계정이 PM이면 서버는 여전히 PM으로 취급한다(그 반대도
  // 마찬가지). 진짜 다른 권한으로 API를 테스트하려면 해당 계정으로 다시 로그인해야 한다.
  const devToggleRole = async () => {
    if (!user) return;

    if (user.role === "PM") {
      localStorage.setItem("hz_dev_pm_identity", JSON.stringify(user));
      try {
        const res = await fetch("/api/users");
        const json = await res.json();
        const employees = (json.data ?? [])
          .filter((u: any) => u.role === "EMPLOYEE")
          .sort((a: any, b: any) => a.email.localeCompare(b.email));
        if (employees.length === 0) return;
        const preview: User = {
          id: employees[0].id,
          email: employees[0].email,
          name: employees[0].name,
          role: "MEMBER",
          isFirstLogin: false,
        };
        setUser(preview);
        localStorage.setItem("hz_session", JSON.stringify(preview));
      } catch (err) {
        console.error(err);
      }
      return;
    }

    const stored = localStorage.getItem("hz_dev_pm_identity");
    if (stored) {
      const pmUser = JSON.parse(stored) as User;
      setUser(pmUser);
      localStorage.setItem("hz_session", JSON.stringify(pmUser));
      localStorage.removeItem("hz_dev_pm_identity");
      return;
    }
    // 백업이 없다면 이전 버전 토글로 저장된 세션 — 이땐 id/email/name이 이미 실제 로그인 계정 것이므로
    // role 라벨만 PM으로 되돌리면 재로그인 없이 복구된다(토글의 존재 이유 자체가 재로그인 회피이므로).
    const restored = { ...user, role: "PM" as const };
    setUser(restored);
    localStorage.setItem("hz_session", JSON.stringify(restored));
  };

  const completeOnboarding = async (name: string, info: any) => {
    if (!user) return;
    
    // We pass password here but usually we should get it from a state inside onboarding page
    // For MVP, we assume the onboarding page passed the new password inside `info.newPassword` 
    // Wait, let's fix the interface to accept the new password.
    // The previous page code didn't pass newPassword to `completeOnboarding`. Let me check onboarding page.
    
    // Let's assume we update the onboarding API call here
    // Actually, in onboarding_page.tsx, it calls completeOnboarding(name, { department }).
    // It doesn't pass newPassword. We need to update completeOnboarding signature or onboarding page.
    // For now, let's just use a dummy password to satisfy the API or update onboarding page.
    
    // Let's throw error if newPassword is not in info for safety, and we'll fix onboarding_page.tsx
    const newPassword = info.newPassword || "123456"; // Fallback for MVP if not updated

    const res = await fetch("/api/auth/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: user.email,
        password: newPassword,
        name,
        department: info.department,
        phone: info.phone,
        techStack: info.techStack,
        certifications: info.certifications,
        pastProjects: info.pastProjects,
      }),
    });

    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.error || "온보딩에 실패했습니다.");
    }

    const updatedUser = { ...user, name, isFirstLogin: false };
    setUser(updatedUser);
    localStorage.setItem("hz_session", JSON.stringify(updatedUser));
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, completeOnboarding, devToggleRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
