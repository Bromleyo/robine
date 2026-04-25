import { Suspense } from 'react'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import Topbar from '@/components/layout/topbar'
import MailboxesClient from '@/components/config/mailboxes-client'

export default async function MailboxesPage() {
  const session = await auth()
  if (!session?.user?.restaurantId) redirect('/login')

  return (
    <>
      <Topbar
        title="Boîtes mail"
        subtitle="Boîtes mail connectées à Robin"
        primaryLabel="Nouvelle demande"
        primaryHref="/demandes/new"
      />
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <Suspense>
          <MailboxesClient />
        </Suspense>
      </div>
    </>
  )
}
