import { auth } from '@/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'

const EVENT_LABEL: Record<string, string> = {
  MARIAGE: 'Mariage', DINER_ENTREPRISE: "Dîner d'entreprise",
  ANNIVERSAIRE: 'Anniversaire', SEMINAIRE: 'Séminaire',
  PRIVATISATION: 'Privatisation', BAPTEME: 'Baptême',
  COCKTAIL: 'Cocktail', AUTRE: 'Autre',
}
const STATUT_LABEL: Record<string, string> = {
  NOUVELLE: 'Nouvelle', EN_COURS: 'En cours',
  ATTENTE_CLIENT: 'Attente client', CONFIRMEE: 'Confirmée',
  ANNULEE: 'Annulée', PERDUE: 'Perdue',
}

function escapeCSV(val: string | number | null | undefined): string {
  if (val == null) return ''
  const s = String(val)
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export async function GET(_req: NextRequest) {
  const session = await auth()
  if (!session?.user?.restaurantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const restaurantId = session.user.restaurantId

  const demandes = await prisma.demande.findMany({
    where: { restaurantId },
    include: {
      contact: { select: { nom: true, email: true, societe: true, telephone: true } },
      assignee: { select: { nom: true } },
      espace: { select: { nom: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  const headers = [
    'Référence', 'Contact', 'Email', 'Société', 'Téléphone',
    'Type événement', 'Date événement', 'Heure début', 'Heure fin',
    'Nb invités', 'Espace', 'Statut', 'Assigné', 'Créé le',
  ]

  const rows = demandes.map(d => [
    d.reference,
    d.contact.nom,
    d.contact.email,
    d.contact.societe,
    d.contact.telephone,
    d.typeEvenement ? (EVENT_LABEL[d.typeEvenement] ?? d.typeEvenement) : null,
    d.dateEvenement ? d.dateEvenement.toLocaleDateString('fr-FR') : null,
    d.heureDebut,
    d.heureFin,
    d.nbInvites,
    d.espace?.nom,
    STATUT_LABEL[d.statut] ?? d.statut,
    d.assignee?.nom,
    d.createdAt.toLocaleDateString('fr-FR'),
  ])

  const csv = [
    headers.map(escapeCSV).join(','),
    ...rows.map(r => r.map(escapeCSV).join(',')),
  ].join('\r\n')

  const date = new Date().toISOString().slice(0, 10)
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="demandes-${date}.csv"`,
    },
  })
}
