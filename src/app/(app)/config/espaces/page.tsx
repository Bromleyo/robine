import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db/prisma'
import Topbar from '@/components/layout/topbar'
import EspacesClient from '@/components/config/espaces-client'

export default async function EspacesPage() {
  const session = await auth()
  if (!session?.user?.restaurantId) redirect('/login')

  const espaces = await prisma.espace.findMany({
    where: { restaurantId: session.user.restaurantId },
    orderBy: [{ ordre: 'asc' }, { nom: 'asc' }],
  })

  return (
    <>
      <Topbar title="Espaces" subtitle={`${espaces.length} espace${espaces.length > 1 ? 's' : ''}`} />
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px', maxWidth: 720 }}>
        <EspacesClient espaces={espaces} />
      </div>
    </>
  )
}
