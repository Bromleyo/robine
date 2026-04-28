import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db/prisma'
import Topbar from '@/components/layout/topbar'
import AIConfigurationClient from '@/components/config/ai-configuration-client'

export default async function ConfigurationIAPage() {
  const session = await auth()
  if (!session?.user?.restaurantId) redirect('/login')
  if (session.user.role !== 'ADMIN') redirect('/dashboard')

  const restaurantId = session.user.restaurantId

  const [rawConfig, espaces, menus, mailboxes, personalizationRecord] = await Promise.all([
    prisma.aIConfiguration.findUnique({
      where: { restaurantId },
      select: {
        setupCompleted: true,
        wizardStep: true,
        styleRules: true,
        customRules: true,
        compiledPrompt: true,
        styleMetadata: true,
        supplements: true,
        acompte: true,
        cancellationConditions: true,
        seuilsCA: true,
        margeMarchandise: true,
      },
    }),
    prisma.espace.findMany({
      where: { restaurantId },
      orderBy: [{ ordre: 'asc' }, { nom: 'asc' }],
    }),
    prisma.menu.findMany({
      where: { restaurantId },
      orderBy: [{ ordre: 'asc' }, { nom: 'asc' }],
    }),
    prisma.outlookMailbox.findMany({
      where: { restaurantId, actif: true },
      select: { id: true, email: true, displayName: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.aIPersonalization.findUnique({
      where: { restaurantId },
      include: { mailbox: { select: { email: true, displayName: true } } },
    }),
  ])

  const config = rawConfig
    ? {
        setupCompleted: rawConfig.setupCompleted,
        wizardStep: rawConfig.wizardStep,
        styleRules: rawConfig.styleRules,
        customRules: rawConfig.customRules,
        compiledPrompt: rawConfig.compiledPrompt,
        styleMetadata: (rawConfig.styleMetadata ?? null) as Record<string, unknown> | null,
        supplements: (rawConfig.supplements ?? {}) as Record<string, unknown>,
        acompte: (rawConfig.acompte ?? {}) as Record<string, unknown>,
        cancellationConditions: rawConfig.cancellationConditions,
        seuilsCA: (rawConfig.seuilsCA ?? {}) as Record<string, { midiSemaine: number; soirSemaine: number; midiWeekend: number; soirWeekend: number }>,
        margeMarchandise: rawConfig.margeMarchandise ?? 0.70,
      }
    : null

  const initialPersonalization = personalizationRecord
    ? {
        id: personalizationRecord.id,
        mailboxId: personalizationRecord.mailboxId,
        mailboxEmail: personalizationRecord.mailbox.email,
        mailboxDisplayName: personalizationRecord.mailbox.displayName,
        threadsAnalyzed: personalizationRecord.threadsAnalyzed,
        rulesMarkdown: personalizationRecord.rulesMarkdown,
        keywords: personalizationRecord.keywords,
        createdAt: personalizationRecord.createdAt.toISOString(),
      }
    : null

  return (
    <>
      <Topbar
        title="Configuration IA"
        subtitle="Paramètre Robin pour répondre comme toi"
      />
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px', maxWidth: 960 }}>
        <AIConfigurationClient
          config={config}
          espaces={espaces}
          menus={menus}
          mailboxes={mailboxes}
          initialPersonalization={initialPersonalization}
        />
      </div>
    </>
  )
}
