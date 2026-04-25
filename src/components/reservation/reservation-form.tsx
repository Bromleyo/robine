'use client'

import { useState } from 'react'

const EVENT_OPTIONS = [
  { value: '', label: 'Choisir un type…' },
  { value: 'MARIAGE', label: 'Mariage' },
  { value: 'DINER_ENTREPRISE', label: "Dîner d'entreprise" },
  { value: 'ANNIVERSAIRE', label: 'Anniversaire' },
  { value: 'SEMINAIRE', label: 'Séminaire' },
  { value: 'PRIVATISATION', label: 'Privatisation' },
  { value: 'BAPTEME', label: 'Baptême' },
  { value: 'COCKTAIL', label: 'Cocktail' },
  { value: 'AUTRE', label: 'Autre' },
]

interface Props {
  restaurantId: string
  restaurantNom: string
}

export default function ReservationForm({ restaurantId, restaurantNom }: Props) {
  const [nom, setNom] = useState('')
  const [email, setEmail] = useState('')
  const [telephone, setTelephone] = useState('')
  const [typeEvenement, setTypeEvenement] = useState('')
  const [dateEvenement, setDateEvenement] = useState('')
  const [nbInvites, setNbInvites] = useState('')
  const [budget, setBudget] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nom.trim() || !email.trim() || !message.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/reservation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantId,
          contactNom: nom.trim(),
          contactEmail: email.trim().toLowerCase(),
          contactTelephone: telephone.trim() || undefined,
          typeEvenement: typeEvenement || undefined,
          dateEvenement: dateEvenement || undefined,
          nbInvites: nbInvites ? Number(nbInvites) : undefined,
          budgetEuros: budget ? Number(budget) : undefined,
          message: message.trim(),
          _hp: '',
        }),
      })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        setError(data.error ?? 'Une erreur est survenue.')
      } else {
        setSubmitted(true)
      }
    } catch {
      setError("Impossible d'envoyer la demande. Vérifiez votre connexion.")
    } finally {
      setSubmitting(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', boxSizing: 'border-box',
    border: '1px solid #E5E0D9', borderRadius: 8,
    fontSize: 14, color: '#1C1917', background: '#fff',
    outline: 'none', fontFamily: 'inherit',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 12.5, fontWeight: 600,
    color: '#6B6460', marginBottom: 5,
  }

  if (submitted) {
    return (
      <div style={{ minHeight: '100vh', background: '#FAF8F5', display: 'grid', placeItems: 'center', padding: 24 }}>
        <div style={{
          background: '#fff', borderRadius: 16, padding: '48px 40px',
          maxWidth: 480, width: '100%', textAlign: 'center',
          boxShadow: '0 4px 24px rgba(28,25,23,.08)',
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: '#DCFCE7', display: 'grid', placeItems: 'center',
            margin: '0 auto 20px',
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 650, color: '#1C1917', margin: '0 0 10px' }}>
            Demande envoyée !
          </h2>
          <p style={{ fontSize: 14, color: '#78716C', lineHeight: 1.6, margin: 0 }}>
            Merci pour votre demande. L&apos;équipe de {restaurantNom} vous contactera dans les plus brefs délais.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#FAF8F5', padding: '32px 16px' }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 40, height: 40, borderRadius: 10,
            background: '#9F1239', color: '#fff',
            fontWeight: 700, fontSize: 16, marginBottom: 16,
          }}>R</div>
          <h1 style={{ fontSize: 22, fontWeight: 650, color: '#1C1917', margin: '0 0 6px', letterSpacing: '-0.01em' }}>
            Demande de réservation
          </h1>
          <p style={{ fontSize: 14, color: '#78716C', margin: 0 }}>
            {restaurantNom} — Événement privé
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{
          background: '#fff', borderRadius: 16, padding: '28px 28px 32px',
          boxShadow: '0 4px 24px rgba(28,25,23,.07)',
          display: 'flex', flexDirection: 'column', gap: 18,
        }}>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={labelStyle}>Nom complet <span style={{ color: '#9F1239' }}>*</span></label>
              <input required value={nom} onChange={e => setNom(e.target.value)} style={inputStyle} placeholder="Jean Dupont" />
            </div>
            <div>
              <label style={labelStyle}>Email <span style={{ color: '#9F1239' }}>*</span></label>
              <input required type="email" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} placeholder="jean@exemple.fr" />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Téléphone</label>
            <input type="tel" value={telephone} onChange={e => setTelephone(e.target.value)} style={inputStyle} placeholder="06 00 00 00 00" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={labelStyle}>Type d&apos;événement</label>
              <select value={typeEvenement} onChange={e => setTypeEvenement(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                {EVENT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Date souhaitée</label>
              <input type="date" value={dateEvenement} onChange={e => setDateEvenement(e.target.value)} style={inputStyle} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={labelStyle}>Nombre d&apos;invités</label>
              <input type="number" min={1} value={nbInvites} onChange={e => setNbInvites(e.target.value)} style={inputStyle} placeholder="ex. 50" />
            </div>
            <div>
              <label style={labelStyle}>Budget indicatif (€/pers.)</label>
              <input type="number" min={1} value={budget} onChange={e => setBudget(e.target.value)} style={inputStyle} placeholder="ex. 80" />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Votre demande <span style={{ color: '#9F1239' }}>*</span></label>
            <textarea
              required
              rows={4}
              value={message}
              onChange={e => setMessage(e.target.value)}
              style={{ ...inputStyle, resize: 'vertical' }}
              placeholder="Décrivez votre événement, vos souhaits, questions particulières…"
            />
          </div>

          {error && (
            <div style={{
              padding: '10px 14px', borderRadius: 8,
              background: '#FEF2F2', border: '1px solid #FECACA',
              fontSize: 13, color: '#991B1B',
            }}>{error}</div>
          )}

          {/* Honeypot — invisible for humans, filled by bots */}
          <input type="text" name="_hp" defaultValue="" tabIndex={-1} aria-hidden="true" style={{ display: 'none' }} />

          <button
            type="submit"
            disabled={submitting || !nom.trim() || !email.trim() || !message.trim()}
            style={{
              padding: '12px 24px', borderRadius: 9,
              background: '#9F1239', color: '#fff',
              fontSize: 14.5, fontWeight: 600, border: 'none',
              cursor: submitting ? 'default' : 'pointer',
              opacity: (submitting || !nom.trim() || !email.trim() || !message.trim()) ? 0.6 : 1,
            }}
          >
            {submitting ? 'Envoi en cours…' : 'Envoyer ma demande'}
          </button>

          <p style={{ fontSize: 12, color: '#A8A29E', textAlign: 'center', margin: 0 }}>
            Nous vous répondrons sous 24–48h ouvrées.
          </p>
        </form>
      </div>
    </div>
  )
}
