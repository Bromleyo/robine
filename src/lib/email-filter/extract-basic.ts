import type { TypeEvenement } from '@prisma/client'

const MONTHS: Record<string, number> = {
  janvier: 0, fevrier: 1, mars: 2, avril: 3, mai: 4, juin: 5,
  juillet: 6, aout: 7, septembre: 8, octobre: 9, novembre: 10, decembre: 11,
}

function normalize(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function parseDate(norm: string): Date | null {
  const now = new Date()
  const maxFuture = new Date(now.getFullYear() + 2, now.getMonth(), now.getDate())

  const slashMatch = norm.match(/\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})\b/)
  if (slashMatch) {
    const day = parseInt(slashMatch[1]!), month = parseInt(slashMatch[2]!) - 1
    let year = parseInt(slashMatch[3]!)
    if (year < 100) year += 2000
    const d = new Date(year, month, day)
    if (d > now && d < maxFuture) return d
  }

  for (const [monthName, monthIdx] of Object.entries(MONTHS)) {
    const re = new RegExp(`\\b(\\d{1,2})\\s+${monthName}(?:\\s+(\\d{4}))?`)
    const m = norm.match(re)
    if (m) {
      const day = parseInt(m[1]!)
      let year = m[2] ? parseInt(m[2]) : now.getFullYear()
      let d = new Date(year, monthIdx, day)
      if (d <= now) d = new Date(year + 1, monthIdx, day)
      if (d > now && d < maxFuture) return d
    }
  }

  return null
}

function parseGuestCount(norm: string): number | null {
  const patterns = [
    /(\d+)\s*(personnes?|invites?|convives?|pax|couverts?)/,
    /pour\s+(\d+)/,
    /(?:un\s+)?groupe\s+de\s+(\d+)/,
  ]
  for (const p of patterns) {
    const m = norm.match(p)
    if (m) {
      const n = parseInt(m[1]!)
      if (n >= 2 && n <= 500) return n
    }
  }
  return null
}

function parseType(norm: string): TypeEvenement | null {
  if (norm.includes('mariage') || norm.includes('nous marions') || norm.includes('se marier')) return 'MARIAGE'
  if (norm.includes('bapteme') || norm.includes('baptiser')) return 'BAPTEME'
  if (norm.includes('anniversaire')) return 'ANNIVERSAIRE'
  if (norm.includes('seminaire') || norm.includes('team building') || norm.includes('teambuilding') ||
      norm.includes('cse') || norm.includes("comite d'entreprise") || norm.includes('comite dentreprise')) return 'SEMINAIRE'
  if (norm.includes('cocktail')) return 'COCKTAIL'
  if (norm.includes('privatisation') || norm.includes('privatiser')) return 'PRIVATISATION'
  if (norm.includes("diner d'entreprise") || norm.includes('diner dentreprise') ||
      norm.includes("repas d'entreprise")) return 'DINER_ENTREPRISE'
  return null
}

export function extractBasicFields(subject: string, bodyText: string): {
  dateEvenement: Date | null
  nbInvites: number | null
  typeEvenement: TypeEvenement | null
} {
  const norm = normalize(`${subject} ${bodyText.slice(0, 1500)}`)
  return {
    dateEvenement: parseDate(norm),
    nbInvites: parseGuestCount(norm),
    typeEvenement: parseType(norm),
  }
}
