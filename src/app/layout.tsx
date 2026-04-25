import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Robin — Gestion des groupes',
  description: 'Gérez vos demandes de groupes et événements',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  )
}
