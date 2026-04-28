import { prisma } from '@/lib/db/prisma'

export async function compileAIPrompt(restaurantId: string): Promise<string> {
  const [config, espaces, menus] = await Promise.all([
    prisma.aIConfiguration.findUnique({ where: { restaurantId } }),
    prisma.espace.findMany({ where: { restaurantId, actif: true }, orderBy: { ordre: 'asc' } }),
    prisma.menu.findMany({ where: { restaurantId, actif: true }, orderBy: { ordre: 'asc' } }),
  ])

  const sections: string[] = []

  // 1. Établissement
  if (espaces.length > 0) {
    const lines = espaces.map(e => {
      const cap = e.capaciteMin > 1
        ? `${e.capaciteMin}–${e.capaciteMax} personnes`
        : `jusqu'à ${e.capaciteMax} personnes`
      return `- **${e.nom}** (${cap})${e.description ? ` : ${e.description}` : ''}`
    })
    sections.push(`## Espaces disponibles\n\n${lines.join('\n')}`)
  }

  // 2. Menus & tarifs
  if (menus.length > 0) {
    const lines = menus.map(m => {
      const serviceLabel = m.serviceType === 'BUFFET' ? 'Buffet' : m.serviceType === 'COCKTAIL' ? 'Cocktail' : 'Assis'
      const parts: string[] = [
        `### ${m.nom} — ${Math.round(m.prixCents / 100)}€/pers.`,
        `Service : ${serviceLabel}`,
      ]
      if (m.choixUniqueDispo && m.choixUniqueMinPax) {
        parts.push(`- À partir de ${m.choixUniqueMinPax} personnes : choix unique imposé`)
      }
      if (m.choixMultipleDispo && m.choixMultipleMinPax) {
        parts.push(`- À partir de ${m.choixMultipleMinPax} personnes : choix multiple possible`)
      }
      if (m.maxConvives) parts.push(`- Maximum : ${m.maxConvives} personnes`)
      if (m.regimesSupportes.length > 0) parts.push(`Régimes : ${m.regimesSupportes.join(', ')}`)
      parts.push(`Document de présentation : ${m.pdfUrl ?? 'aucun'}`)
      if (m.description) parts.push(m.description)
      return parts.join('\n')
    })
    sections.push(`## Menus & tarifs\n\n${lines.join('\n\n')}`)
  }

  // 3. Règles administratives
  if (config) {
    const rules: string[] = []

    const suppl = config.supplements as Record<string, unknown>
    if (suppl && Object.keys(suppl).length > 0) {
      const supplLines: string[] = []
      if (suppl.vinBouteilleCents) supplLines.push(`- Vin : ${Math.round(Number(suppl.vinBouteilleCents) / 100)}€/bouteille`)
      if (suppl.menuEnfantCents) supplLines.push(`- Menu enfant : ${Math.round(Number(suppl.menuEnfantCents) / 100)}€`)
      if (suppl.heuresSuppCentsParH) supplLines.push(`- Heures supp. : ${Math.round(Number(suppl.heuresSuppCentsParH) / 100)}€/h`)
      if (supplLines.length > 0) rules.push(`### Suppléments\n${supplLines.join('\n')}`)
    }

    const acompte = config.acompte as Record<string, unknown>
    if (acompte?.actif) {
      rules.push(`### Acompte\nAcompte de ${acompte.pourcentage ?? 30}% demandé à la réservation.`)
    }

    if (config.cancellationConditions) {
      rules.push(`### Conditions d'annulation\n${config.cancellationConditions}`)
    }

    // Règle seuils menus (toujours ajoutée si des menus existent)
    if (menus.length > 0) {
      rules.push(
        `### Règles de recommandation des menus\n` +
        `Si le nombre de convives demandé est inférieur au seuil minimum d'un menu, ne propose PAS ce menu et explique poliment qu'aucune formule événementielle n'est disponible pour ce volume, en proposant la carte standard du restaurant.\n` +
        `Quand tu recommandes un menu, joins systématiquement son document de présentation en référençant l'URL dans ta réponse. Ne détaille PAS le contenu du menu dans le corps de l'email — réfère-toi simplement au document joint.`
      )
    }

    if (rules.length > 0) sections.push(`## Règles administratives\n\n${rules.join('\n\n')}`)
  }

  // 4. Frais de privatisation
  if (config && espaces.length > 0) {
    const seuilsData = (config.seuilsCA ?? {}) as Record<string, { midiSemaine?: number; soirSemaine?: number; midiWeekend?: number; soirWeekend?: number }>
    const marge = config.margeMarchandise ?? 0.70
    const espacesAvecSeuils = espaces.filter(e => {
      const s = seuilsData[e.id]
      return s && (s.midiSemaine || s.soirSemaine || s.midiWeekend || s.soirWeekend)
    })
    if (espacesAvecSeuils.length > 0) {
      const margePct = Math.round(marge * 100)
      const sallesLines = espacesAvecSeuils.map(e => {
        const s = seuilsData[e.id]!
        const lines = [`**${e.nom}** :`]
        if (s.midiSemaine) lines.push(`- Midi semaine : ${s.midiSemaine}€`)
        if (s.soirSemaine) lines.push(`- Soir semaine : ${s.soirSemaine}€`)
        if (s.midiWeekend) lines.push(`- Midi week-end : ${s.midiWeekend}€`)
        if (s.soirWeekend) lines.push(`- Soir week-end : ${s.soirWeekend}€`)
        return lines.join('\n')
      }).join('\n\n')
      sections.push(
        `## Frais de privatisation\n\n` +
        `### Comment calculer\n` +
        `Pour chaque demande de privatisation, applique cette formule :\n\n` +
        `1. CA prévisionnel = nb_convives × prix_menu_choisi\n` +
        `2. CA cible = seuil défini pour cette salle et ce créneau (voir ci-dessous)\n` +
        `3. Si CA prévisionnel >= CA cible : privatisation incluse (gratuite)\n` +
        `4. Si CA prévisionnel < CA cible :\n` +
        `   - Manque à gagner = CA cible − CA prévisionnel\n` +
        `   - Frais privatisation = manque à gagner × ${margePct}%\n` +
        `   - Arrondi à la centaine supérieure\n\n` +
        `### CA cibles par salle\n\n` +
        sallesLines + `\n\n` +
        `### Règles importantes\n` +
        `- Présente le tarif de privatisation comme un montant net, sans expliquer le calcul au client.\n` +
        `- Si le CA cible n'est pas défini pour le créneau demandé, ne donne PAS de tarif et indique que tu reviendras vers le client après vérification.\n` +
        `- Toujours arrondir à la centaine supérieure.`
      )
    }
  }

  // 5. Style de communication
  const styleParts: string[] = []
  if (config?.styleRules) styleParts.push(config.styleRules)
  if (config?.customRules) styleParts.push(config.customRules)
  if (styleParts.length > 0) {
    sections.push(`## Style de communication\n\n${styleParts.join('\n\n')}`)
  }

  const body = sections.join('\n\n---\n\n')

  return [
    "Tu es l'assistant du responsable événementiel d'un restaurant.",
    'Rédige des réponses email professionnelles, chaleureuses et concises en français, au nom du restaurant.',
    'Utilise "Madame" ou "Monsieur" selon le prénom, sinon "Madame, Monsieur".',
    "Signe toujours : \"Bien cordialement,\\n[L'équipe événementielle]\"",
    'Réponds UNIQUEMENT avec le corps du mail, sans objet ni balises HTML.',
    body ? `\n---\n\n${body}` : '',
  ].filter(Boolean).join('\n')
}
