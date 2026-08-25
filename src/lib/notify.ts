import { prisma } from "@/lib/prisma";

type NotifyOptions = { type?: "info" | "success" | "warning" | "error"; link?: string };

// 특정 사용자 한 명에게 알림을 남긴다 (예: 배분 승인/반려 결과를 담당자에게).
export async function notifyUser(userId: string, message: string, options: NotifyOptions = {}) {
  await prisma.notification.create({
    data: { userId, message, type: options.type ?? "info", link: options.link ?? null },
  });
}

// PM 전원에게 알림을 남긴다 (예: 배분승인대기 발생, 문서 검토요청 — 문서에는 작성자 필드가 없어
// "요청한 사람"이 아니라 "승인 권한이 있는 모두"에게 보내는 게 이 스키마에서 낼 수 있는 최선이다).
export async function notifyAllPMs(message: string, options: NotifyOptions = {}) {
  const pms = await prisma.user.findMany({ where: { role: "PM" }, select: { id: true } });
  if (pms.length === 0) return;
  await prisma.notification.createMany({
    data: pms.map((pm) => ({ userId: pm.id, message, type: options.type ?? "info", link: options.link ?? null })),
  });
}
