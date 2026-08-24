import { PrismaClient } from '@prisma/client'

// PrismaClient 인스턴스를 globalThis에 캐싱해 싱글턴으로 재사용한다.
// 개발 모드에서 Next.js 핫 리로드는 모듈을 계속 다시 실행하는데, 매번 `new PrismaClient()`를 하면
// 그때마다 새 커넥션 풀이 생겨 DB 커넥션이 금방 고갈된다. global 객체는 핫 리로드에도 살아남으므로
// 거기에 붙여두고 있으면 재사용된다. 프로덕션 빌드에서는 모듈이 재실행되지 않으니 global에 안 붙여도 무방.
const globalForPrisma = global as unknown as { prisma: PrismaClient }

export const prisma = globalForPrisma.prisma || new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
