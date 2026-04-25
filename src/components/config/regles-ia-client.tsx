'use client'

import { useState } from 'react'

type Espace = { id: string; nom: string; capaciteMax: number }

type SeuilCA = { midiSemaine: string; soirSemaine: string; midiWeekend: string; soirWeekend: string }

type MenuRegle = {
  id: string
  nom: string
  prixCents: string
  minUnique: string
  minMultiple: string
  composition: string
  uniqueImpossible: boolean
}

type Supplements = {
  vinBouteilleCents: string
  menuEnfantCents: string
  heuresSuppCentsParH: string
}

type Acompte = { actif: boolean; pourcentage: string }

type Config = {
  seuilsCA: Record<string, SeuilCA>
  menus: MenuRegle[]
  supplements: Supplements
  acompte: Acompte
  conditionsAnnulation: string
}

const TIMESLOT_LABELS: Record<keyof SeuilCA, string> = {
  midiSemaine: 'Midi semaine',
  soirSemaine: 'Soir semaine',
  midiWeekend: 'Midi weekend',
  soirWeekend: 'Soir weekend',
}

const EMPTY_SEUIL: SeuilCA = { midiSemaine: '', soirSemaine: '', midiWeekend: '', soirWeekend: '' }
const EMPTY_MENU: Omit<MenuRegle, 'id'> = { nom: '', prixCents: '', minUnique: '', minMultiple: '', composition: '', uniqueImpossible: false }

function parseConfig(raw: Record<string, unknown>): Config {
  const rawSeuils = (raw.seuilsCA ?? {}) as Record<string, unknown>
  const seuilsCA: Record<string, SeuilCA> = {}
  for (const [k, v] of Object.entries(rawSeuils)) {
    const s = v as Record<string, unknown>
    seuilsCA[k] = {
      midiSemaine: String(s.midiSemaine ?? ''),
      soirSemaine: String(s.soirSemaine ?? ''),
      midiWeekend: String(s.midiWeekend ?? ''),
      soirWeekend: String(s.soirWeekend ?? ''),
    }
  }
  const rawMenus = Array.isArray(raw.menus) ? raw.menus : []
  const menus: MenuRegle[] = (rawMenus as Record<string, unknown>[]).map(m => ({
    id: String(m.id ?? crypto.randomUUID()),
    nom: String(m.nom ?? ''),
    prixCents: m.prixCents != null ? String(Number(m.prixCents) / 100) : '',
    minUnique: m.minUnique != null ? String(m.minUnique) : '',
    minMultiple: m.minMultiple != null ? String(m.minMultiple) : '',
    composition: String(m.composition ?? ''),
    uniqueImpossible: Boolean(m.uniqueImpossible),
  }))
  const rawSupp = (raw.supplements ?? {}) as Record<string, unknown>
  const supplements: Supplements = {
    vinBouteilleCents: rawSupp.vinBouteilleCents != null ? String(Number(rawSupp.vinBouteilleCents) / 100) : '20',
    menuEnfantCents: rawSupp.menuEnfantCents != null ? String(Number(rawSupp.menuEnfantCents) / 100) : '15',
    heuresSuppCentsParH: rawSupp.heuresSuppCentsParH != null ? String(Number(rawSupp.heuresSuppCentsParH) / 100) : '150',
  }
  const rawAcompte = (raw.acompte ?? {}) as Record<string, unknown>
  return {
    seuilsCA,
    menus,
    supplements,
    acompte: { actif: Boolean(rawAcompte.actif), pourcentage: String(rawAcompte.pourcentage ?? '30') },
    conditionsAnnulation: String(raw.conditionsAnnulation ?? ''),
  }
}

function serializeConfig(c: Config): Record<string, unknown> {
  const seuilsCA: Record<string, Record<string, number>> = {}
  for (const [k, v] of Object.entries(c.seuilsCA)) {
    seuilsCA[k] = {
      midiSemaine: Number(v.midiSemaine) || 0,
      soirSemaine: Number(v.soirSemaine) || 0,
      midiWeekend: Number(v.midiWeekend) || 0,
      soirWeekend: Number(v.soirWeekend) || 0,
    }
  }
  return {
    seuilsCA,
    menus: c.menus.map(m => ({
      id: m.id,
      nom: m.nom,
      prixCents: Math.round(Number(m.prixCents) * 100) || 0,
      minUnique: m.uniqueImpossible ? null : (Number(m.minUnique) || null),
      minMultiple: Number(m.minMultiple) || null,
      composition: m.composition,
      uniqueImpossible: m.uniqueImpossible,
    })),
    supplements: {
      vinBouteilleCents: Math.round(Number(c.supplements.vinBouteilleCents) * 100) || 0,
      menuEnfantCents: Math.round(Number(c.supplements.menuEnfantCents) * 100) || 0,
      heuresSuppCentsParH: Math.round(Number(c.supplements.heuresSuppCentsParH) * 100) || 0,
    },
    acompte: { actif: c.acompte.actif, pourcentage: Number(c.acompte.pourcentage) || 30 },
    conditionsAnnulation: c.conditionsAnnulation,
  }
}

