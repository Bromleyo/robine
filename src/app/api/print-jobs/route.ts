import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { prisma } from '@/lib/db/prisma'
import { z } from 'zod'

const ContenuSchema = z.object({
  restaurantNom: z.string(),
  restaurantAdresse: z.string().nullish(),
  reference: z.string(),
  typeEvenement: z.string().nullish(),
  dateEvenement: z.string().nullish(),
  heureDebut: z.string().nullish(),
  heureFin: z.string().nullish(),
  nbInvites: z.number().nullish(),
  espacenom: z.string().nullish(),
  contactNom: z.string(),
  contactTelephone: z.string().nullish(),
  contactEmail: z.string(),
  contactSociete: z.string().nullish(),
  contraintesAlimentaires: z.array(z.string()),
  notes: z.string().nullish(),
  assigneeNom: z.string().nullish(),
})

const CreateSchema = z.object({
  demandeId: z.string(),
  imprimanteIp: z.string().nullish(),
  contenu: ContenuSchema,
})

function isHaAuth(req: NextRequest): boolean {
  const apiKey = process.env.PRINT_API_KEY
  if (!apiKey) return false
  const header = req.headers.get('authorization') ?? ''
  return header === `Bearer ${apiKey}`
}

export async function GET(req: NextRequest) {
  if (!isHaAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const restaurantId = searchParams.get('restaurantId')
  if (!restaurantId) return NextResponse.json({ error: 'restaurantId required' }, { status: 400 })

  const jobs = await prisma.printJob.findMany({
    where: { restaurantId, status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json(jobs)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.restaurantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as unknown
  const parsed = CreateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const job = await prisma.printJob.create({
    data: {
      restaurantId: session.user.restaurantId,
      demandeId: parsed.data.demandeId,
      contenu: parsed.data.contenu,
      imprimanteIp: parsed.data.imprimanteIp ?? null,
      status: 'PENDING',
    },
  })

  return NextResponse.json(job, { status: 201 })
}
