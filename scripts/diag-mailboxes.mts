import { prisma } from '../src/lib/db/prisma'

const mailboxes = await prisma.outlookMailbox.findMany({
  select: { id: true, email: true, actif: true, subscriptionId: true, subscriptionExpiry: true, restaurantId: true }
})
console.log(JSON.stringify(mailboxes, null, 2))
await prisma.$disconnect()
