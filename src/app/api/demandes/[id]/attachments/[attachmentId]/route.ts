import { auth } from '@/auth'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { supabaseAdmin } from '@/lib/db/supabase'

const BUCKET = 'pieces-jointes'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> },
) {
  const session = await auth()
  if (!session?.user?.restaurantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const restaurantId = session.user.restaurantId

  const { id: demandeId, attachmentId } = await params

  const piece = await prisma.pieceJointe.findFirst({
    where: { id: attachmentId, demandeId, restaurantId },
    select: { id: true, storageUrl: true },
  })
  if (!piece) return NextResponse.json({ error: 'Fichier introuvable' }, { status: 404 })

  // Extract path from public URL: everything after /object/public/{bucket}/
  const marker = `/object/public/${BUCKET}/`
  const markerIdx = piece.storageUrl.indexOf(marker)
  if (markerIdx !== -1) {
    const storagePath = piece.storageUrl.slice(markerIdx + marker.length)
    await supabaseAdmin().storage.from(BUCKET).remove([storagePath]).catch(() => null)
  }

  await prisma.pieceJointe.delete({ where: { id: attachmentId } })

  return new NextResponse(null, { status: 204 })
}
