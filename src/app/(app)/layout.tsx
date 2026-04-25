import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db/prisma'
import Sidebar from '@/components/layout/sidebar'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const demandeCount = session.user.restaurantId
    ? await prisma.demande.count({
        where: { restaurantId: session.user.restaurantId, statut: { in: ['NOUVELLE', 'EN_COURS', 'ATTENTE_CLIENT'] } },
      })
    : 0

  const nom = session.user.nom ?? session.user.name ?? 'Utilisateur'
  const role = session.user.role ?? 'Responsable'
  const initials = nom
    .split(' ')
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar
        restaurantNom="Le Robin"
        userName={nom}
        userInitials={initials}
        userRole={role}
        demandeCount={demandeCount}
      />
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        {children}
      </main>
    </div>
  )
}
