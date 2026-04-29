#!/usr/bin/env npx tsx
import * as dotenv from 'dotenv'
import * as path from 'path'
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'
import { compileAIPrompt } from '../../../src/lib/ai-configuration/compile'

dotenv.config({ path: path.resolve(process.cwd(), '.env') })
dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), override: true })

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  const restaurantId = 'cmoecboxx000104jls85sji8n'
  const compiled = await compileAIPrompt(restaurantId)
  await prisma.aIConfiguration.update({ where: { restaurantId }, data: { compiledPrompt: compiled } })
  console.log(`\n✅ compiledPrompt mis à jour — ${compiled.length} chars\n`)
  console.log(compiled.slice(0, 1500))
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => { void prisma.$disconnect(); void pool.end() })
