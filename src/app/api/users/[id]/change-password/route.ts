import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/passwordHash";
import { requireAuth } from "@/lib/requireAuth";

// 사용자 본인이 현재 비밀번호를 확인한 뒤 새 비밀번호로 변경한다 (관리자의 강제 초기화와 달리 자율 변경).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { session, error: authError } = await requireAuth();
    if (authError) return authError;

    const { id } = await params;
    // [id]가 URL 파라미터라 로그인만 확인하면 다른 사람 id를 넣어 그 사람 비밀번호를 바꿔볼 수
    // 있다 — currentPassword를 몰라 실패하겠지만, "본인만" 이라는 원래 의도를 명확히 서버에서도
    // 강제한다(관리자의 강제 초기화는 별도 password-reset 라우트가 담당).
    if (session!.userId !== id) {
      return NextResponse.json({ success: false, error: "본인 계정의 비밀번호만 변경할 수 있습니다." }, { status: 403 });
    }

    const { currentPassword, newPassword } = await request.json();

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ success: false, error: "현재 비밀번호와 새 비밀번호를 모두 입력해주세요." }, { status: 400 });
    }
    if (newPassword.length < 6) {
      return NextResponse.json({ success: false, error: "새 비밀번호는 최소 6자리 이상이어야 합니다." }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return NextResponse.json({ success: false, error: "사용자를 찾을 수 없습니다." }, { status: 404 });
    }
    const ok = await verifyPassword(currentPassword, user.password);
    if (!ok) {
      return NextResponse.json({ success: false, error: "현재 비밀번호가 일치하지 않습니다." }, { status: 401 });
    }

    // 비밀번호 변경이 성공했으므로(=더 이상 초기/임시 비밀번호가 아니므로) mustChangePassword를 해제한다.
    await prisma.user.update({
      where: { id },
      data: { password: await hashPassword(newPassword), mustChangePassword: false },
    });

    return NextResponse.json({ success: true, message: "비밀번호가 변경되었습니다." });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: "비밀번호 변경 실패" }, { status: 500 });
  }
}
