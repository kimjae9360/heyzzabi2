import bcrypt from "bcryptjs";

const BCRYPT_PREFIX_RE = /^\$2[aby]\$/;

// bcrypt 해시는 항상 $2a$/$2b$/$2y$로 시작한다 — 이 형식이 아니면 아직 평문으로 저장된
// 레거시 계정(마이그레이션 전)이라고 판단한다.
export function isHashed(password: string): boolean {
  return BCRYPT_PREFIX_RE.test(password);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

// 레거시 평문 계정과 새 해시 계정을 모두 지원한다 — 로그인 라우트가 평문 계정의 로그인
// 성공 시 즉시 해시로 재저장(마이그레이션)하므로, 이 이중 분기는 과도기에만 쓰이고
// 시간이 지나면 자연히 모든 계정이 해시로 수렴한다.
export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  if (isHashed(stored)) return bcrypt.compare(plain, stored);
  return plain === stored;
}
