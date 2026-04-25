/**
 * Session injection helpers for Robin v2 E2E tests.
 *
 * CONTEXT
 * -------
 * The app uses NextAuth v5 (beta) with Microsoft Entra ID as the SOLE
 * provider — there is no credential provider. It is therefore impossible
 * to drive a real OAuth flow in Playwright tests without a live Microsoft
 * tenant and a test account.
 *
 * STRATEGY
 * --------
 * NextAuth v5 stores sessions as signed JWTs in an HttpOnly cookie named
 * `authjs.session-token` (development) or `__Secure-authjs.session-token`
 * (production/HTTPS). The JWT is signed with AUTH_SECRET.
 *
 * We inject a pre-built, locally-signed JWT cookie directly into the
 * Playwright BrowserContext instead of going through the OAuth flow. This
 * requires:
 *
 *   1. AUTH_SECRET set to a known value in the test environment (.env.test)
 *   2. This helper builds and signs the JWT with the same secret.
 *   3. The middleware reads `req.auth?.user.restaurantId` — the JWT payload
 *      must mirror what NextAuth's `jwt` callback puts there (auth.config.ts
 *      lines 18–34).
 *
 * ENVIRONMENT VARIABLES NEEDED (.env.test or CI secrets)
 * -------------------------------------------------------
 *   AUTH_SECRET=<same value used by the Next.js dev process under test>
 *
 * IMPORTANT — JWE vs HS256
 * ------------------------
 * NextAuth v5 defaults to JWE (encrypted) tokens when AUTH_SECRET is set via
 * `npx auth secret`. If your dev setup uses JWE, this HS256-signed helper
 * will be rejected by the middleware. In that case either:
 *   a) Set NEXTAUTH_SECRET (legacy env var) which forces HS256 in dev, OR
 *   b) Replace signJwt() below with a proper JWE builder using the `jose`
 *      package (npm i -D jose) and encrypt with A256CBC-HS512 / dir.
 */

import { BrowserContext } from '@playwright/test'
import * as crypto from 'crypto'

// ---------------------------------------------------------------------------
// Minimal HS256 JWT — avoids adding jose/jsonwebtoken as a mandatory test dep.
// ---------------------------------------------------------------------------

function base64url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input) : input
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function signJwt(payload: object, secret: string): string {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = base64url(JSON.stringify(payload))
  const data = `${header}.${body}`
  const sig = crypto.createHmac('sha256', secret).update(data).digest()
  return `${data}.${base64url(sig)}`
}

export interface FakeSessionOptions {
  /** Internal DB user id (UUID string) */
  userId: string
  /** Display name shown in the UI */
  name: string
  /** Email — must match @le-robin.fr or @lerobin78.onmicrosoft.com per signIn callback */
  email: string
  /** Pass undefined to simulate a new user who has NOT completed onboarding */
  restaurantId?: string
  /** Membership role — defaults to 'ADMIN' */
  role?: string
}

/**
 * Injects a fake NextAuth session cookie into the given BrowserContext.
 *
 * The context must have already navigated to at least one page on the target
 * origin so that the cookie domain resolves correctly, OR you can call
 * page.goto('/') first and then call this before the redirect completes.
 *
 * @example
 * // In a test:
 * await page.goto('/')
 * await injectSession(context, {
 *   userId: 'test-user-id',
 *   name: 'Test User',
 *   email: 'test@le-robin.fr',
 *   restaurantId: 'test-restaurant-id',
 * })
 * await page.reload()
 */
export async function injectSession(
  context: BrowserContext,
  opts: FakeSessionOptions,
): Promise<void> {
  const secret = process.env.AUTH_SECRET
  if (!secret) {
    throw new Error(
      'AUTH_SECRET is not set. ' +
      'Add it to .env.test matching the value used by the Next.js dev server. ' +
      'See tests/e2e/helpers/session.ts for full setup instructions.',
    )
  }

  const now = Math.floor(Date.now() / 1000)
  const exp = now + 60 * 60 * 24 // 24 hours

  // Mirror the JWT shape produced after the `jwt` / `session` callbacks in
  // src/auth.config.ts (lines 18–34) run.
  const payload = {
    sub: opts.userId,
    name: opts.name,
    email: opts.email,
    picture: null,
    // Custom claims added by auth.config.ts session callback
    userId: opts.userId,
    nom: opts.name,
    avatarColor: '#9F1239',
    ...(opts.restaurantId
      ? { restaurantId: opts.restaurantId, role: opts.role ?? 'ADMIN' }
      : {}),
    iat: now,
    exp,
    jti: crypto.randomUUID(),
  }

  const token = signJwt(payload, secret)

  // NextAuth v5 cookie name differs by scheme
  const isHttps = (process.env.BASE_URL ?? 'http://localhost:3000').startsWith('https')
  const cookieName = isHttps
    ? '__Secure-authjs.session-token'
    : 'authjs.session-token'

  await context.addCookies([
    {
      name: cookieName,
      value: token,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      secure: isHttps,
      sameSite: 'Lax',
    },
  ])
}

/** Clears all auth cookies from the context (equivalent to signing out). */
export async function clearSession(context: BrowserContext): Promise<void> {
  await context.clearCookies()
}
