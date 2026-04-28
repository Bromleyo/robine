import { auth } from '@/auth'
import { NextRequest, NextResponse } from 'next/server'
import { put } from '@vercel/blob'

const MAX_BYTES = 10 * 1024 * 1024

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.restaurantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })
  if (file.type !== 'application/pdf') return NextResponse.json({ error: 'PDF uniquement' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Fichier trop lourd (max 10 Mo)' }, { status: 400 })

  const safeName = file.name.replace(/[^a-z0-9.]/gi, '-').toLowerCase()
  const blob = await put(
    `attachments/temp/${session.user.restaurantId}/${Date.now()}-${safeName}`,
    file,
    { access: 'public', contentType: 'application/pdf' },
  )

  return NextResponse.json({ url: blob.url, name: file.name })
}
