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
      const prix = `${Math.round(m.prixCents / 100)}€/pers.`
      const regimes = m.regimesSupportes.length > 0 ? ` — régimes : ${m.regimesSupportes.join(', ')}` : ''
      const convives = (m.minConvives ?? 0) > 0 || (m.maxConvives ?? 0) > 0
        ? ` — ${m.minConvives ? `min ${m.minConvives}` : ''}${m.maxConvives ? ` max ${m.maxConvives}` : ''} pers.`
        : ''
      const desc = m.description ? `\n  ${m.description}` : ''
      return `- **${m.nom}** : ${prix}${regimes}${convives}${desc}`
    })
    sections.push(`## Menus & tarifs\n\n${lines.join('\n')}`)
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

    if (rules.length > 0) sections.push(`## Règles administratives\n\n${rules.join('\n\n')}`)
  }

  // 4. Style de communication
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
