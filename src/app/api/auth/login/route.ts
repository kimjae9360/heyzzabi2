import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword, isHashed } from "@/lib/passwordHash";
import { createSessionToken, SESSION_COOKIE } from "@/lib/session";

// 로그인 처리: 이메일/비밀번호를 검증하고, 성공 시 비밀번호를 제외한 사용자 정보를 반환한다.
export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }



    let user = await prisma.user.findUnique({ where: { email } });

    // Hardcoded fallback for presentation accounts
    // 데모/발표용 계정(pm, newbie)이 DB에 아직 없을 때만 자동으로 생성해준다.
    if (!user) {
      if (email === "pm@heyzzabi.com" && password === "admin") {
        user = await prisma.user.create({
          data: {
            email: "pm@heyzzabi.com",
            password: await hashPassword("admin"),
            name: "관리자 (PM)",
            role: "PM"
          }
        });
      } else if (email === "newbie@heyzzabi.com" && password === "temp") {
        user = await prisma.user.create({
          data: {
            email: "newbie@heyzzabi.com",
            password: await hashPassword("temp"),
            name: "신규멤버 (MEMBER)",
            role: "EMPLOYEE"
          }
        });
      } else {
        return NextResponse.json({ error: "Account not found." }, { status: 401 });
      }
    } else {
      // 계정이 이미 있으면(=한 번이라도 만들어진 계정이면) 데모 계정이라도 항상 실제 저장된
      // 비밀번호로만 검증한다. 예전엔 pm/newbie 데모 계정에 한해 하드코딩된 비밀번호가 계정이
      // 존재해도 계속 통과됐는데, 그러면 비밀번호를 바꿔도 예전 값으로 로그인이 계속 되는
      // 인증 우회 버그였다(QA에서 발견) — 위 자동 시딩(계정이 아예 없을 때만)과는 별개.
      // verifyPassword는 평문/해시 계정을 모두 지원한다 — 아직 해시로 마이그레이션 안 된
      // 레거시 계정이면 로그인 성공 직후 바로 해시로 재저장한다(아래).
      const ok = await verifyPassword(password, user.password);
      if (!ok) {
        return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
      }
      if (!isHashed(user.password)) {
        user = await prisma.user.update({ where: { id: user.id }, data: { password: await hashPassword(password) } });
      }
    }


    // 응답에는 비밀번호 필드를 절대 포함하지 않도록 구조분해로 제거한다.
    const { password: _, ...userWithoutPassword } = user;

    // Normalize DB role to client role: PM/ADMIN -> "PM", others -> "MEMBER"
    const isPM = user.role === "PM" || user.role === "ADMIN";
    const normalizedRole = isPM ? "PM" : "MEMBER";

    const response = NextResponse.json({ ...userWithoutPassword, role: normalizedRole });
    // 클라이언트(localStorage의 hz_session)는 UI 표시용일 뿐이고, 실제 권한 검증은 이 HttpOnly
    // 쿠키를 서버가 읽어서 판단한다 — localStorage는 devtools에서 누구나 값을 바꿀 수 있지만
    // 이 쿠키는 서명돼 있어 클라이언트가 role을 조작해도 서버 검증을 통과할 수 없다.
    response.cookies.set(SESSION_COOKIE, createSessionToken(user.id, isPM ? "PM" : "EMPLOYEE"), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7일
    });
    return response;
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}