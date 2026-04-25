import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { calculerUrgenceDemande } from '@/lib/business/urgence'

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')

  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const demandes = await prisma.demande.findMany({
    where: { statut: { in: ['NOUVELLE', 'EN_COURS', 'ATTENTE_CLIENT'] } },
    select: {
      id: true,
      statut: true,
      dateEvenement: true,
      lastMessageAt: true,
      lastMessageDirection: true,
    },
  })

  await Promise.all(
    demandes.map(d => {
      const urgence = calculerUrgenceDemande({
        statut: d.statut,
        dateEvenement: d.dateEvenement,
        now,
        lastMessageAt: d.lastMessageAt,
        lastMessageDirection: d.lastMessageDirection,
      })
      return prisma.demande.update({
        where: { id: d.id },
        data: { urgenceScore: urgence.score, urgenceUpdatedAt: now },
      })
    }),
  )

  return NextResponse.json({ ok: true, updated: demandes.length, at: now.toISOString() })
}
