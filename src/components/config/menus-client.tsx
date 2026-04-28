'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Icon from '@/components/ui/icon'

interface Menu {
  id: string
  nom: string
  prixCents: number
  description: string | null
  maxConvives: number | null
  pdfUrl: string | null
  actif: boolean
  serviceType: 'ASSIS' | 'BUFFET' | 'COCKTAIL'
  choixUniqueDispo: boolean
  choixUniqueMinPax: number | null
  choixMultipleDispo: boolean
  choixMultipleMinPax: number | null
}

const SERVICE_LABELS: Record<string, string> = { ASSIS: 'Assis', BUFFET: 'Buffet', COCKTAIL: 'Cocktail' }

const EMPTY_FORM = {
  nom: '', prixCents: '', description: '', maxConvives: '',
  serviceType: 'ASSIS' as 'ASSIS' | 'BUFFET' | 'COCKTAIL',
  choixUniqueDispo: true, choixUniqueMinPax: '',
  choixMultipleDispo: false, choixMultipleMinPax: '',
}

function formatPrix(cents: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(cents / 100)
}

function pdfFilename(url: string) {
  try { return decodeURIComponent(new URL(url).pathname.split('/').pop() ?? url) } catch { return url }
}

export default function MenusClient({ menus: initial }: { menus: Menu[] }) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const editFileInputRef = useRef<HTMLInputElement>(null)

  const inp: React.CSSProperties = {
    width: '100%', padding: '7px 10px', border: '1px solid var(--border)',
    borderRadius: 'var(--r-sm)', fontSize: 13, fontFamily: 'inherit',
    background: 'var(--surface-sunken)', color: 'var(--ink-900)', outline: 'none',
  }

  function openAdd() { setEditing(null); setForm(EMPTY_FORM); setShowForm(true) }

  function openEdit(m: Menu) {
    setEditing(m.id)
    setForm({
      nom: m.nom, prixCents: String(m.prixCents / 100),
      description: m.description ?? '', maxConvives: m.maxConvives ? String(m.maxConvives) : '',
      serviceType: m.serviceType,
      choixUniqueDispo: m.choixUniqueDispo, choixUniqueMinPax: m.choixUniqueMinPax ? String(m.choixUniqueMinPax) : '',
      choixMultipleDispo: m.choixMultipleDispo, choixMultipleMinPax: m.choixMultipleMinPax ? String(m.choixMultipleMinPax) : '',
    })
    setShowForm(true)
  }

  const canSave = form.nom.trim() !== '' && form.prixCents !== '' && (form.choixUniqueDispo || form.choixMultipleDispo)

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    const payload = {
      nom: form.nom.trim(),
      prixCents: Math.round(Number(form.prixCents) * 100),
      description: form.description || null,
      maxConvives: form.maxConvives ? Number(form.maxConvives) : null,
      serviceType: form.serviceType,
      choixUniqueDispo: form.choixUniqueDispo,
      choixUniqueMinPax: form.choixUniqueDispo && form.choixUniqueMinPax ? Number(form.choixUniqueMinPax) : null,
      choixMultipleDispo: form.choixMultipleDispo,
      choixMultipleMinPax: form.choixMultipleDispo && form.choixMultipleMinPax ? Number(form.choixMultipleMinPax) : null,
    }
    if (editing) {
      await fetch(`/api/menus/${editing}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    } else {
      await fetch('/api/menus', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    }
    setSaving(false); setShowForm(false); router.refresh()
  }

  async function toggleActif(m: Menu) {
    await fetch(`/api/menus/${m.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actif: !m.actif }) })
    router.refresh()
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer ce menu ?')) return
    await fetch(`/api/menus/${id}`, { method: 'DELETE' })
    router.refresh()
  }

  async function handleUploadPdf(menuId: string, file: File) {
    setUploadError(null)
    if (file.type !== 'application/pdf') { setUploadError('Seuls les fichiers PDF sont acceptés'); return }
    if (file.size > 5 * 1024 * 1024) { setUploadError('Fichier trop volumineux (max 5 MB)'); return }
    setUploadingId(menuId)
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch(`/api/menus/${menuId}/upload-pdf`, { method: 'POST', body: fd })
    setUploadingId(null)
    if (!res.ok) {
      const d = await res.json().catch(() => ({})) as { error?: string }
      setUploadError(d.error ?? 'Erreur upload')
    } else {
      router.refresh()
    }
  }

  async function handleDeletePdf(menuId: string) {
    if (!confirm('Supprimer le document PDF ?')) return
    await fetch(`/api/menus/${menuId}/delete-pdf`, { method: 'DELETE' })
    router.refresh()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {uploadError && (
        <div style={{ fontSize: 12, color: 'var(--accent)', background: 'var(--accent-soft)', borderRadius: 6, padding: '6px 10px' }}>
          {uploadError}
          <button onClick={() => setUploadError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontWeight: 600, marginLeft: 8 }}>×</button>
        </div>
      )}

      {initial.map(m => (
        <div key={m.id} style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--r-md)', padding: '14px 18px',
          display: 'flex', flexDirection: 'column', gap: 10, opacity: m.actif ? 1 : 0.55,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{m.nom}</span>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--accent)' }}>{formatPrix(m.prixCents)}</span>
                <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 10, background: 'var(--surface-sunken)', color: 'var(--ink-500)', border: '1px solid var(--border)' }}>
                  {SERVICE_LABELS[m.serviceType]}
                </span>
                {m.choixUniqueDispo && m.choixUniqueMinPax && (
                  <span style={{ fontSize: 11, color: 'var(--ink-500)' }}>Choix unique ≥{m.choixUniqueMinPax} pers.</span>
                )}
                {m.choixMultipleDispo && m.choixMultipleMinPax && (
                  <span style={{ fontSize: 11, color: 'var(--ink-500)' }}>Choix multiple ≥{m.choixMultipleMinPax} pers.</span>
                )}
                {!m.actif && <span style={{ fontSize: 11, color: 'var(--ink-400)', fontStyle: 'italic' }}>inactif</span>}
              </div>
              {m.description && <div style={{ fontSize: 12.5, color: 'var(--ink-500)', marginTop: 2 }}>{m.description}</div>}
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button onClick={() => toggleActif(m)} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 'var(--r-sm)', background: 'var(--surface-sunken)', border: '1px solid var(--border)', color: 'var(--ink-600)', cursor: 'pointer' }}>{m.actif ? 'Désactiver' : 'Activer'}</button>
              <button onClick={() => openEdit(m)} style={{ padding: '4px 8px', borderRadius: 'var(--r-sm)', display: 'inline-flex', alignItems: 'center', background: 'var(--surface-sunken)', border: '1px solid var(--border)', color: 'var(--ink-600)', cursor: 'pointer' }}><Icon name="file" size={13} /></button>
              <button onClick={() => handleDelete(m.id)} style={{ padding: '4px 8px', borderRadius: 'var(--r-sm)', display: 'inline-flex', alignItems: 'center', background: 'var(--surface-sunken)', border: '1px solid var(--border)', color: '#DC2626', cursor: 'pointer' }}><Icon name="close" size={13} /></button>
            </div>
          </div>

          {/* PDF */}
          {m.pdfUrl ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--surface-sunken)', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)' }}>
              <Icon name="file" size={13} />
              <span style={{ fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pdfFilename(m.pdfUrl)}</span>
              <a href={m.pdfUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none', flexShrink: 0 }}>Voir</a>
              <button onClick={() => handleDeletePdf(m.id)} style={{ fontSize: 12, color: '#DC2626', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0, padding: 0 }}>Supprimer</button>
            </div>
          ) : (
            <div
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void handleUploadPdf(m.id, f) }}
              onClick={() => {
                if (uploadingId !== m.id && fileInputRef.current) {
                  fileInputRef.current.dataset.menuId = m.id
                  fileInputRef.current.click()
                }
              }}
              style={{ border: '1.5px dashed var(--border)', borderRadius: 'var(--r-sm)', padding: '8px 14px', fontSize: 12, color: 'var(--ink-400)', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', background: 'var(--surface-sunken)' }}
            >
              <Icon name="file" size={13} />
              {uploadingId === m.id ? 'Upload en cours…' : 'Uploader un PDF de présentation (glisser-déposer ou clic — max 5 MB)'}
            </div>
          )}
        </div>
      ))}

      {/* Shared hidden input for card-level PDF uploads */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        style={{ display: 'none' }}
        onChange={e => {
          const file = e.target.files?.[0]
          const menuId = e.target.dataset.menuId
          if (file && menuId) void handleUploadPdf(menuId, file)
          e.target.value = ''
        }}
      />

      {initial.length === 0 && !showForm && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--ink-400)', fontSize: 13 }}>Aucun menu configuré</div>
      )}

      {showForm && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--accent)', borderRadius: 'var(--r-md)', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{editing ? 'Modifier le menu' : 'Nouveau menu'}</div>

          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 2 }}>
              <label style={{ fontSize: 11.5, color: 'var(--ink-500)', display: 'block', marginBottom: 4 }}>Nom *</label>
              <input value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} placeholder="Menu prestige" style={inp} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11.5, color: 'var(--ink-500)', display: 'block', marginBottom: 4 }}>Prix / pers. (€) *</label>
              <input type="number" value={form.prixCents} onChange={e => setForm(f => ({ ...f, prixCents: e.target.value }))} placeholder="85" style={inp} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11.5, color: 'var(--ink-500)', display: 'block', marginBottom: 4 }}>Max convives</label>
              <input type="number" value={form.maxConvives} onChange={e => setForm(f => ({ ...f, maxConvives: e.target.value }))} placeholder="120" style={inp} />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 11.5, color: 'var(--ink-500)', display: 'block', marginBottom: 4 }}>Description</label>
            <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Mise en bouche, entrée, plat, dessert…" style={inp} />
          </div>

          {/* ServiceType */}
          <div>
            <label style={{ fontSize: 11.5, color: 'var(--ink-500)', display: 'block', marginBottom: 8 }}>Type de service</label>
            <div style={{ display: 'flex', gap: 16 }}>
              {(['ASSIS', 'BUFFET', 'COCKTAIL'] as const).map(t => (
                <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                  <input type="radio" name="serviceType" value={t} checked={form.serviceType === t} onChange={() => setForm(f => ({ ...f, serviceType: t }))} style={{ accentColor: 'var(--accent)' }} />
                  {SERVICE_LABELS[t]}
                </label>
              ))}
            </div>
          </div>

          {/* Règles de service */}
          <div>
            <label style={{ fontSize: 11.5, color: 'var(--ink-500)', display: 'block', marginBottom: 8 }}>Règles de service</label>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1, padding: '10px 12px', background: 'var(--surface-sunken)', borderRadius: 'var(--r-sm)', border: `1px solid ${form.choixUniqueDispo ? 'var(--accent)' : 'var(--border)'}` }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, fontWeight: 500, marginBottom: form.choixUniqueDispo ? 8 : 0 }}>
                  <input type="checkbox" checked={form.choixUniqueDispo} onChange={e => setForm(f => ({ ...f, choixUniqueDispo: e.target.checked }))} style={{ accentColor: 'var(--accent)' }} />
                  Choix unique
                </label>
                {form.choixUniqueDispo && (
                  <>
                    <label style={{ fontSize: 11.5, color: 'var(--ink-500)', display: 'block', marginBottom: 4 }}>À partir de X personnes</label>
                    <input type="number" min="1" value={form.choixUniqueMinPax} onChange={e => setForm(f => ({ ...f, choixUniqueMinPax: e.target.value }))} placeholder="10" style={inp} />
                  </>
                )}
              </div>
              <div style={{ flex: 1, padding: '10px 12px', background: 'var(--surface-sunken)', borderRadius: 'var(--r-sm)', border: `1px solid ${form.choixMultipleDispo ? 'var(--accent)' : 'var(--border)'}` }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, fontWeight: 500, marginBottom: form.choixMultipleDispo ? 8 : 0 }}>
                  <input type="checkbox" checked={form.choixMultipleDispo} onChange={e => setForm(f => ({ ...f, choixMultipleDispo: e.target.checked }))} style={{ accentColor: 'var(--accent)' }} />
                  Choix multiple
                </label>
                {form.choixMultipleDispo && (
                  <>
                    <label style={{ fontSize: 11.5, color: 'var(--ink-500)', display: 'block', marginBottom: 4 }}>À partir de X personnes</label>
                    <input type="number" min="1" value={form.choixMultipleMinPax} onChange={e => setForm(f => ({ ...f, choixMultipleMinPax: e.target.value }))} placeholder="30" style={inp} />
                  </>
                )}
              </div>
            </div>
            {!form.choixUniqueDispo && !form.choixMultipleDispo && (
              <p style={{ fontSize: 12, color: 'var(--accent)', marginTop: 6, marginBottom: 0 }}>Au moins une option doit être disponible.</p>
            )}
          </div>

          {/* PDF in edit form */}
          {editing && (() => {
            const cur = initial.find(m => m.id === editing)
            return (
              <div>
                <label style={{ fontSize: 11.5, color: 'var(--ink-500)', display: 'block', marginBottom: 6 }}>Document de présentation</label>
                {cur?.pdfUrl ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--surface-sunken)', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)' }}>
                    <Icon name="file" size={13} />
                    <span style={{ fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pdfFilename(cur.pdfUrl)}</span>
                    <a href={cur.pdfUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none' }}>Voir</a>
                    <button onClick={() => handleDeletePdf(editing)} style={{ fontSize: 12, color: '#DC2626', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Supprimer</button>
                  </div>
                ) : (
                  <div
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void handleUploadPdf(editing, f) }}
                    onClick={() => editFileInputRef.current?.click()}
                    style={{ border: '1.5px dashed var(--border)', borderRadius: 'var(--r-sm)', padding: '8px 14px', fontSize: 12, color: 'var(--ink-400)', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', background: 'var(--surface-sunken)' }}
                  >
                    <Icon name="file" size={13} />
                    {uploadingId === editing ? 'Upload en cours…' : 'Uploader un PDF (glisser-déposer ou clic — max 5 MB)'}
                  </div>
                )}
                <input ref={editFileInputRef} type="file" accept="application/pdf" style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) void handleUploadPdf(editing, f); e.target.value = '' }}
                />
              </div>
            )
          })()}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setShowForm(false)} style={{ padding: '7px 14px', borderRadius: 'var(--r-sm)', fontSize: 13, background: 'var(--surface-sunken)', border: '1px solid var(--border)', color: 'var(--ink-600)', cursor: 'pointer' }}>Annuler</button>
            <button onClick={handleSave} disabled={saving || !canSave} style={{ padding: '7px 16px', borderRadius: 'var(--r-sm)', fontSize: 13, fontWeight: 500, background: saving || !canSave ? 'var(--border)' : 'var(--accent)', color: saving || !canSave ? 'var(--ink-400)' : '#fff', cursor: saving || !canSave ? 'not-allowed' : 'pointer' }}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </div>
      )}

      {!showForm && (
        <button onClick={openAdd} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', border: '1px dashed var(--border)', borderRadius: 'var(--r-md)', fontSize: 13, color: 'var(--ink-500)', background: 'transparent', cursor: 'pointer', alignSelf: 'flex-start' }}>
          <Icon name="plus" size={14} />
          Ajouter un menu
        </button>
      )}
    </div>
  )
}
