import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'

export function verifyCronRequest(req: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Vercel sends: Authorization: Bearer <CRON_SECRET>
  const authHeader = req.headers.get('authorization') ?? ''
  const provided = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''

  if (!provided) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const a = Buffer.from(provided)
  const b = Buffer.from(secret)

  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return null
}
