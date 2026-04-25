import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db/prisma'
import Topbar from '@/components/layout/topbar'
import RestaurantForm from '@/components/config/restaurant-form'

export default async function RestaurantPage() {
  const session = await auth()
  if (!session?.user?.restaurantId) redirect('/login')

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: session.user.restaurantId },
    select: { nom: true, adresse: true, emailGroupes: true, timezone: true },
  })
  if (!restaurant) redirect('/login')

  return (
    <>
      <Topbar title="Paramètres" subtitle={restaurant.nom} />
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
        <RestaurantForm initial={restaurant} />
      </div>
    </>
  )
}
