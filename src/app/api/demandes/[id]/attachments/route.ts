import { auth } from '@/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { supabaseAdmin } from '@/lib/db/supabase'
import { randomUUID } from 'crypto'

const BUCKET = 'pieces-jointes'
const MAX_SIZE = 20 * 1024 * 1024 // 20 MB

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.restaurantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const pieces = await prisma.pieceJointe.findMany({
    where: { demandeId: id, demande: { restaurantId: session.user.restaurantId } },
    orderBy: { createdAt: 'asc' },
    select: { id: true, filename: true, mimeType: true, sizeBytes: true, storageUrl: true, createdAt: true },
  })

  return NextResponse.json(pieces)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.restaurantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const restaurantId = session.user.restaurantId

  const { id: demandeId } = await params

  const demande = await prisma.demande.findFirst({
    where: { id: demandeId, restaurantId },
    select: { id: true },
  })
  if (!demande) return NextResponse.json({ error: 'Demande introuvable' }, { status: 404 })

  const ALLOWED_MIME = new Set([
    'application/pdf',
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ])

  const formData = await req.formData()
  const file = formData.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'Fichier manquant' }, { status: 400 })
  if (file.size > MAX_SIZE) return NextResponse.json({ error: 'Fichier trop volumineux (max 20 Mo)' }, { status: 413 })
  if (!ALLOWED_MIME.has(file.type)) return NextResponse.json({ error: 'Type de fichier non autorisé' }, { status: 415 })

  const ext = file.name.split('.').pop() ?? ''
  const storagePath = `${restaurantId}/${demandeId}/${randomUUID()}${ext ? `.${ext}` : ''}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const sb = supabaseAdmin()
  const { error: uploadError } = await sb.storage.from(BUCKET).upload(storagePath, buffer, {
    contentType: file.type || 'application/octet-stream',
  })
  if (uploadError) return NextResponse.json({ error: 'Erreur upload fichier' }, { status: 500 })

  const { data: urlData } = sb.storage.from(BUCKET).getPublicUrl(storagePath)

  const piece = await prisma.pieceJointe.create({
    data: {
      restaurantId,
      demandeId,
      storageUrl: urlData.publicUrl,
      filename: file.name,
      mimeType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
    },
    select: { id: true, filename: true, mimeType: true, sizeBytes: true, storageUrl: true, createdAt: true },
  })

  return NextResponse.json(piece, { status: 201 })
}
