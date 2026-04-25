import { NextResponse } from 'next/server'

type Role = 'ADMIN' | 'RESPONSABLE' | 'OBSERVATEUR'

const ROLE_HIERARCHY: Record<Role, number> = {
  ADMIN: 3,
  RESPONSABLE: 2,
  OBSERVATEUR: 1,
}

export function requireRole(
  sessionRole: string | null | undefined,
  minimumRole: Role,
): NextResponse | null {
  const level = ROLE_HIERARCHY[sessionRole as Role] ?? 0
  if (level < ROLE_HIERARCHY[minimumRole]) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return null
}
