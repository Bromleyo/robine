#!/usr/bin/env npx ts-node
/**
 * Migration: seed serviceType defaults on existing Menu rows + recompile compiledPrompt
 * Usage: npx ts-node prisma/migrations/scripts/migrate-menu-service-types.ts [--execute]
 */
import { PrismaClient } from '@prisma/client'
import { compileAIPrompt } from '../../../src/lib/ai-configuration/compile'

const prisma = new PrismaClient()
const DRY_RUN = !process.argv.includes('--execute')

async function main() {
  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'EXECUTE'}`)

  const menus = await prisma.menu.findMany({
    select: { id: true, restaurantId: true, nom: true, minConvives: true },
  })

  console.log(`\n${menus.length} menus trouvés`)

  for (const m of menus) {
    const choixUniqueMinPax = m.minConvives ?? 1
    console.log(`  ${m.nom} (${m.id.slice(0, 8)}) → serviceType=ASSIS choixUniqueDispo=true choixUniqueMinPax=${choixUniqueMinPax}`)
    if (!DRY_RUN) {
      await prisma.menu.update({
        where: { id: m.id },
        data: {
          serviceType: 'ASSIS',
          choixUniqueDispo: true,
          choixUniqueMinPax,
          choixMultipleDispo: false,
          choixMultipleMinPax: null,
        },
      })
    }
  }

  // Recompile compiledPrompt for all restaurants with AIConfiguration
  const configs = await prisma.aIConfiguration.findMany({
    select: { restaurantId: true },
  })
  console.log(`\n${configs.length} AIConfiguration à recompiler`)

  for (const c of configs) {
    if (!DRY_RUN) {
      const compiled = await compileAIPrompt(c.restaurantId)
      await prisma.aIConfiguration.update({
        where: { restaurantId: c.restaurantId },
        data: { compiledPrompt: compiled },
      })
      console.log(`  ${c.restaurantId} → compiledPrompt recompilé (${compiled.length} chars)`)
    } else {
      console.log(`  ${c.restaurantId} → compiledPrompt serait recompilé`)
    }
  }

  console.log('\nDone.')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
