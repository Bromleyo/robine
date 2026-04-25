'use client'

interface PrintTicketProps {
  restaurantNom: string
  restaurantAdresse?: string | null
  reference: string
  typeEvenement?: string | null
  dateEvenement?: string | null
  heureDebut?: string | null
  heureFin?: string | null
  nbInvites?: number | null
  espacenom?: string | null
  contactNom: string
  contactTelephone?: string | null
  contactEmail: string
  contactSociete?: string | null
  contraintesAlimentaires: string[]
  notes?: string | null
  assigneeNom?: string | null
}

export default function PrintTicketButton(props: PrintTicketProps) {
  function handlePrint() {
    const {
      restaurantNom, restaurantAdresse,
      reference, typeEvenement, dateEvenement,
      heureDebut, heureFin, nbInvites,
      espacenom, contactNom, contactTelephone,
      contactEmail, contactSociete,
      contraintesAlimentaires, notes, assigneeNom,
    } = props

    const now = new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }).format(new Date())

    const contraintesHtml = contraintesAlimentaires.length > 0
      ? `<div class="highlight"><ul>${contraintesAlimentaires.map(c => `<li>${c}</li>`).join('')}</ul></div>`
      : '<div class="sm muted">Aucune contrainte</div>'

    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Ticket – ${reference}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Courier New', Courier, monospace;
    font-size: 12pt;
    width: 72mm;
    margin: 0 auto;
    padding: 4mm 0;
    color: #000;
  }
  .center { text-align: center; }
  .sep { border: none; border-top: 1px dashed #000; margin: 5px 0; }
  .sep-solid { border: none; border-top: 2px solid #000; margin: 5px 0; }
  .bold { font-weight: bold; }
  .xl { font-size: 18pt; font-weight: bold; letter-spacing: 1px; }
  .lg { font-size: 14pt; font-weight: bold; }
  .sm { font-size: 10pt; }
  .muted { color: #666; }
  .label { font-size: 9pt; text-transform: uppercase; letter-spacing: 0.08em; color: #555; margin-bottom: 2px; }
  .section { margin: 4px 0; }
  .highlight { border: 2px solid #000; padding: 4px 6px; margin: 3px 0; font-weight: bold; }
  ul { list-style: none; padding: 0; }
  ul li::before { content: "» "; }
  .footer { font-size: 9pt; color: #888; text-align: center; margin-top: 6px; }
  @media print {
    body { margin: 0; padding: 2mm 0; }
    @page { margin: 0; size: 80mm auto; }
  }
</style>
</head>
<body>

<div class="center">
  <div class="lg">${restaurantNom.toUpperCase()}</div>
  ${restaurantAdresse ? `<div class="sm">${restaurantAdresse}</div>` : ''}
</div>

<hr class="sep-solid">

<div class="center">
  <div class="label">Ticket cuisine · CONFIRMÉ</div>
  <div class="xl">${reference}</div>
</div>

<hr class="sep">

<div class="section">
  <div class="label">Événement</div>
  ${typeEvenement ? `<div class="bold lg">${typeEvenement}</div>` : ''}
  ${dateEvenement ? `<div class="bold">${dateEvenement}</div>` : ''}
  ${heureDebut ? `<div>${heureDebut}${heureFin ? ` – ${heureFin}` : ''}</div>` : ''}
</div>

${nbInvites ? `
<hr class="sep">
<div class="section center">
  <div class="label">Nombre d'invités</div>
  <div class="xl">${nbInvites}</div>
</div>
` : ''}

${espacenom ? `
<hr class="sep">
<div class="section">
  <div class="label">Espace</div>
  <div class="bold">${espacenom}</div>
</div>
` : ''}

<hr class="sep">

<div class="section">
  <div class="label">Contact</div>
  <div class="bold">${contactNom}</div>
  ${contactSociete ? `<div>${contactSociete}</div>` : ''}
  ${contactTelephone ? `<div>${contactTelephone}</div>` : ''}
  <div class="sm muted">${contactEmail}</div>
</div>

<hr class="sep-solid">

<div class="section">
  <div class="label">Contraintes alimentaires</div>
  ${contraintesHtml}
</div>

${notes ? `
<hr class="sep">
<div class="section">
  <div class="label">Notes internes</div>
  <div>${notes.replace(/\n/g, '<br>')}</div>
</div>
` : ''}

${assigneeNom ? `
<hr class="sep">
<div class="section">
  <div class="label">Responsable</div>
  <div>${assigneeNom}</div>
</div>
` : ''}

<hr class="sep-solid">
<div class="footer">Imprimé le ${now}</div>

</body>
</html>`

    const win = window.open('', '_blank', 'width=400,height=600')
    if (!win) return
    win.document.write(html)
    win.document.close()
    win.focus()
    win.print()
    win.addEventListener('afterprint', () => win.close())
  }

  return (
    <button
      onClick={handlePrint}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        fontSize: 12.5, fontWeight: 500, color: 'var(--ink-600)',
        padding: '5px 10px', borderRadius: 'var(--r-sm)',
        border: '1px solid var(--border)', cursor: 'pointer',
        background: 'var(--surface)',
      }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="6 9 6 2 18 2 18 9"/>
        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
        <rect x="6" y="14" width="12" height="8"/>
      </svg>
      Ticket cuisine
    </button>
  )
}
