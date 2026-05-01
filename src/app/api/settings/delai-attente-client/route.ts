import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/auth'
import { prisma } from '@/lib/db/prisma'
import { requireRole } from '@/lib/auth/require-role'

// PR6 — Endpoint dédié pour modifier UNIQUEMENT le champ
// `delaiAttenteClientJours` dans RegleIA.config sans toucher au reste du JSON.

const Schema = z.object({
  delaiJours: z.number().int().min(1).max(90),
})

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.restaurantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const forbidden = requireRole(session.user.role, 'RESPONSABLE')
  if (forbidden) return forbidden

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON invalide' }, { status: 400 }) }
  const parsed = Schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Données invalides', details: parsed.error.flatten() }, { status: 400 })
  }

  const restaurantId = session.user.restaurantId
  const row = await prisma.regleIA.findUnique({
    where: { restaurantId },
    select: { config: true },
  })
  const existing = (row?.config ?? {}) as Record<string, unknown>
  const merged = { ...existing, delaiAttenteClientJours: parsed.data.delaiJours }

  await prisma.regleIA.upsert({
    where: { restaurantId },
    create: { restaurantId, config: merged },
    update: { config: merged },
  })

  return NextResponse.json({ ok: true, delaiJours: parsed.data.delaiJours })
}
