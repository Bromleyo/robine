import { prisma as defaultPrisma } from '@/lib/db/prisma'

export function extractEmailDomain(email: string | null | undefined): string | null {
  if (!email) return null
  const at = email.lastIndexOf('@')
  if (at < 0 || at === email.length - 1) return null
  const domain = email.slice(at + 1).trim().toLowerCase()
  return domain || null
}

type RestaurantLite = { id: string; nom: string }

type FindRestaurantArgs = {
  where: { allowedDomains: { has: string } }
  select: { id: true; nom: true }
}

type UpsertMembershipArgs = {
  where: { userId_restaurantId: { userId: string; restaurantId: string } }
  update: Record<string, never>
  create: { userId: string; restaurantId: string; role: string }
}

type FindRestaurantDb = {
  restaurant: {
    findFirst: (args: FindRestaurantArgs) => Promise<RestaurantLite | null>
  }
}

type AttachDb = FindRestaurantDb & {
  membership: {
    upsert: (args: UpsertMembershipArgs) => Promise<{
      id: string
      userId: string
      restaurantId: string
      role: string
    }>
  }
}

export async function findRestaurantForEmail(
  email: string,
  db: FindRestaurantDb = defaultPrisma as never,
): Promise<RestaurantLite | null> {
  const domain = extractEmailDomain(email)
  if (!domain) return null
  return db.restaurant.findFirst({
    where: { allowedDomains: { has: domain } },
    select: { id: true, nom: true },
  })
}

export async function attachUserToMatchingRestaurant(args: {
  userId: string
  email: string
  db?: AttachDb
}) {
  const db = args.db ?? (defaultPrisma as never as AttachDb)
  const restaurant = await findRestaurantForEmail(args.email, db)
  if (!restaurant) return null

  const membership = await db.membership.upsert({
    where: { userId_restaurantId: { userId: args.userId, restaurantId: restaurant.id } },
    update: {},
    create: { userId: args.userId, restaurantId: restaurant.id, role: 'RESPONSABLE' },
  })

  return { restaurant, membership }
}
