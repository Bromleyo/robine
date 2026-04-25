import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db/prisma'
import Topbar from '@/components/layout/topbar'
import TemplatesClient from '@/components/config/templates-client'

export default async function TemplatesPage() {
  const session = await auth()
  if (!session?.user?.restaurantId) redirect('/login')

  const templates = await prisma.templateMessage.findMany({
    where: { restaurantId: session.user.restaurantId },
    orderBy: [{ ordre: 'asc' }, { nom: 'asc' }],
  })

  return (
    <>
      <Topbar title="Modèles de messages" subtitle={`${templates.length} modèle${templates.length > 1 ? 's' : ''}`} />
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px', maxWidth: 780 }}>
        <TemplatesClient templates={templates} />
      </div>
    </>
  )
}
