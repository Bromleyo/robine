'use client'

import { useState } from 'react'
import Link from 'next/link'
import Icon from '@/components/ui/icon'

interface Contact {
  id: string
  nom: string
  email: string
  telephone?: string | null
  societe?: string | null
  nbDemandesTotal: number
  nbDemandesConfirmees: number
}

interface Props {
  contacts: Contact[]
}

function initials(nom: string) {
  return nom.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

export default function ContactsClient({ contacts }: Props) {
  const [search, setSearch] = useState('')

  const filtered = contacts.filter(c => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      c.nom.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      (c.societe?.toLowerCase().includes(q) ?? false)
    )
  })

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Search */}
      <div style={{ padding: '10px 24px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'var(--surface-sunken)', border: '1px solid var(--border)',
          borderRadius: 'var(--r-sm)', padding: '7px 12px', maxWidth: 360,
        }}>
          <span style={{ color: 'var(--ink-400)', display: 'flex' }}><Icon name="search" size={14} /></span>
          <input
            type="text"
            placeholder="Rechercher un contact…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              border: 'none', background: 'transparent',
              fontSize: 13, color: 'var(--ink-900)', outline: 'none', flex: 1,
              fontFamily: 'inherit',
            }}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-400)', padding: 0, display: 'flex' }}
            >
              <Icon name="close" size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Contact', 'Email', 'Téléphone', 'Société', 'Demandes', 'Confirmées'].map(h => (
                <th key={h} style={{
                  padding: '10px 16px', textAlign: 'left',
                  fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
                  letterSpacing: '0.07em', color: 'var(--ink-400)',
                  background: 'var(--surface)', position: 'sticky', top: 0,
                  borderBottom: '1px solid var(--border)',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} style={{
                  padding: '48px 16px', textAlign: 'center',
                  color: 'var(--ink-400)', fontSize: 13,
                }}>
                  {search ? 'Aucun contact ne correspond à la recherche' : 'Aucun contact'}
                </td>
              </tr>
            )}
            {filtered.map((c, i) => (
              <tr key={c.id} style={{
                borderBottom: '1px solid var(--hairline)',
                background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)',
              }}>
                <td style={{ padding: '11px 16px' }}>
                  <Link href={`/contacts/${c.id}`} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 10,
                    textDecoration: 'none', color: 'inherit',
                  }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%',
                      background: c.societe ? '#8B5CF6' : '#0EA5E9',
                      color: '#fff', display: 'grid', placeItems: 'center',
                      fontSize: 11, fontWeight: 600, flexShrink: 0,
                    }}>{initials(c.nom)}</div>
                    <span style={{ fontSize: 13, fontWeight: 550 }}>{c.nom}</span>
                  </Link>
                </td>
                <td style={{ padding: '11px 16px' }}>
                  <span style={{ fontSize: 12.5, color: 'var(--ink-700)' }}>{c.email}</span>
                </td>
                <td style={{ padding: '11px 16px' }}>
                  <span style={{ fontSize: 12.5, color: 'var(--ink-500)' }}>{c.telephone ?? '—'}</span>
                </td>
                <td style={{ padding: '11px 16px' }}>
                  <span style={{ fontSize: 12.5, color: 'var(--ink-700)' }}>{c.societe ?? '—'}</span>
                </td>
                <td style={{ padding: '11px 16px', textAlign: 'center' }}>
                  <span style={{
                    fontSize: 12.5,
                    fontWeight: c.nbDemandesTotal > 0 ? 600 : 400,
                    color: c.nbDemandesTotal > 0 ? 'var(--ink-900)' : 'var(--ink-300)',
                  }}>{c.nbDemandesTotal}</span>
                </td>
                <td style={{ padding: '11px 16px', textAlign: 'center' }}>
                  <span style={{
                    fontSize: 12.5,
                    fontWeight: c.nbDemandesConfirmees > 0 ? 600 : 400,
                    color: c.nbDemandesConfirmees > 0 ? '#059669' : 'var(--ink-300)',
                  }}>{c.nbDemandesConfirmees}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
