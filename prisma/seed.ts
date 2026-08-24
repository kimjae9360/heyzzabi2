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
