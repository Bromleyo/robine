import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { fetchDemandeDetail } from '@/lib/db/demandes'
import { prisma } from '@/lib/db/prisma'
import { calculerUrgenceDemande } from '@/lib/business/urgence'
import StatusSelector from '@/components/detail/status-selector'
import ReplyForm from '@/components/detail/reply-form'
import NotesEditor from '@/components/detail/notes-editor'
import AssigneeSelector from '@/components/detail/assignee-selector'
import AttachmentsPanel from '@/components/detail/attachments-panel'
import Icon from '@/components/ui/icon'

const EVENT_LABEL: Record<string, string> = {
  MARIAGE: 'Mariage', DINER_ENTREPRISE: "Dîner d'entreprise",
  ANNIVERSAIRE: 'Anniversaire', SEMINAIRE: 'Séminaire',
  PRIVATISATION: 'Privatisation', BAPTEME: 'Baptême',
  COCKTAIL: 'Cocktail', AUTRE: 'Autre',
}

function formatDate(d: Date) {
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(d)
}

function formatDateTime(d: Date | null | undefined) {
  if (!d) return null
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(d)
}

function formatBudget(cents: number) {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
  }).format(cents / 100)
}

function initials(nom: string) {
  return nom.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase',
      letterSpacing: '0.08em', color: 'var(--ink-400)', marginBottom: 8,
    }}>{children}</div>
  )
}

function MetaRow({ icon, children }: { icon: React.ComponentProps<typeof Icon>['name']; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 13, color: 'var(--ink-700)' }}>
      <span style={{ color: 'var(--ink-400)', marginTop: 1, flexShrink: 0 }}>
        <Icon name={icon} size={14} />
      </span>
      <span style={{ lineHeight: 1.45 }}>{children}</span>
    </div>
  )
}

