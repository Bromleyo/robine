import { prisma } from '@/lib/db/prisma'
import ReservationForm from '@/components/reservation/reservation-form'

export default async function ReservationPage() {
  const restaurant = await prisma.restaurant.findFirst({
    select: { id: true, nom: true },
  })

  if (!restaurant) {
    return (
      <div style={{
        minHeight: '100vh', display: 'grid', placeItems: 'center',
        background: '#FAF8F5',
      }}>
        <p style={{ color: '#9CA3AF', fontSize: 14 }}>Service temporairement indisponible.</p>
      </div>
    )
  }

  return <ReservationForm restaurantId={restaurant.id} restaurantNom={restaurant.nom} />
}
