#!/usr/bin/env npx tsx
/**
 * Import bulk de menus depuis menus-extracted.json vers Vercel Blob + DB
 * Usage : npx tsx prisma/migrations/scripts/import-menus-from-pdfs.ts
 */

import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'
import { put } from '@vercel/blob'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { compileAIPrompt } from '../../../src/lib/ai-configuration/compile'

dotenv.config({ path: path.resolve(process.cwd(), '.env') })
dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), override: true })

// --- Validation env vars ---
const REQUIRED_VARS = ['BLOB_READ_WRITE_TOKEN', 'DATABASE_URL']
const missing = REQUIRED_VARS.filter(v => !process.env[v])
if (missing.length > 0) {
  console.error(`\n❌ Variables d'environnement manquantes : ${missing.join(', ')}`)
  if (missing.includes('BLOB_READ_WRITE_TOKEN')) {
    console.error('   → Pour récupérer BLOB_READ_WRITE_TOKEN depuis Vercel :')
    console.error('     vercel env pull .env.local')
  }
  process.exit(1)
}

// --- Chargement du JSON ---
const jsonPath = path.resolve(process.cwd(), 'menus-extracted.json')
if (!fs.existsSync(jsonPath)) {
  console.error(`\n❌ Fichier introuvable : menus-extracted.json (à la racine du projet)`)
  process.exit(1)
}

interface MenuEntry {
  filename: string
  filepath: string
  data: {
    nom: string
    description: string | null
    prixCents: number
    serviceType: 'ASSIS' | 'BUFFET' | 'COCKTAIL'
    choixUniqueDispo: boolean
    choixUniqueMinPax: number | null
    choixMultipleDispo: boolean
    choixMultipleMinPax: number | null
    minConvives: number | null
    maxConvives: number | null
    regimesSupportes: string[]
  }
}

interface ExtractedFile {
  restaurantId: string
  menus: MenuEntry[]
}

const extracted = JSON.parse(fs.readFileSync(jsonPath, 'utf-8')) as ExtractedFile
const { restaurantId, menus } = extracted

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log(`\n📋 menus-extracted.json : ${menus.length} menus`)
  console.log(`🏠 Restaurant : ${restaurantId}\n`)

  const errors: { filename: string; error: string }[] = []
  let created = 0

  for (const entry of menus) {
    const { filename, filepath, data } = entry
    console.log(`⏳ ${filename}`)

    // Vérification fichier PDF
    if (!fs.existsSync(filepath)) {
      const msg = `PDF introuvable : ${filepath}`
      console.log(`   ❌ ${msg}\n`)
      errors.push({ filename, error: msg })
      continue
    }

    try {
      // a) Upload Vercel Blob
      const fileBuffer = fs.readFileSync(filepath)
      const safeName = filename.replace(/[^a-z0-9.]/gi, '-').toLowerCase()
      const blob = await put(
        `menus/${restaurantId}/${safeName}`,
        fileBuffer,
        { access: 'public', contentType: 'application/pdf' },
      )
      console.log(`   ☁️  Blob : ${blob.url}`)

      // b) Création en DB
      const menu = await prisma.menu.create({
        data: {
          restaurantId,
          nom: data.nom,
          description: data.description ?? null,
          prixCents: data.prixCents,
          serviceType: data.serviceType,
          choixUniqueDispo: data.choixUniqueDispo,
          choixUniqueMinPax: data.choixUniqueMinPax ?? null,
          choixMultipleDispo: data.choixMultipleDispo,
          choixMultipleMinPax: data.choixMultipleMinPax ?? null,
          minConvives: data.minConvives ?? null,
          maxConvives: data.maxConvives ?? null,
          regimesSupportes: data.regimesSupportes,
          pdfUrl: blob.url,
          actif: true,
        },
      })
      console.log(`   ✅ Menu '${menu.nom}' créé (id: ${menu.id})\n`)
      created++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.log(`   ❌ Erreur : ${msg}\n`)
      errors.push({ filename, error: msg })
    }
  }

  // Recompile le prompt IA si au moins un menu créé
  if (created > 0) {
    console.log('🔄 Recompilation du prompt IA...')
    try {
      const compiled = await compileAIPrompt(restaurantId)
      await prisma.aIConfiguration.upsert({
        where: { restaurantId },
        update: { compiledPrompt: compiled },
        create: {
          restaurantId,
          compiledPrompt: compiled,
          setupCompleted: false,
        },
      })
      console.log(`   ✅ compiledPrompt recompilé (${compiled.length} chars)\n`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.log(`   ❌ Erreur recompilation : ${msg}\n`)
    }
  }

  // Récap
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`✅ ${created} menu(s) créé(s)`)
  console.log(`❌ ${errors.length} erreur(s)`)
  if (errors.length > 0) {
    console.log('\nErreurs :')
    for (const e of errors) {
      console.log(`  - ${e.filename} : ${e.error}`)
    }
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => { void prisma.$disconnect(); void pool.end() })