export default async function DemandePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.restaurantId) redirect('/login')

  const { id } = await params
  const restaurantId = session.user.restaurantId
  const [demande, templates] = await Promise.all([
    fetchDemandeDetail(restaurantId, id),
    prisma.templateMessage.findMany({
      where: { restaurantId, actif: true },
      orderBy: [{ ordre: 'asc' }, { nom: 'asc' }],
      select: { id: true, nom: true, bodyTemplate: true },
    }),
  ])
  if (!demande) notFound()

  const context: Record<string, string> = {
    'contact.nom': demande.contact.nom,
    'contact.prenom': demande.contact.nom.split(' ')[0] ?? demande.contact.nom,
    'contact.email': demande.contact.email,
    'contact.societe': demande.contact.societe ?? '',
    'demande.reference': demande.reference,
    'demande.typeEvenement': demande.typeEvenement ? (EVENT_LABEL[demande.typeEvenement] ?? demande.typeEvenement) : '',
    'demande.nbInvites': demande.nbInvites ? String(demande.nbInvites) : '',
    'demande.dateEvenement': demande.dateEvenement ? formatDate(demande.dateEvenement) : '',
    'demande.heureDebut': demande.heureDebut ?? '',
    'demande.heureFin': demande.heureFin ?? '',
  }

  const urgence = calculerUrgenceDemande({
    statut: demande.statut,
    dateEvenement: demande.dateEvenement,
    now: new Date(),
    lastMessageAt: demande.lastMessageAt,
    lastMessageDirection: demande.lastMessageDirection,
  })

  const allMessages = demande.threads.flatMap(t => t.messages)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Topbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '0 24px', height: 56, flexShrink: 0,
        background: 'var(--surface)', borderBottom: '1px solid var(--border)',
      }}>
        <Link href="/demandes" style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          color: 'var(--ink-500)', fontSize: 13, textDecoration: 'none',
          padding: '4px 8px', borderRadius: 'var(--r-sm)',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
          Demandes
        </Link>

        <span style={{ color: 'var(--border-strong)', fontSize: 16 }}>/</span>

        <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink-900)' }}>
          {demande.reference}
        </span>

        {demande.contact.nom && (
          <span style={{ fontSize: 13, color: 'var(--ink-500)' }}>· {demande.contact.nom}</span>
        )}

        {demande.conflitDetecte && !demande.conflitOverride && (
          <span style={{
            fontSize: 11, fontWeight: 600, color: '#fff',
            background: '#DC2626', borderRadius: 4, padding: '2px 7px',
          }}>Conflit</span>
        )}

        {urgence.level === 'hot' && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 11.5, fontWeight: 600, color: 'var(--accent)',
          }}>
            <Icon name="bolt" size={12} /> Urgent
          </span>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <a
            href={`/api/demandes/${demande.id}/devis`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontSize: 12.5, fontWeight: 500, color: 'var(--ink-600)',
              padding: '5px 10px', borderRadius: 'var(--r-sm)',
              border: '1px solid var(--border)', textDecoration: 'none',
              background: 'var(--surface)',
            }}
          >
            <Icon name="file" size={13} />
            Devis PDF
          </a>
          <StatusSelector demandeId={demande.id} currentStatut={demande.statut} />
        </div>
      </div>

      {/* Body */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* Left panel */}
        <div style={{
          width: 300, flexShrink: 0,
          borderRight: '1px solid var(--border)',
          overflowY: 'auto', padding: '20px 18px 32px',
          display: 'flex', flexDirection: 'column', gap: 22,
        }}>

          {/* Contact */}
          <div>
            <SectionLabel>Contact</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: demande.contact.societe ? '#8B5CF6' : '#0EA5E9',
                  color: '#fff', display: 'grid', placeItems: 'center',
                  fontSize: 13, fontWeight: 600, flexShrink: 0,
                }}>{initials(demande.contact.nom)}</div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.2 }}>{demande.contact.nom}</div>
                  {demande.contact.societe && (
                    <div style={{ fontSize: 12, color: 'var(--ink-500)', marginTop: 1 }}>{demande.contact.societe}</div>
                  )}
                </div>
              </div>
              <MetaRow icon="mail">{demande.contact.email}</MetaRow>
              {demande.contact.telephone && (
                <MetaRow icon="phone">{demande.contact.telephone}</MetaRow>
              )}
              {demande.contact.nbDemandesTotal > 1 && (
                <MetaRow icon="users">{demande.contact.nbDemandesTotal} demandes au total</MetaRow>
              )}
            </div>
          </div>

          {/* Événement */}
          <div>
            <SectionLabel>Événement</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {demande.typeEvenement && (
                <MetaRow icon="star">{EVENT_LABEL[demande.typeEvenement] ?? demande.typeEvenement}</MetaRow>
              )}
              {demande.dateEvenement && (
                <MetaRow icon="cal">{formatDate(demande.dateEvenement)}</MetaRow>
              )}
              {(demande.heureDebut || demande.heureFin) && (
                <MetaRow icon="clock">
                  {demande.heureDebut ?? '?'}{demande.heureFin ? ` – ${demande.heureFin}` : ''}
                </MetaRow>
              )}
              {demande.nbInvites && (
                <MetaRow icon="users">{demande.nbInvites} invités</MetaRow>
              )}
              {demande.budgetIndicatifCents && (
                <MetaRow icon="euro">{formatBudget(demande.budgetIndicatifCents)}</MetaRow>
              )}
              {demande.espace && (
                <MetaRow icon="pin">{demande.espace.nom}</MetaRow>
              )}
              {demande.contraintesAlimentaires.length > 0 && (
                <MetaRow icon="check">{demande.contraintesAlimentaires.join(', ')}</MetaRow>
              )}
            </div>
          </div>

          {/* Assigné */}
          <div>
            <SectionLabel>Assigné à</SectionLabel>
            <AssigneeSelector
              demandeId={demande.id}
              assigneeId={demande.assignee?.id}
              assigneeName={demande.assignee?.nom}
              assigneeColor={demande.assignee?.avatarColor}
            />
          </div>

          {/* Notes */}
          <div>
            <SectionLabel>Notes internes</SectionLabel>
            <NotesEditor demandeId={demande.id} initialNotes={demande.notes} />
          </div>

          {/* Pièces jointes */}
          <div>
            <SectionLabel>Pièces jointes</SectionLabel>
            <AttachmentsPanel demandeId={demande.id} initialPieces={demande.pieces} />
          </div>

          {/* Meta */}
          <div style={{ fontSize: 11.5, color: 'var(--ink-400)', display: 'flex', flexDirection: 'column', gap: 3, paddingTop: 4 }}>
            <div>Créée le {formatDate(demande.createdAt)}</div>
            <div>Origine : {demande.origine}</div>
          </div>
        </div>

        {/* Right panel — thread */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Recap card — always visible, shows gaps */}
          <div style={{
            margin: '16px 24px 0',
            padding: '12px 16px',
            background: 'var(--surface-sunken)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-md)',
            flexShrink: 0,
          }}>
            <div style={{
              fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase',
              letterSpacing: '0.08em', color: 'var(--ink-400)', marginBottom: 10,
            }}>Informations demande</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 20px' }}>
              {[
                { label: 'Type', value: demande.typeEvenement ? (EVENT_LABEL[demande.typeEvenement] ?? demande.typeEvenement) : null },
                { label: 'Date', value: demande.dateEvenement ? formatDate(demande.dateEvenement) : null },
                { label: 'Horaire', value: demande.heureDebut ? `${demande.heureDebut}${demande.heureFin ? ` – ${demande.heureFin}` : ''}` : null },
                { label: 'Invités', value: demande.nbInvites ? String(demande.nbInvites) : null },
                { label: 'Budget', value: demande.budgetIndicatifCents ? formatBudget(demande.budgetIndicatifCents) : null },
                { label: 'Espace', value: demande.espace?.nom ?? null },
                { label: 'Contraintes', value: demande.contraintesAlimentaires.length > 0 ? demande.contraintesAlimentaires.join(', ') : null },
              ].map(({ label, value }) => (
                <span key={label} style={{ fontSize: 12.5 }}>
                  <span style={{ color: 'var(--ink-400)', marginRight: 4 }}>{label}</span>
                  <span style={{ color: value ? 'var(--ink-800)' : 'var(--ink-300)', fontStyle: value ? 'normal' : 'italic' }}>
                    {value ?? '—'}
                  </span>
                </span>
              ))}
            </div>
          </div>

          {/* Messages list */}
          <div style={{
            flex: 1, overflowY: 'auto',
            padding: '20px 24px',
            display: 'flex', flexDirection: 'column', gap: 16,
          }}>
            {allMessages.length === 0 && (
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', height: '100%',
                color: 'var(--ink-300)', fontSize: 13, gap: 10,
              }}>
                <Icon name="mail" size={28} />
                <span>Aucun message dans cette demande</span>
              </div>
            )}

            {allMessages.map(msg => {
              const isOut = msg.direction === 'OUT'
              const ts = formatDateTime(isOut ? msg.sentAt : msg.receivedAt)
              const bodyDisplay = (msg.bodyText ?? msg.bodyHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')).trim()

              return (
                <div key={msg.id} style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: isOut ? 'flex-end' : 'flex-start',
                  gap: 4,
                }}>
                  <div style={{
                    fontSize: 11, color: 'var(--ink-400)',
                    display: 'flex', gap: 6, alignItems: 'center',
                  }}>
                    <span style={{ fontWeight: 550 }}>
                      {isOut ? 'Vous' : (msg.fromName ?? msg.fromEmail)}
                    </span>
                    {ts && <span>{ts}</span>}
                  </div>

                  <div style={{
                    maxWidth: '78%',
                    background: isOut ? 'var(--accent-soft)' : 'var(--surface)',
                    border: `1px solid ${isOut ? 'var(--accent-soft-2)' : 'var(--border)'}`,
                    borderRadius: isOut ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                    padding: '10px 14px',
                    fontSize: 13.5, lineHeight: 1.6,
                    color: 'var(--ink-900)',
                    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  }}>
                    {bodyDisplay}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Reply form */}
          <div style={{
            borderTop: '1px solid var(--border)',
            padding: '16px 24px 20px',
            background: 'var(--surface)',
            flexShrink: 0,
          }}>
            <ReplyForm demandeId={demande.id} templates={templates} context={context} />
          </div>
        </div>
      </div>
    </div>
  )
}
