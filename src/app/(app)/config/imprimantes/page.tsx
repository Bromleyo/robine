import { Suspense } from 'react'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import Topbar from '@/components/layout/topbar'
import ImprimantesClient from '@/components/config/imprimantes-client'

export default async function ImprimantesPage() {
  const session = await auth()
  if (!session?.user?.restaurantId) redirect('/login')

  return (
    <>
      <Topbar title="Imprimantes" subtitle="Imprimantes tickets cuisine" />
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <Suspense>
          <ImprimantesClient />
        </Suspense>
      </div>
    </>
  )
}
