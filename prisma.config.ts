import { defineConfig } from 'prisma/config'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env' })
dotenv.config({ path: '.env.local', override: false })

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    // URL directe (sans pooler) pour les migrations Prisma
    url: process.env.DIRECT_URL ?? '',
  },
})
