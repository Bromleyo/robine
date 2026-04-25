import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'

export function verifyCronRequest(req: NextRequest): NextResponse | null {
  const provided = req.headers.get('x-cron-secret')
  const secret = process.env.CRON_SECRET

  if (!provided || !secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const a = Buffer.from(provided)
  const b = Buffer.from(secret)

  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return null
}
