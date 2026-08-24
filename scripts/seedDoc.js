const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function main() {
  const project = await prisma.project.findFirst({
    where: { name: 'HeyZzabi V2 리뉴얼' }
  });

  if (project) {
    await prisma.projectDocument.create({
      data: {
        projectId: project.id,
        title: '대시보드 개편 회의 (8/19)',
        rawContent: '오늘 회의에서는 대시보드 화면을 새롭게 개편하는 것에 대해 이야기했습니다. 기존처럼 단순히 리스트업만 하는 것이 아니라, 시각적으로 프로젝트의 건강 상태나 파이프라인 진행률을 한눈에 볼 수 있도록 위젯들을 추가하기로 했습니다. 유저가 원하는 위젯을 커스텀할 수 있으면 좋겠다는 아이디어도 나왔습니다.'
      }
    });
    console.log("Document seeded!");
  }
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect())
