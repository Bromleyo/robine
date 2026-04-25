import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { fetchContactsList } from '@/lib/db/contacts'
import Topbar from '@/components/layout/topbar'
import ContactsClient from '@/components/contacts/contacts-client'

export default async function ContactsPage() {
  const session = await auth()
  if (!session?.user?.restaurantId) redirect('/login')

  const contacts = await fetchContactsList(session.user.restaurantId)

  return (
    <>
      <Topbar
        title="Contacts"
        subtitle={`${contacts.length} contact${contacts.length > 1 ? 's' : ''}`}
      />
      <ContactsClient contacts={contacts} />
    </>
  )
}
