import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding data...')
  
  // Create 4 Employees
  const users = [
    { email: 'frontend@heyzzabi.com', name: '김프론', department: '개발팀', role: 'EMPLOYEE', techStack: 'React, Next.js' },
    { email: 'backend@heyzzabi.com', name: '이백엔', department: '개발팀', role: 'EMPLOYEE', techStack: 'Node.js, Prisma' },
    { email: 'design@heyzzabi.com', name: '박디쟌', department: '디자인팀', role: 'EMPLOYEE', techStack: 'Figma' },
    { email: 'pm@heyzzabi.com', name: '최피엠', department: '기획팀', role: 'MANAGER', techStack: 'Notion, Jira' }
  ];

  const createdUsers = [];
  for (const u of users) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        email: u.email,
        name: u.name,
        password: 'password123!', // Hashing skipped for seed dummy data
        role: u.role,
        department: u.department,
        techStack: u.techStack
      }
    });
    createdUsers.push(user);
  }

  // Create 1 Project
  const project = await prisma.project.create({
    data: {
      name: 'HeyZzabi V2 리뉴얼',
      description: 'AI 기반 사내 프로젝트 관리 시스템 고도화 및 UI 전면 개편',
      startDate: new Date(),
      endDate: new Date(new Date().setMonth(new Date().getMonth() + 2)),
    }
  });

  // Create Tasks assigned to users
  await prisma.task.createMany({
    data: [
      {
        title: '메인 대시보드 UI 구현',
        description: '새로운 디자인 시스템을 적용하여 대시보드 컴포넌트 개발',
        status: 'IN_PROGRESS',
        difficulty: 'MEDIUM',
        progress: 45,
        projectId: project.id,
        assigneeId: createdUsers[0].id // 김프론
      },
      {
        title: 'OpenAI 기반 챗봇 API 연동',
        description: '사내 데이터를 조회하여 응답하는 폐쇄형 AI 챗봇 백엔드 구현',
        status: 'DONE',
        difficulty: 'HIGH',
        progress: 100,
        projectId: project.id,
        assigneeId: createdUsers[1].id // 이백엔
      },
      {
        title: '칸반 보드 디자인 시안 확정',
        description: 'Drag & Drop 및 담당자 할당 UI 시안',
        status: 'PENDING_APPROVAL',
        difficulty: 'LOW',
        progress: 90,
        projectId: project.id,
        assigneeId: createdUsers[2].id // 박디쟌
      },
      {
        title: 'V2 배포 일정 및 마일스톤 기획',
        description: '전체 일정 조율 및 각 팀별 WBS 취합',
        status: 'TODO',
        difficulty: 'MEDIUM',
        progress: 0,
        projectId: project.id,
        assigneeId: createdUsers[3].id // 최피엠
      }
    ]
  });

  console.log('Seeding completed!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
