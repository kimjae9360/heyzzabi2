import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Clear existing users
  await prisma.user.deleteMany()

  // PM Account
  await prisma.user.create({
    data: {
      email: 'pm@heyzzabi.com',
      password: 'admin', // in real app, this should be hashed
      name: '김피엠',
      role: 'PM',
      mustChangePassword: false,
    },
  })

  // Newbie Account
  await prisma.user.create({
    data: {
      email: 'newbie@heyzzabi.com',
      password: 'temp',
      name: '',
      role: 'EMPLOYEE', // matching schema's default
      mustChangePassword: true,
    },
  })

  // Team member accounts — 실제 배정 테스트가 가능하도록 techStack/pastProjects를 채워둠
  await prisma.user.create({
    data: {
      email: 'frontend@heyzzabi.com',
      password: 'temp1234',
      name: '김프론',
      role: 'EMPLOYEE',
      status: 'ACTIVE',
      mustChangePassword: false,
      department: '개발팀',
      jobTitle: '프론트엔드 개발자',
      techStack: 'React,Next.js,TypeScript,Tailwind CSS',
      certifications: '정보처리기사',
      pastProjects: '사내 대시보드 리뉴얼,모바일 반응형 개편',
    },
  })
  await prisma.user.create({
    data: {
      email: 'backend@heyzzabi.com',
      password: 'temp1234',
      name: '이백엔',
      role: 'EMPLOYEE',
      status: 'ACTIVE',
      mustChangePassword: false,
      department: '개발팀',
      jobTitle: '백엔드 개발자',
      techStack: 'Node.js,Prisma,PostgreSQL,AWS',
      certifications: 'AWS Solutions Architect Associate',
      pastProjects: '결제 시스템 연동,API 서버 마이그레이션',
    },
  })
  await prisma.user.create({
    data: {
      email: 'design@heyzzabi.com',
      password: 'temp1234',
      name: '박디쟌',
      role: 'EMPLOYEE',
      status: 'ACTIVE',
      mustChangePassword: false,
      department: '디자인팀',
      jobTitle: 'UI/UX 디자이너',
      techStack: 'Figma,UI/UX,디자인시스템',
      pastProjects: '브랜드 리뉴얼,모바일 앱 UX 개선',
    },
  })

  console.log('Database seeded!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
