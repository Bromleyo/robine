require('dotenv').config({ path: require('path').resolve(process.cwd(), '.env') })
if (process.env.DIRECT_URL) process.env.DATABASE_URL = process.env.DIRECT_URL

const isDryRun = !process.argv.includes('--execute')

void (async () => {
  const { prisma } = require('../src/lib/db/prisma') as typeof import('../src/lib/db/prisma')

  const d = await prisma.demande.findFirst({
    where: { reference: 'DR-0065' },
    select: {
      id: true, reference: true, contactId: true,
      contact: { select: { id: true, email: true, nom: true } },
      threads: {
        select: {
          id: true,
          messages: { select: { id: true } },
        },
      },
    },
  })

  if (!d) { console.log('DR-0065 not found (already deleted?)'); process.exit(0) }
  console.log(`Found: ${d.reference} — contact ${d.contact?.email} — ${d.threads.length} thread(s)`)

  if (isDryRun) { console.log('\nDRY RUN — pass --execute to delete'); process.exit(0) }

  const msgIds = d.threads.flatMap((t: { id: string; messages: { id: string }[] }) => t.messages.map(m => m.id))

  if (msgIds.length) {
    const r = await prisma.message.deleteMany({ where: { id: { in: msgIds } } })
    console.log('messages deleted:', r.count)
  }
  for (const t of d.threads) {
    await prisma.thread.delete({ where: { id: t.id } })
    console.log('thread deleted:', t.id)
  }
  await prisma.notification.deleteMany({ where: { demandeId: d.id } })
  await prisma.demande.delete({ where: { id: d.id } })
  console.log('demande deleted:', d.reference)

  const otherDemandes = await prisma.demande.count({ where: { contactId: d.contactId } })
  if (otherDemandes === 0) {
    await prisma.contact.delete({ where: { id: d.contactId } })
    console.log('orphan contact deleted:', d.contact?.email)
  } else {
    console.log('contact kept (has other demandes):', otherDemandes)
  }

  await prisma.$disconnect()
})()
