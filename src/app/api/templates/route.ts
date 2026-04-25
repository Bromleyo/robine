import { auth } from '@/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireRole } from '@/lib/auth/require-role'

export async function GET() {
  const session = await auth()
  if (!session?.user?.restaurantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const templates = await prisma.templateMessage.findMany({
    where: { restaurantId: session.user.restaurantId },
    orderBy: [{ ordre: 'asc' }, { nom: 'asc' }],
  })
  return NextResponse.json(templates)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.restaurantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const forbidden = requireRole(session.user.role, 'RESPONSABLE')
  if (forbidden) return forbidden

  const body = await req.json() as { nom?: string; objectif?: string; subjectTemplate?: string; bodyTemplate?: string }
  if (!body.nom || !body.objectif || !body.bodyTemplate) {
    return NextResponse.json({ error: 'nom, objectif et bodyTemplate requis' }, { status: 400 })
  }

  const template = await prisma.templateMessage.create({
    data: {
      restaurantId: session.user.restaurantId,
      nom: body.nom.trim(),
      objectif: body.objectif as never,
      subjectTemplate: body.subjectTemplate?.trim() ?? '',
      bodyTemplate: body.bodyTemplate.trim(),
    },
  })
  return NextResponse.json(template, { status: 201 })
}
