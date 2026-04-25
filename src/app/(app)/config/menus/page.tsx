import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db/prisma'
import Topbar from '@/components/layout/topbar'
import MenusClient from '@/components/config/menus-client'

export default async function MenusPage() {
  const session = await auth()
  if (!session?.user?.restaurantId) redirect('/login')

  const menus = await prisma.menu.findMany({
    where: { restaurantId: session.user.restaurantId },
    orderBy: [{ ordre: 'asc' }, { nom: 'asc' }],
  })

  return (
    <>
      <Topbar title="Menus" subtitle={`${menus.length} menu${menus.length > 1 ? 's' : ''}`} />
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px', maxWidth: 720 }}>
        <MenusClient menus={menus} />
      </div>
    </>
  )
}
