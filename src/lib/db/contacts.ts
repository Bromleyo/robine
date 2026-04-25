import { prisma } from '@/lib/db/prisma'

export async function fetchContactsList(restaurantId: string) {
  return prisma.contact.findMany({
    where: { restaurantId },
    orderBy: [{ nbDemandesTotal: 'desc' }, { nom: 'asc' }],
  })
}

export async function fetchContactDetail(restaurantId: string, id: string) {
  return prisma.contact.findFirst({
    where: { id, restaurantId },
    include: {
      demandes: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          reference: true,
          statut: true,
          typeEvenement: true,
          dateEvenement: true,
          nbInvites: true,
          createdAt: true,
        },
      },
    },
  })
}
