import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db/prisma'
import Topbar from '@/components/layout/topbar'
import NewDemandeForm from '@/components/demandes/new-demande-form'

export default async function NewDemandePage() {
  const session = await auth()
  if (!session?.user?.restaurantId) redirect('/login')

  const espaces = await prisma.espace.findMany({
    where: { restaurantId: session.user.restaurantId, actif: true },
    orderBy: [{ ordre: 'asc' }, { nom: 'asc' }],
    select: { id: true, nom: true, capaciteMax: true },
  })

  return (
    <>
      <Topbar title="Nouvelle demande" subtitle="Saisie manuelle" primaryLabel="Toutes les demandes" primaryHref="/demandes" />
      <div style={{ flex: 1, overflowY: 'auto', padding: '28px 40px' }}>
        <NewDemandeForm espaces={espaces} />
      </div>
    </>
  )
}
