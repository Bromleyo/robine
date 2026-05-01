'use client'

import InlineField from './inline-field'
import type { TypeEvenement } from '@/types/domain'

const EVENT_OPTIONS: { value: string; label: string }[] = [
  { value: '',                  label: '— Type —' },
  { value: 'MARIAGE',           label: 'Mariage' },
  { value: 'DINER_ENTREPRISE',  label: "Dîner d'entreprise" },
  { value: 'ANNIVERSAIRE',      label: 'Anniversaire' },
  { value: 'SEMINAIRE',         label: 'Séminaire' },
  { value: 'PRIVATISATION',     label: 'Privatisation' },
  { value: 'BAPTEME',           label: 'Baptême' },
  { value: 'COCKTAIL',          label: 'Cocktail' },
  { value: 'AUTRE',             label: 'Autre' },
]

interface Espace { id: string; nom: string; capaciteMax: number }

interface Props {
  demandeId: string
  typeEvenement: TypeEvenement | null | undefined
  dateEvenement: Date | string | null | undefined
  heureDebut: string | null | undefined
  heureFin: string | null | undefined
  nbInvites: number | null | undefined
  espaceId: string | null | undefined
  espaces: Espace[]
  contraintesAlimentaires: string[]
  onSaved?: () => void
}

function toIsoDate(v: Date | string | null | undefined): string | null {
  if (!v) return null
  const d = v instanceof Date ? v : new Date(v)
  if (Number.isNaN(d.getTime())) return null
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function EvenementEditor(props: Props) {
  const espaceOptions = [
    { value: '', label: '— Aucun —' },
    ...props.espaces.map(e => ({ value: e.id, label: `${e.nom} (max ${e.capaciteMax} pers.)` })),
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <InlineField
        demandeId={props.demandeId}
        field="typeEvenement"
        label="Type"
        variant="select"
        value={props.typeEvenement ?? null}
        options={EVENT_OPTIONS}
        onSaved={props.onSaved}
      />
      <InlineField
        demandeId={props.demandeId}
        field="dateEvenement"
        label="Date"
        variant="date"
        value={toIsoDate(props.dateEvenement)}
        onSaved={props.onSaved}
      />
      <InlineField
        demandeId={props.demandeId}
        field="heureDebut"
        label="Début"
        variant="time"
        value={props.heureDebut ?? null}
        onSaved={props.onSaved}
      />
      <InlineField
        demandeId={props.demandeId}
        field="heureFin"
        label="Fin"
        variant="time"
        value={props.heureFin ?? null}
        onSaved={props.onSaved}
      />
      <InlineField
        demandeId={props.demandeId}
        field="nbInvites"
        label="Invités"
        variant="number"
        value={props.nbInvites ?? null}
        min={1}
        max={5000}
        placeholder="Nombre"
        onSaved={props.onSaved}
      />
      <InlineField
        demandeId={props.demandeId}
        field="espaceId"
        label="Espace"
        variant="select"
        value={props.espaceId ?? null}
        options={espaceOptions}
        onSaved={props.onSaved}
      />
      <InlineField
        demandeId={props.demandeId}
        field="contraintesAlimentaires"
        label="Régimes"
        variant="chips"
        value={props.contraintesAlimentaires}
        emptyLabel="Aucun"
        onSaved={props.onSaved}
      />
    </div>
  )
}
