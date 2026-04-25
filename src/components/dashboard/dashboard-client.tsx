'use client'

import { useState, useCallback } from 'react'
import type { DemandeEnriched } from '@/types/domain'
import KanbanBoard from '@/components/kanban/kanban-board'
import DemandeFocusModal from '@/components/demandes/demande-focus-modal'

interface Props {
  demandes: DemandeEnriched[]
}

export default function DashboardClient({ demandes }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const handleClose = useCallback(() => setSelectedId(null), [])

  return (
    <>
      <KanbanBoard
        demandes={demandes}
        focusedId={selectedId ?? undefined}
        onCardClick={d => setSelectedId(d.id)}
      />
      <DemandeFocusModal demandeId={selectedId} onClose={handleClose} />
    </>
  )
}
