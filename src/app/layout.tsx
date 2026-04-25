import type { Metadata } from 'next'
import './globals.css'
import Providers from '@/components/providers'

export const metadata: Metadata = {
  title: 'Robin — Gestion des groupes',
  description: 'Gérez vos demandes de groupes et événements',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body><Providers>{children}</Providers></body>
    </html>
  )
}
