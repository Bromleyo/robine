import { auth } from '@/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'

const EVENT_LABEL: Record<string, string> = {
  MARIAGE: 'Mariage', DINER_ENTREPRISE: "Dîner d'entreprise",
  ANNIVERSAIRE: 'Anniversaire', SEMINAIRE: 'Séminaire',
  PRIVATISATION: 'Privatisation', BAPTEME: 'Baptême',
  COCKTAIL: 'Cocktail', AUTRE: 'Autre',
}

function fmtDate(d: Date | null) {
  if (!d) return '—'
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d)
}

function fmtMoney(cents: number | null) {
  if (cents == null) return '—'
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(cents / 100)
}

function esc(s: string | null | undefined): string {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function row(label: string, value: string) {
  return `<tr><td>${label}</td><td>${value}</td></tr>`
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user?.restaurantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const restaurantId = session.user.restaurantId

  const { id } = await params

  const [demande, restaurant] = await Promise.all([
    prisma.demande.findFirst({
      where: { id, restaurantId },
      include: {
        contact: true,
        espace: { select: { nom: true } },
        menu: { select: { nom: true, description: true, prixCents: true } },
      },
    }),
    prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { nom: true, adresse: true },
    }),
  ])

  if (!demande) return NextResponse.json({ error: 'Demande introuvable' }, { status: 404 })

  const today = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())

  const prestationSection = demande.menu ? `
  <section>
    <h3>Prestation</h3>
    <table>
      ${row('Menu', esc(demande.menu.nom))}
      ${demande.menu.description ? row('Description', `<span style="color:#555;font-size:13px;">${esc(demande.menu.description)}</span>`) : ''}
      ${row('Prix par personne', fmtMoney(demande.menu.prixCents))}
      ${demande.nbInvites ? row('Total estimé', fmtMoney(demande.menu.prixCents * demande.nbInvites)) : ''}
    </table>
  </section>` : demande.budgetIndicatifCents ? `
  <section>
    <h3>Budget indicatif</h3>
    <table>${row('Budget', fmtMoney(demande.budgetIndicatifCents))}</table>
  </section>` : ''

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Devis ${demande.reference}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Georgia, 'Times New Roman', serif; color: #1a1a1a; background: #fff; padding: 60px; max-width: 820px; margin: 0 auto; font-size: 14px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 48px; border-bottom: 2px solid #1a1a1a; padding-bottom: 24px; }
    .header h1 { font-size: 24px; font-weight: 400; margin-bottom: 4px; }
    .header p { font-size: 12px; color: #666; }
    .ref-block { text-align: right; }
    .ref-block .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #888; font-family: -apple-system, sans-serif; }
    .ref-block .num { font-size: 22px; font-weight: 600; margin: 4px 0; }
    .ref-block .date { font-size: 12px; color: #888; font-family: -apple-system, sans-serif; }
    section { margin-bottom: 32px; }
    section h3 { font-size: 10px; text-transform: uppercase; letter-spacing: 0.12em; color: #888; font-family: -apple-system, sans-serif; font-weight: 600; margin-bottom: 12px; padding-bottom: 6px; border-bottom: 1px solid #e8e8e8; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 7px 0; vertical-align: top; border-bottom: 1px solid #f4f4f4; line-height: 1.5; }
    td:first-child { width: 38%; color: #666; font-family: -apple-system, sans-serif; font-size: 13px; }
    .footer { margin-top: 56px; padding-top: 20px; border-top: 1px solid #e8e8e8; font-size: 11.5px; color: #aaa; font-family: -apple-system, sans-serif; line-height: 1.6; }
    @media print { body { padding: 0; } @page { margin: 18mm 22mm; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>${esc(restaurant?.nom ?? 'Restaurant')}</h1>
      ${restaurant?.adresse ? `<p>${esc(restaurant.adresse)}</p>` : ''}
    </div>
    <div class="ref-block">
      <div class="label">Devis</div>
      <div class="num">${demande.reference}</div>
      <div class="date">Établi le ${today}</div>
    </div>
  </div>

  <section>
    <h3>Client</h3>
    <table>
      ${row('Nom', esc(demande.contact.nom))}
      ${row('Email', esc(demande.contact.email))}
      ${demande.contact.telephone ? row('Téléphone', esc(demande.contact.telephone)) : ''}
      ${demande.contact.societe ? row('Société', esc(demande.contact.societe)) : ''}
    </table>
  </section>

  <section>
    <h3>Événement</h3>
    <table>
      ${demande.typeEvenement ? row('Type', esc(EVENT_LABEL[demande.typeEvenement] ?? demande.typeEvenement)) : ''}
      ${row('Date', fmtDate(demande.dateEvenement))}
      ${demande.heureDebut ? row('Horaire', `${esc(demande.heureDebut)}${demande.heureFin ? ` – ${esc(demande.heureFin)}` : ''}`) : ''}
      ${demande.nbInvites ? row("Nombre d'invités", `${demande.nbInvites} personnes`) : ''}
      ${demande.espace ? row('Espace', esc(demande.espace.nom)) : ''}
      ${demande.contraintesAlimentaires.length > 0 ? row('Contraintes alimentaires', esc(demande.contraintesAlimentaires.join(', '))) : ''}
    </table>
  </section>

  ${prestationSection}

  <div class="footer">
    Ce devis est établi à titre indicatif et ne constitue pas un contrat. Il est valable 30 jours à compter de sa date d'émission.
  </div>

  <script>window.addEventListener('load', () => window.print())</script>
</body>
</html>`

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
