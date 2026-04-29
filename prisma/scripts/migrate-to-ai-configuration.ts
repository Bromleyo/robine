/**
 * Migration : RegleIA + AIPersonalization → AIConfiguration
 *
 * Usage:
 *   npx tsx prisma/migrations/scripts/migrate-to-ai-configuration.ts           # dry-run
 *   npx tsx prisma/migrations/scripts/migrate-to-ai-configuration.ts --execute  # execute
 */

import { PrismaClient, Prisma } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

const EXECUTE = process.argv.includes('--execute')

type MenuSource = { nom: string; prixCents?: number; prixParPersonne?: number }
type ReportLine = { restaurantId: string; nom: string; prix?: number; dbPrix?: number }

const skipped: ReportLine[] = []
const conflicts: ReportLine[] = []
const created: ReportLine[] = []
const aiConfigsCreated: string[] = []

async function run() {
  console.log(`Mode: ${EXECUTE ? 'EXECUTE' : 'DRY-RUN'}`)
  console.log('---')

  const restaurants = await prisma.restaurant.findMany({
    include: {
      reglesIA: true,
      aiPersonalization: true,
      menus: { select: { nom: true, prixCents: true } },
    },
  })

  for (const restaurant of restaurants) {
    console.log(`\nRestaurant: ${restaurant.nom} (${restaurant.id})`)

    const existing = await prisma.aIConfiguration.findUnique({
      where: { restaurantId: restaurant.id },
    })

    const regle = restaurant.reglesIA
    const personalization = restaurant.aiPersonalization
    const config = (regle?.config ?? {}) as Record<string, unknown>

    const supplements = (config.supplements ?? {}) as Prisma.JsonObject
    const acompte = (config.acompte ?? {}) as Prisma.JsonObject
    const cancellationConditions = typeof config.conditionsAnnulation === 'string'
      ? config.conditionsAnnulation
      : null

    const styleRules = personalization?.rulesMarkdown ?? null
    const styleMetadata = personalization
      ? { threadsAnalyzed: personalization.threadsAnalyzed, keywords: personalization.keywords }
      : null

    const setupCompleted = !!(regle || personalization)

    // Menu migration from RegleIA.config.menus blob
    const sourceMenus: MenuSource[] = Array.isArray(config.menus)
      ? (config.menus as MenuSource[])
      : []

    for (const sourceMenu of sourceMenus) {
      const sourcePrix = typeof sourceMenu.prixCents === 'number'
        ? sourceMenu.prixCents
        : typeof sourceMenu.prixParPersonne === 'number'
          ? sourceMenu.prixParPersonne * 100
          : null

      const dbMatch = restaurant.menus.find(m => m.nom === sourceMenu.nom)

      if (!dbMatch) {
        created.push({ restaurantId: restaurant.id, nom: sourceMenu.nom, prix: sourcePrix ?? undefined })
        if (EXECUTE && sourcePrix !== null) {
          await prisma.menu.create({
            data: { restaurantId: restaurant.id, nom: sourceMenu.nom, prixCents: sourcePrix },
          })
          console.log(`  [CRÉÉ] Menu "${sourceMenu.nom}"`)
        } else {
          console.log(`  [DRY-RUN CRÉER] Menu "${sourceMenu.nom}" (${sourcePrix ? Math.round(sourcePrix / 100) + '€' : '?'})`)
        }
      } else if (sourcePrix !== null && dbMatch.prixCents !== sourcePrix) {
        conflicts.push({ restaurantId: restaurant.id, nom: sourceMenu.nom, prix: sourcePrix, dbPrix: dbMatch.prixCents })
        console.log(`  [CONFLIT] Menu "${sourceMenu.nom}" — DB: ${Math.round(dbMatch.prixCents / 100)}€, source: ${Math.round(sourcePrix / 100)}€`)
      } else {
        skipped.push({ restaurantId: restaurant.id, nom: sourceMenu.nom })
        console.log(`  [SKIP] Menu "${sourceMenu.nom}" — déjà présent et prix identique`)
      }
    }

    if (EXECUTE) {
      const aiConfig = await prisma.aIConfiguration.upsert({
        where: { restaurantId: restaurant.id },
        update: { supplements, acompte, cancellationConditions, styleRules, styleMetadata: styleMetadata ?? undefined, setupCompleted },
        create: { restaurantId: restaurant.id, supplements, acompte, cancellationConditions, styleRules, styleMetadata: styleMetadata ?? undefined, setupCompleted },
      })
      console.log(`  [AIConfiguration] ${existing ? 'mise à jour' : 'créée'} (setupCompleted=${setupCompleted})`)

      // Dynamic import so tsx resolves the path at runtime
      const { compileAIPrompt } = await import('../../../src/lib/ai-configuration/compile.js')
      const compiled = await compileAIPrompt(restaurant.id)
      await prisma.aIConfiguration.update({
        where: { restaurantId: restaurant.id },
        data: { compiledPrompt: compiled },
      })
      console.log(`  [compiledPrompt] ${compiled.length} chars`)
      aiConfigsCreated.push(`${restaurant.nom} (${aiConfig.id})`)
    } else {
      console.log(`  [DRY-RUN] AIConfiguration ${existing ? 'serait mise à jour' : 'serait créée'} pour ${restaurant.nom}`)
      aiConfigsCreated.push(restaurant.nom)
    }
  }

  await generateReport()
  await prisma.$disconnect()
  await pool.end()
}

async function generateReport() {
  const lines: string[] = [
    `# PHASE_1_MIGRATION_REPORT`,
    ``,
    `Mode: **${EXECUTE ? 'EXECUTE' : 'DRY-RUN'}**`,
    `Date: ${new Date().toISOString()}`,
    ``,
    `## AIConfiguration ${EXECUTE ? 'créées/mises à jour' : 'à créer'} (${aiConfigsCreated.length})`,
    ...aiConfigsCreated.map(r => `- ${r}`),
    ``,
    `## Menus skippés (${skipped.length})`,
    ...skipped.map(s => `- "${s.nom}" [${s.restaurantId}] — prix identique, déjà présent`),
    ``,
    `## Conflits à résoudre manuellement (${conflicts.length})`,
    ...(conflicts.length === 0
      ? ['Aucun conflit.']
      : conflicts.map(c => {
          const db = c.dbPrix != null ? Math.round(c.dbPrix / 100) : '?'
          const src = c.prix != null ? Math.round(c.prix / 100) : '?'
          return `- "${c.nom}" [${c.restaurantId}] — prix DB: ${db}€, prix source: ${src}€ → **ACTION REQUISE**`
        })),
    ``,
    `## Menus créés (${created.length})`,
    ...created.map(c => `- "${c.nom}" [${c.restaurantId}] — ${c.prix != null ? Math.round(c.prix / 100) + '€' : '?'}`),
  ]

  const reportPath = path.resolve(process.cwd(), 'PHASE_1_MIGRATION_REPORT.md')
  fs.writeFileSync(reportPath, lines.join('\n'))
  console.log(`\nRapport écrit : ${reportPath}`)

  if (conflicts.length > 0) {
    console.log(`\n⚠️  ${conflicts.length} conflit(s) — résoudre avant --execute.`)
    process.exit(1)
  }
}

run().catch(e => { console.error(e); process.exit(1) })
