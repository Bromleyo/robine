import { auth } from '@/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireRole } from '@/lib/auth/require-role'
import { put } from '@vercel/blob'

const MAX_BYTES = 5 * 1024 * 1024

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.restaurantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const forbidden = requireRole(session.user.role, 'RESPONSABLE')
  if (forbidden) return forbidden

  const { id } = await params

  const menu = await prisma.menu.findFirst({
    where: { id, restaurantId: session.user.restaurantId },
    select: { id: true, nom: true },
  })
  if (!menu) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const formData = await req.formData()
  const file = formData.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'Fichier manquant' }, { status: 400 })

  if (file.type !== 'application/pdf') {
    return NextResponse.json({ error: 'Seuls les fichiers PDF sont acceptés' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Fichier trop volumineux (max 5 MB)' }, { status: 400 })
  }

  const safeName = menu.nom.replace(/[^a-z0-9]/gi, '-').toLowerCase()
  const blob = await put(
    `menus/${session.user.restaurantId}/${safeName}-${id.slice(0, 8)}.pdf`,
    file,
    { access: 'public', contentType: 'application/pdf' },
  )

  await prisma.menu.update({ where: { id }, data: { pdfUrl: blob.url } })

  return NextResponse.json({ pdfUrl: blob.url })
}
