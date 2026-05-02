import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db/prisma'
import Topbar from '@/components/layout/topbar'
import ReglesIAClient from '@/components/config/regles-ia-client'

export default async function ReglesIAPage() {
  const session = await auth()
  if (!session?.user?.restaurantId) redirect('/login')

  const [row, espaces] = await Promise.all([
    prisma.regleIA.findUnique({
      where: { restaurantId: session.user.restaurantId },
      select: { config: true },
    }),
    prisma.espace.findMany({
      where: { restaurantId: session.user.restaurantId, actif: true },
      orderBy: { ordre: 'asc' },
      select: { id: true, nom: true, capaciteMax: true },
    }),
  ])

  return (
    <>
      <Topbar title="Règles IA" subtitle="Paramètres du moteur de réponse automatique" />
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px', maxWidth: 860 }}>
        <ReglesIAClient config={(row?.config ?? {}) as Record<string, unknown>} espaces={espaces} />
      </div>
    </>
  )
}
