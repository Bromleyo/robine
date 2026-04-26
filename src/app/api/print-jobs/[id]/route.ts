import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { z } from 'zod'

const PatchSchema = z.object({
  status: z.enum(['DONE', 'ERROR']),
})

function isHaAuth(req: NextRequest): boolean {
  const apiKey = process.env.PRINT_API_KEY
  if (!apiKey) return false
  const header = req.headers.get('authorization') ?? ''
  return header === `Bearer ${apiKey}`
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isHaAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json() as unknown
  const parsed = PatchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const job = await prisma.printJob.updateMany({
    where: { id, status: 'PENDING' },
    data: { status: parsed.data.status },
  })

  if (job.count === 0) return NextResponse.json({ error: 'Not found or already processed' }, { status: 404 })

  return NextResponse.json({ ok: true })
}
