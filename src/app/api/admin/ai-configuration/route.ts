import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db/prisma'
import { requireRole } from '@/lib/auth/require-role'
import { compileAIPrompt } from '@/lib/ai-configuration/compile'

export async function GET() {
  const session = await auth()
  if (!session?.user?.restaurantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const forbidden = requireRole(session.user.role, 'ADMIN')
  if (forbidden) return forbidden

  const restaurantId = session.user.restaurantId

  const [config, espaces, menus] = await Promise.all([
    prisma.aIConfiguration.findUnique({ where: { restaurantId } }),
    prisma.espace.findMany({ where: { restaurantId, actif: true }, orderBy: { ordre: 'asc' } }),
    prisma.menu.findMany({ where: { restaurantId, actif: true }, orderBy: { ordre: 'asc' } }),
  ])

  return NextResponse.json({ config, espaces, menus })
}

export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.restaurantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const forbidden = requireRole(session.user.role, 'ADMIN')
  if (forbidden) return forbidden

  const restaurantId = session.user.restaurantId
  const body = await req.json() as Record<string, unknown>

  const allowedFields = ['supplements', 'acompte', 'cancellationConditions', 'styleRules', 'styleMetadata', 'customRules', 'setupCompleted', 'wizardStep', 'seuilsCA', 'margeMarchandise']
  const data: Record<string, unknown> = {}
  for (const field of allowedFields) {
    if (field in body) data[field] = body[field]
  }

  await prisma.aIConfiguration.upsert({
    where: { restaurantId },
    update: data,
    create: { restaurantId, ...data },
  })

  const compiledPrompt = await compileAIPrompt(restaurantId)
  const updated = await prisma.aIConfiguration.update({
    where: { restaurantId },
    data: { compiledPrompt },
  })

  return NextResponse.json(updated)
}

export async function DELETE() {
  const session = await auth()
  if (!session?.user?.restaurantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const forbidden = requireRole(session.user.role, 'ADMIN')
  if (forbidden) return forbidden

  const restaurantId = session.user.restaurantId

  await prisma.aIConfiguration.upsert({
    where: { restaurantId },
    update: {
      supplements: {},
      acompte: {},
      cancellationConditions: null,
      styleRules: null,
      styleMetadata: {},
      customRules: null,
      compiledPrompt: null,
      setupCompleted: false,
      wizardStep: 1,
    },
    create: { restaurantId },
  })

  return NextResponse.json({ ok: true })
}
