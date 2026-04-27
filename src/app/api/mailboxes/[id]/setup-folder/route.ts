import { auth } from '@/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getAppGraphToken } from '@/lib/graph/auth'

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'

const RULE_KEYWORDS = [
  'réservation', 'privatisation', 'événement', 'evenement',
  'mariage', 'anniversaire', 'séminaire', 'seminaire',
  'cocktail', 'baptême', 'bapteme', 'groupe', 'privatiser',
  'soirée', 'soiree', 'banquet', 'gala',
]

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user?.restaurantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const restaurantId = session.user.restaurantId

  const { id } = await params
  const body = await req.json() as { folderName?: string }
  const folderName = body.folderName?.trim() || 'Événements'

  const mailbox = await prisma.outlookMailbox.findFirst({
    where: { id, restaurantId },
    select: { id: true, email: true },
  })
  if (!mailbox) return NextResponse.json({ error: 'Boîte introuvable' }, { status: 404 })

  let token: string
  try {
    token = await getAppGraphToken()
  } catch {
    return NextResponse.json({ error: 'Erreur token Graph' }, { status: 500 })
  }

  // Resolve or create folder
  let folderId: string | null = null
  let folderCreated = false

  const createRes = await fetch(
    `${GRAPH_BASE}/users/${encodeURIComponent(mailbox.email)}/mailFolders`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: folderName }),
    },
  )

  if (createRes.ok) {
    const data = await createRes.json() as { id: string }
    folderId = data.id
    folderCreated = true
  } else {
    // Folder may already exist — look it up
    const findRes = await fetch(
      `${GRAPH_BASE}/users/${encodeURIComponent(mailbox.email)}/mailFolders` +
      `?$filter=${encodeURIComponent(`displayName eq '${folderName}'`)}&$top=1`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    if (findRes.ok) {
      const findData = await findRes.json() as { value: { id: string }[] }
      folderId = findData.value[0]?.id ?? null
    }
  }

  if (!folderId) {
    return NextResponse.json({ error: 'Impossible de créer ou trouver le dossier Outlook' }, { status: 500 })
  }

  // Create inbox rule
  let ruleCreated = false
  const ruleRes = await fetch(
    `${GRAPH_BASE}/users/${encodeURIComponent(mailbox.email)}/mailFolders/inbox/messageRules`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: `Robin — ${folderName}`,
        sequence: 1,
        isEnabled: true,
        conditions: { subjectContains: RULE_KEYWORDS },
        actions: {
          moveToFolder: folderId,
          stopProcessingRules: false,
        },
      }),
    },
  )
  if (ruleRes.ok) ruleCreated = true

  await prisma.outlookMailbox.update({ where: { id }, data: { ragFolderName: folderName } })

  return NextResponse.json({ folderName, folderCreated, ruleCreated })
}
