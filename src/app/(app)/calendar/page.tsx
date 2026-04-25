import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/db/prisma'
import Topbar from '@/components/layout/topbar'

const STATUT_COLOR: Record<string, string> = {
  NOUVELLE: '#6366F1', EN_COURS: '#D97706', ATTENTE_CLIENT: '#DC2626',
  CONFIRMEE: '#059669', ANNULEE: '#9CA3AF', PERDUE: '#9F1239',
}
const EVENT_LABEL: Record<string, string> = {
  MARIAGE: 'Mariage', DINER_ENTREPRISE: "Dîner d'ent.", ANNIVERSAIRE: 'Anniversaire',
  SEMINAIRE: 'Séminaire', PRIVATISATION: 'Privatisation', BAPTEME: 'Baptême',
  COCKTAIL: 'Cocktail', AUTRE: 'Autre',
}
const MONTH_NAMES = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']
const DAY_NAMES = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const session = await auth()
  if (!session?.user?.restaurantId) redirect('/login')

  const { month } = await searchParams
  const now = new Date()
  const [year, mon] = (month
    ? month.split('-').map(Number)
    : [now.getFullYear(), now.getMonth() + 1]) as [number, number]

  const firstDay = new Date(year, mon - 1, 1)
  const lastDay = new Date(year, mon, 0)

  const demandes = await prisma.demande.findMany({
    where: {
      restaurantId: session.user.restaurantId,
      dateEvenement: { gte: firstDay, lte: lastDay },
    },
    include: { contact: { select: { nom: true } } },
    orderBy: { dateEvenement: 'asc' },
  })

  const byDay = new Map<number, typeof demandes>()
  for (const d of demandes) {
    if (!d.dateEvenement) continue
    const day = d.dateEvenement.getDate()
    byDay.set(day, [...(byDay.get(day) ?? []), d])
  }

  const startDow = (firstDay.getDay() + 6) % 7
  const totalDays = lastDay.getDate()
  const cells: (number | null)[] = [
    ...Array(startDow).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const prevMonth = mon === 1 ? `${year - 1}-12` : `${year}-${String(mon - 1).padStart(2, '0')}`
  const nextMonth = mon === 12 ? `${year + 1}-01` : `${year}-${String(mon + 1).padStart(2, '0')}`
  const todayDay = now.getFullYear() === year && now.getMonth() + 1 === mon ? now.getDate() : null

  return (
    <>
      <Topbar
        title="Calendrier"
        subtitle={`${demandes.length} événement${demandes.length > 1 ? 's' : ''} ce mois`}
      />
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href={`/calendar?month=${prevMonth}`} style={{
            padding: '5px 12px', borderRadius: 'var(--r-sm)', fontSize: 13,
            background: 'var(--surface)', border: '1px solid var(--border)',
            color: 'var(--ink-600)', textDecoration: 'none',
          }}>←</Link>
          <span style={{ fontSize: 15, fontWeight: 600, minWidth: 160, textAlign: 'center' }}>
            {MONTH_NAMES[mon - 1]} {year}
          </span>
          <Link href={`/calendar?month=${nextMonth}`} style={{
            padding: '5px 12px', borderRadius: 'var(--r-sm)', fontSize: 13,
            background: 'var(--surface)', border: '1px solid var(--border)',
            color: 'var(--ink-600)', textDecoration: 'none',
          }}>→</Link>
          <Link href="/calendar" style={{
            marginLeft: 8, padding: '5px 12px', borderRadius: 'var(--r-sm)', fontSize: 12,
            background: 'var(--surface-sunken)', border: '1px solid var(--border)',
            color: 'var(--ink-500)', textDecoration: 'none',
          }}>Aujourd&apos;hui</Link>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, background: 'var(--border)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
          {DAY_NAMES.map(d => (
            <div key={d} style={{
              background: 'var(--surface)', padding: '8px 0',
              textAlign: 'center', fontSize: 11, fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--ink-400)',
            }}>{d}</div>
          ))}
          {cells.map((day, i) => {
            const events = day ? (byDay.get(day) ?? []) : []
            const isToday = day === todayDay
            return (
              <div key={i} style={{
                background: isToday ? 'var(--accent-soft)' : 'var(--surface)',
                minHeight: 90, padding: '6px 8px',
                display: 'flex', flexDirection: 'column', gap: 3,
              }}>
                {day && (
                  <span style={{
                    fontSize: 12, fontWeight: isToday ? 700 : 400,
                    color: isToday ? 'var(--accent)' : 'var(--ink-500)',
                    alignSelf: 'flex-end',
                  }}>{day}</span>
                )}
                {events.map(ev => (
                  <Link key={ev.id} href={`/demandes/${ev.id}`} style={{
                    display: 'block', textDecoration: 'none',
                    padding: '2px 6px', borderRadius: 4,
                    background: `${STATUT_COLOR[ev.statut] ?? '#6366F1'}18`,
                    borderLeft: `2px solid ${STATUT_COLOR[ev.statut] ?? '#6366F1'}`,
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: STATUT_COLOR[ev.statut] ?? '#6366F1', lineHeight: 1.2 }}>
                      {ev.contact.nom.split(' ')[0]}
                    </div>
                    {ev.typeEvenement && (
                      <div style={{ fontSize: 10.5, color: 'var(--ink-500)', lineHeight: 1.2 }}>
                        {EVENT_LABEL[ev.typeEvenement] ?? ev.typeEvenement}
                      </div>
                    )}
                  </Link>
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
