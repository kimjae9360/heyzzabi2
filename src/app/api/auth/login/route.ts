import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }

    
    
    let user = await prisma.user.findUnique({ where: { email } });

    // Hardcoded fallback for presentation accounts
    if (!user) {
      if (email === "pm@heyzzabi.com" && password === "admin") {
        user = await prisma.user.create({
          data: {
            email: "pm@heyzzabi.com",
            password: "admin",
            name: "관리자 (PM)",
            role: "PM"
          }
        });
      } else if (email === "newbie@heyzzabi.com" && password === "temp") {
        user = await prisma.user.create({
          data: {
            email: "newbie@heyzzabi.com",
            password: "temp",
            name: "신규멤버 (MEMBER)",
            role: "EMPLOYEE"
          }
        });
      } else {
        return NextResponse.json({ error: "Account not found." }, { status: 401 });
      }
    } else {
      // Allow hardcoded passwords for presentation accounts even if they exist
      if (email === "pm@heyzzabi.com" && password === "admin") {
        // bypass password check
      } else if (email === "newbie@heyzzabi.com" && password === "temp") {
        // bypass password check
      } else if (user.password !== password) {
        return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
      }
    }


    const { password: _, ...userWithoutPassword } = user;

    // Normalize DB role to client role: PM/ADMIN -> "PM", others -> "MEMBER"
    const normalizedRole = user.role === "PM" || user.role === "ADMIN" ? "PM" : "MEMBER";

    return NextResponse.json({ ...userWithoutPassword, role: normalizedRole });
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json({ error: "Server error." }, { status: 500 });
  }
}