const sectionStyle: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: '20px 24px',
  marginBottom: 20,
}
const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'var(--ink-700)',
  marginBottom: 12,
  display: 'block',
}
const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '7px 10px',
  borderRadius: 6,
  border: '1px solid var(--border)',
  fontSize: 13,
  background: 'var(--surface)',
  color: 'var(--ink-900)',
  boxSizing: 'border-box',
}

export default function ReglesIAClient({
  config: initialConfig,
  espaces,
}: {
  config: Record<string, unknown>
  espaces: Espace[]
}) {
  const [cfg, setCfg] = useState<Config>(() => parseConfig(initialConfig))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [addingMenu, setAddingMenu] = useState(false)
  const [newMenu, setNewMenu] = useState<Omit<MenuRegle, 'id'>>(EMPTY_MENU)

  async function handleSave() {
    setSaving(true)
    await fetch('/api/settings/regles-ia', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(serializeConfig(cfg)),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function updateSeuil(espaceId: string, field: keyof SeuilCA, value: string) {
    setCfg(prev => ({
      ...prev,
      seuilsCA: {
        ...prev.seuilsCA,
        [espaceId]: { ...(prev.seuilsCA[espaceId] ?? EMPTY_SEUIL), [field]: value },
      },
    }))
  }

  function updateMenu(id: string, field: keyof MenuRegle, value: string | boolean) {
    setCfg(prev => ({ ...prev, menus: prev.menus.map(m => m.id === id ? { ...m, [field]: value } : m) }))
  }

  function removeMenu(id: string) {
    setCfg(prev => ({ ...prev, menus: prev.menus.filter(m => m.id !== id) }))
  }

  function addMenu() {
    if (!newMenu.nom) return
    setCfg(prev => ({ ...prev, menus: [...prev.menus, { ...newMenu, id: crypto.randomUUID() }] }))
    setNewMenu(EMPTY_MENU)
    setAddingMenu(false)
  }

  return (
    <div>
      {/* ── 1. Seuils CA ── */}
      <div style={sectionStyle}>
        <span style={labelStyle}>Seuils CA minimum (€) par salle et créneau</span>
        <p style={{ fontSize: 12.5, color: 'var(--ink-500)', marginBottom: 16, marginTop: 0 }}>
          Si CA prévisionnel {'<'} seuil → frais de privatisation facturés en complément.
        </p>
        {espaces.length === 0 && (
          <p style={{ fontSize: 13, color: 'var(--ink-400)' }}>
            Aucun espace configuré.{' '}
            <a href="/config/espaces" style={{ color: 'var(--accent)' }}>Créer des espaces →</a>
          </p>
        )}
        {espaces.map(esp => (
          <div key={esp.id} style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--ink-800)' }}>
              {esp.nom}{' '}
              <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--ink-400)' }}>(max {esp.capaciteMax} pers.)</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
              {(Object.keys(TIMESLOT_LABELS) as (keyof SeuilCA)[]).map(slot => (
                <div key={slot}>
                  <div style={{ fontSize: 11, color: 'var(--ink-500)', marginBottom: 4 }}>{TIMESLOT_LABELS[slot]}</div>
                  <input
                    type="number"
                    placeholder="0"
                    value={cfg.seuilsCA[esp.id]?.[slot] ?? ''}
                    onChange={e => updateSeuil(esp.id, slot, e.target.value)}
                    style={inputStyle}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* ── 2. Menus ── */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ ...labelStyle, marginBottom: 0 }}>Menus & règles</span>
          <button
            onClick={() => setAddingMenu(true)}
            style={{ marginLeft: 'auto', fontSize: 12, padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface-sunken)', cursor: 'pointer', color: 'var(--ink-700)' }}
          >
            + Ajouter
          </button>
        </div>

        {cfg.menus.length === 0 && !addingMenu && (
          <p style={{ fontSize: 13, color: 'var(--ink-400)' }}>Aucun menu défini.</p>
        )}

        {cfg.menus.map(menu => (
          <div key={menu.id} style={{ borderBottom: '1px solid var(--hairline)', paddingBottom: 14, marginBottom: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
              {[
                { field: 'nom' as const, label: 'Nom', type: 'text' },
                { field: 'prixCents' as const, label: 'Prix (€)', type: 'number' },
                { field: 'minUnique' as const, label: 'Min. choix unique', type: 'number' },
                { field: 'minMultiple' as const, label: 'Min. choix multiple', type: 'number' },
              ].map(({ field, label, type }) => (
                <div key={field}>
                  <div style={{ fontSize: 11, color: 'var(--ink-500)', marginBottom: 4 }}>{label}</div>
                  <input
                    type={type}
                    disabled={field === 'minUnique' && menu.uniqueImpossible}
                    placeholder={field === 'minUnique' && menu.uniqueImpossible ? 'Impossible' : undefined}
                    value={field === 'minUnique' && menu.uniqueImpossible ? '' : menu[field]}
                    onChange={e => updateMenu(menu.id, field, e.target.value)}
                    style={{ ...inputStyle, opacity: field === 'minUnique' && menu.uniqueImpossible ? 0.4 : 1 }}
                  />
                </div>
              ))}
            </div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--ink-500)', marginBottom: 4 }}>Composition (citée dans les emails)</div>
              <textarea
                value={menu.composition}
                onChange={e => updateMenu(menu.id, 'composition', e.target.value)}
                rows={2}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--ink-700)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={menu.uniqueImpossible}
                  onChange={e => updateMenu(menu.id, 'uniqueImpossible', e.target.checked)}
                />
                Choix unique impossible (ex : Menu D)
              </label>
              <button
                onClick={() => removeMenu(menu.id)}
                style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                Supprimer
              </button>
            </div>
          </div>
        ))}

        {addingMenu && (
          <div style={{ background: 'var(--surface-sunken)', borderRadius: 8, padding: '14px 16px', marginTop: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
              {[
                { field: 'nom' as const, label: 'Nom', type: 'text' },
                { field: 'prixCents' as const, label: 'Prix (€)', type: 'number' },
                { field: 'minUnique' as const, label: 'Min. unique', type: 'number' },
                { field: 'minMultiple' as const, label: 'Min. multiple', type: 'number' },
              ].map(({ field, label, type }, i) => (
                <div key={field}>
                  <div style={{ fontSize: 11, color: 'var(--ink-500)', marginBottom: 4 }}>{label}</div>
                  <input
                    type={type}
                    autoFocus={i === 0}
                    value={newMenu[field] as string}
                    onChange={e => setNewMenu(p => ({ ...p, [field]: e.target.value }))}
                    style={inputStyle}
                  />
                </div>
              ))}
            </div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: 'var(--ink-500)', marginBottom: 4 }}>Composition</div>
              <textarea
                value={newMenu.composition}
                onChange={e => setNewMenu(p => ({ ...p, composition: e.target.value }))}
                rows={2}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--ink-700)', cursor: 'pointer', marginBottom: 12 }}>
              <input
                type="checkbox"
                checked={newMenu.uniqueImpossible}
                onChange={e => setNewMenu(p => ({ ...p, uniqueImpossible: e.target.checked }))}
              />
              Choix unique impossible
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={addMenu} style={{ fontSize: 13, padding: '6px 14px', borderRadius: 6, background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer' }}>
                Ajouter
              </button>
              <button onClick={() => setAddingMenu(false)} style={{ fontSize: 13, padding: '6px 14px', borderRadius: 6, background: 'var(--surface)', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--ink-700)' }}>
                Annuler
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── 3. Suppléments ── */}
      <div style={sectionStyle}>
        <span style={labelStyle}>Suppléments</span>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          {[
            { field: 'vinBouteilleCents' as const, label: 'Vin supplémentaire (€/bouteille)' },
            { field: 'menuEnfantCents' as const, label: 'Menu enfant (€)' },
            { field: 'heuresSuppCentsParH' as const, label: 'Heures supplémentaires (€/h)' },
          ].map(({ field, label }) => (
            <div key={field}>
              <div style={{ fontSize: 11, color: 'var(--ink-500)', marginBottom: 4 }}>{label}</div>
              <input
                type="number"
                value={cfg.supplements[field]}
                onChange={e => setCfg(prev => ({ ...prev, supplements: { ...prev.supplements, [field]: e.target.value } }))}
                style={inputStyle}
              />
            </div>
          ))}
        </div>
        <p style={{ fontSize: 11.5, color: 'var(--ink-400)', marginTop: 12, marginBottom: 0 }}>
          Heures sup. : ven./sam. soir à partir de 00h (max 2h) · sam./dim. midi à partir de 15h30 (max 17h sam.)
        </p>
      </div>

      {/* ── 4. Acompte ── */}
      <div style={sectionStyle}>
        <span style={labelStyle}>Acompte</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={cfg.acompte.actif}
              onChange={e => setCfg(prev => ({ ...prev, acompte: { ...prev.acompte, actif: e.target.checked } }))}
            />
            Demander un acompte
          </label>
          {cfg.acompte.actif && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="number"
                min="1"
                max="100"
                value={cfg.acompte.pourcentage}
                onChange={e => setCfg(prev => ({ ...prev, acompte: { ...prev.acompte, pourcentage: e.target.value } }))}
                style={{ ...inputStyle, width: 80 }}
              />
              <span style={{ fontSize: 13, color: 'var(--ink-600)' }}>%</span>
            </div>
          )}
        </div>
      </div>

      {/* ── 5. Conditions d'annulation ── */}
      <div style={sectionStyle}>
        <span style={labelStyle}>Conditions d'annulation</span>
        <textarea
          value={cfg.conditionsAnnulation}
          onChange={e => setCfg(prev => ({ ...prev, conditionsAnnulation: e.target.value }))}
          rows={5}
          placeholder="Rédigez ici vos conditions d'annulation. Elles seront insérées automatiquement dans les réponses IA."
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </div>

      {/* ── Save ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 40 }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '9px 22px', borderRadius: 7,
            background: 'var(--accent)', color: '#fff',
            border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
            fontSize: 14, fontWeight: 600, opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        {saved && <span style={{ fontSize: 13, color: '#059669' }}>Sauvegardé ✓</span>}
      </div>
    </div>
  )
}
