import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth/require-role'
import Topbar from '@/components/layout/topbar'
import ConversationsClient from '@/components/config/conversations-client'

export default async function ConversationsPage() {
  const session = await auth()
  if (!session?.user?.restaurantId) redirect('/login')
  if (requireRole(session.user.role, 'ADMIN')) redirect('/dashboard')

  return (
    <>
      <Topbar title="Exemples IA" subtitle="Conversations approuvées comme exemples few-shot pour la génération de réponses" />
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px', maxWidth: 1000 }}>
        <ConversationsClient />
      </div>
    </>
  )
}
