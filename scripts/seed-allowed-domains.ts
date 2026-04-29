/**
 * Seed les allowedDomains du restaurant cmoecboxx (Le Robin) pour activer
 * l'auto-attachement SSO via le domaine de l'email au login.
 *
 * Sans cette seed, info@le-robin.fr et lucia@lerobin78.onmicrosoft.com
 * ne sont pas reconnus par attachUserToMatchingRestaurant.
 *
 * Usage:
 *   npx tsx scripts/seed-allowed-domains.ts              # dry-run
 *   npx tsx scripts/seed-allowed-domains.ts --execute    # mise à jour réelle
 */

require('dotenv').config({ path: require('path').resolve(process.cwd(), '.env') })
if (process.env.DIRECT_URL) process.env.DATABASE_URL = process.env.DIRECT_URL

const RESTAURANT_ID = 'cmoecboxx000104jls85sji8n'
const DOMAINS_TO_ADD = ['le-robin.fr', 'lerobin78.onmicrosoft.com']

const isDryRun = !process.argv.includes('--execute')

void (async () => {
  const { prisma } = require('../src/lib/db/prisma') as typeof import('../src/lib/db/prisma')

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: RESTAURANT_ID },
    select: { id: true, nom: true, allowedDomains: true },
  })

  if (!restaurant) {
    console.error(`[seed] restaurant ${RESTAURANT_ID} introuvable`)
    process.exit(1)
  }

  const current = new Set(restaurant.allowedDomains.map(d => d.toLowerCase()))
  const merged = Array.from(new Set([...current, ...DOMAINS_TO_ADD.map(d => d.toLowerCase())]))

  console.log(`[seed] restaurant : ${restaurant.nom} (${restaurant.id})`)
  console.log(`[seed] avant      :`, restaurant.allowedDomains)
  console.log(`[seed] après      :`, merged)
  console.log(`[seed] dry-run    : ${isDryRun}`)

  const noop = merged.length === restaurant.allowedDomains.length &&
    restaurant.allowedDomains.every(d => current.has(d.toLowerCase()))

  if (noop) {
    console.log('[seed] aucun changement nécessaire')
    process.exit(0)
  }

  if (isDryRun) {
    console.log('[seed] dry-run : aucune écriture. Relance avec --execute pour appliquer.')
    process.exit(0)
  }

  await prisma.restaurant.update({
    where: { id: RESTAURANT_ID },
    data: { allowedDomains: merged },
  })

  console.log('[seed] OK : allowedDomains mis à jour.')
  process.exit(0)
})().catch(err => {
  console.error('[seed] échec:', err)
  process.exit(1)
})
