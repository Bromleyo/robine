import { prisma } from '@/lib/db/prisma'

type TypeNotification = 'NOUVELLE_DEMANDE' | 'NOUVEAU_MESSAGE' | 'DEMANDE_ASSIGNEE' | 'CONFLIT_DETECTE' | 'DEMANDE_URGENTE'

export async function notifyRestaurant(params: {
  restaurantId: string
  type: TypeNotification
  titre: string
  body?: string
  demandeId?: string
  excludeUserId?: string
}) {
  const memberships = await prisma.membership.findMany({
    where: { restaurantId: params.restaurantId },
    select: { userId: true },
  })

  const userIds = memberships
    .map(m => m.userId)
    .filter(uid => uid !== params.excludeUserId)

  if (userIds.length === 0) return

  await prisma.notification.createMany({
    data: userIds.map(userId => ({
      userId,
      restaurantId: params.restaurantId,
      type: params.type,
      titre: params.titre,
      body: params.body,
      demandeId: params.demandeId,
    })),
    skipDuplicates: true,
  })
}
