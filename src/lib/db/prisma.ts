import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

// ─── Soft delete extension ───────────────────────────────────────────────────
// Filtre automatiquement deletedAt=null sur les reads du modèle Demande, sauf
// si le caller a explicitement spécifié un filtre sur deletedAt (top-level).

function hasDeletedAtFilter(where: unknown): boolean {
  if (!where || typeof where !== 'object') return false
  return 'deletedAt' in (where as Record<string, unknown>)
}

function withSoftDeleteFilter<T extends { where?: unknown } | undefined>(args: T): T {
  if (!args) return { where: { deletedAt: null } } as T
  if (hasDeletedAtFilter((args as { where?: unknown }).where)) return args
  return {
    ...args,
    where: { ...((args as { where?: object }).where ?? {}), deletedAt: null },
  } as T
}

function applySoftDeleteExtension(client: PrismaClient) {
  return client.$extends({
    name: 'soft-delete-demande',
    query: {
      demande: {
        async findMany({ args, query }) { return query(withSoftDeleteFilter(args)) },
        async findFirst({ args, query }) { return query(withSoftDeleteFilter(args)) },
        async findFirstOrThrow({ args, query }) { return query(withSoftDeleteFilter(args)) },
        async findUnique({ args, query }) { return query(withSoftDeleteFilter(args)) },
        async findUniqueOrThrow({ args, query }) { return query(withSoftDeleteFilter(args)) },
        async count({ args, query }) { return query(withSoftDeleteFilter(args)) },
        async aggregate({ args, query }) { return query(withSoftDeleteFilter(args)) },
        async groupBy({ args, query }) { return query(withSoftDeleteFilter(args)) },
      },
    },
  })
}

function createPrismaClient() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const adapter = new PrismaPg(pool)
  const base = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })
  return applySoftDeleteExtension(base)
}

type ExtendedPrisma = ReturnType<typeof createPrismaClient>
const globalForPrisma = globalThis as unknown as { prisma?: ExtendedPrisma }

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

/**
 * Exécute fn dans une transaction avec le contexte tenant posé via SET LOCAL.
 * Toutes les queries dans fn bénéficient du RLS automatiquement.
 */
export async function tenantDb<T>(
  restaurantId: string,
  fn: (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL app.current_restaurant = ${restaurantId}`
    return fn(tx)
  })
}
