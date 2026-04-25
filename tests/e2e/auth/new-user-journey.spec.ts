/**
 * E2E — Connexion et parcours d'un nouvel utilisateur
 *
 * Covers the full new-user journey:
 *   1. Unauthenticated redirect  →  / redirects to /login
 *   2. Login page rendering      →  form elements are visible
 *   3. Failed login              →  error query-param renders error banner
 *   4. Microsoft OAuth button    →  click initiates OAuth redirect (verified
 *                                   by destination URL, not flow completion)
 *   5. New user (no restaurant)  →  after session injection, / → /onboarding
 *   6. Onboarding form           →  submission POSTs to API and → /dashboard
 *   7. Onboarding error          →  API error keeps user on page with message
 *   8. HTML5 validation          →  empty submit does not hit the API
 *   9. Already-onboarded user    →  /login and /onboarding redirect → /dashboard
 *
 * AUTHENTICATION MOCK STRATEGY
 * ─────────────────────────────
 * The app uses Microsoft Entra ID exclusively — there is no credential
 * provider. Tests that require an authenticated session use injectSession()
 * from helpers/session.ts, which writes a locally-signed NextAuth JWT cookie
 * directly into the browser context, bypassing OAuth entirely.
 *
 * PREREQUISITE: AUTH_SECRET in .env.test must match the value used by the
 * running Next.js dev server. See helpers/session.ts for full setup details.
 *
 * DATA-TESTID ATTRIBUTES NEEDED IN SOURCE FILES
 * ──────────────────────────────────────────────
 * Tests currently use fallback semantic locators. Adding these attributes
 * makes selectors more resilient to UI copy/structure changes.
 *
 * src/app/login/page.tsx
 *   line 12   outer <div>                   → data-testid="login-page"
 *   line 27   <h1>Robin</h1>                → data-testid="login-title"
 *   line 37   error <p>                     → data-testid="login-error"
 *   line 52   <button onClick={signIn(...)}>→ data-testid="login-microsoft-btn"
 *
 * src/app/onboarding/page.tsx
 *   line 35   outer <div>                   → data-testid="onboarding-page"
 *   line 51   <h1>Bienvenue sur Robin</h1>  → data-testid="onboarding-title"
 *   line 67   <input type="text">  (nom)    → data-testid="onboarding-nom"
 *   line 88   <input type="email">          → data-testid="onboarding-email"
 *   line 108  error <p>                     → data-testid="onboarding-error"
 *   line 122  <button type="submit">        → data-testid="onboarding-submit"
 *
 * src/app/(app)/dashboard/page.tsx (or Topbar component)
 *   Topbar root element                     → data-testid="topbar"
 *   Stats grid <div>                        → data-testid="dashboard-stats"
 */

import { test, expect } from '@playwright/test'
import crypto from 'crypto'
import { LoginPage, OnboardingPage, DashboardPage } from '../helpers/pages'
import { injectSession, clearSession } from '../helpers/session'

// ---------------------------------------------------------------------------
// Shared fixture data — all synthetic, no production values
// ---------------------------------------------------------------------------

const NEW_USER = {
  userId: 'e2e-new-user-00000000',
  name: 'Test Utilisateur',
  email: 'test@le-robin.fr',
  // No restaurantId → middleware redirects to /onboarding
}

const ONBOARDED_USER = {
  userId: 'e2e-onboarded-00000000',
  name: 'Test Admin',
  email: 'admin@le-robin.fr',
  restaurantId: 'e2e-restaurant-00000000',
  role: 'ADMIN',
}

// ---------------------------------------------------------------------------
// 1. Unauthenticated redirects
// ---------------------------------------------------------------------------

test.describe('Utilisateur non connecté', () => {
  test('visiter / redirige vers /login', async ({ page }) => {
    await page.goto('/')
    // middleware.ts line 14: non-authenticated, non-/login path → /login
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })
  })

  test('visiter /dashboard redirige vers /login', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })
  })

  test('visiter /onboarding redirige vers /login', async ({ page }) => {
    await page.goto('/onboarding')
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })
  })
})

// ---------------------------------------------------------------------------
// 2. Login page rendering
// ---------------------------------------------------------------------------

test.describe('Page de connexion — rendu', () => {
  test('affiche le titre, le sous-titre et le bouton Microsoft', async ({ page }) => {
    const loginPage = new LoginPage(page)
    await loginPage.goto()
    await loginPage.waitForReady()

    await expect(loginPage.titleFallback).toHaveText('Robin')
    await expect(page.getByText('Gestion des groupes & événements')).toBeVisible()
    await expect(loginPage.microsoftBtnFallback).toBeEnabled()
  })

  test('aucune erreur visible par défaut', async ({ page }) => {
    const loginPage = new LoginPage(page)
    await loginPage.goto()
    await loginPage.waitForReady()

    await expect(loginPage.errorFallback).not.toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// 3. Failed login — error query parameter rendered by LoginContent
// ---------------------------------------------------------------------------

test.describe('Erreur de connexion', () => {
  test('?error=AccessDenied affiche le message accès refusé', async ({ page }) => {
    // NextAuth redirects here when signIn() callback returns false
    // (auth.config.ts line 19 — email domain check)
    await page.goto('/login?error=AccessDenied')

    const loginPage = new LoginPage(page)
    await loginPage.waitForReady()

    await expect(loginPage.errorFallback).toBeVisible()
    await expect(loginPage.errorFallback).toContainText(
      "Accès refusé. Ce compte n'est pas autorisé à accéder à Robin.",
    )
  })

  test('?error=<autre valeur> affiche le message générique', async ({ page }) => {
    await page.goto('/login?error=OAuthSignin')

    const loginPage = new LoginPage(page)
    await loginPage.waitForReady()

    await expect(loginPage.errorFallback).toBeVisible()
    await expect(loginPage.errorFallback).toContainText(
      'Une erreur est survenue. Réessayez.',
    )
  })
})

// ---------------------------------------------------------------------------
// 4. Microsoft OAuth button — verifies navigation initiation only
//    Full OAuth flow cannot be automated without a live Microsoft tenant.
// ---------------------------------------------------------------------------

test.describe('Bouton de connexion Microsoft', () => {
  test('cliquer initie la redirection vers NextAuth signin', async ({ page }) => {
    const loginPage = new LoginPage(page)
    await loginPage.goto()
    await loginPage.waitForReady()

    // signIn('microsoft-entra-id') POSTs to /api/auth/signin/microsoft-entra-id
    // which issues a 302 to login.microsoftonline.com. We only verify that the
    // button triggers navigation away from the /login page — we do not complete
    // the OAuth flow.
    const navigationStarted = page.waitForURL(
      (url) =>
        url.pathname.startsWith('/api/auth') ||
        url.hostname.includes('microsoftonline.com'),
      { timeout: 8_000 },
    )

    await loginPage.clickMicrosoftLogin()

    await navigationStarted.catch(() => {
      // Acceptable: external Microsoft URL may be blocked in test environment.
      // The key check below confirms the button triggered navigation.
    })

    const currentUrl = page.url()
    // Must have left /login or be heading through the NextAuth API route
    const navigatedAway =
      !currentUrl.match(/\/login$/) ||
      currentUrl.includes('/api/auth')
    expect(navigatedAway).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 5. New user (authenticated, restaurantId absent) → /onboarding
// ---------------------------------------------------------------------------

test.describe('Nouvel utilisateur sans restaurant', () => {
  test.beforeEach(async ({ context, page }) => {
    // Navigate first so the cookie domain (localhost) is established
    await page.goto('/login')
    await injectSession(context, NEW_USER)
  })

  test.afterEach(async ({ context }) => {
    await clearSession(context)
  })

  test('/ redirige vers /onboarding', async ({ page }) => {
    // middleware.ts line 19: logged-in user without restaurantId → /onboarding
    await page.goto('/')
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 10_000 })
  })

  test('/dashboard redirige vers /onboarding', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 10_000 })
  })

  test('/onboarding affiche le formulaire de configuration', async ({ page }) => {
    const onboardingPage = new OnboardingPage(page)
    await page.goto('/onboarding')
    await onboardingPage.waitForReady()

    await expect(onboardingPage.titleFallback).toBeVisible()
    await expect(page.getByText(/configurez votre établissement/i)).toBeVisible()
    await expect(onboardingPage.nomInputFallback).toBeVisible()
    await expect(onboardingPage.emailInputFallback).toBeVisible()
    await expect(onboardingPage.submitBtnFallback).toBeEnabled()
  })
})

// ---------------------------------------------------------------------------
// 6. Onboarding form — successful submission → /dashboard
// ---------------------------------------------------------------------------

test.describe("Soumission du formulaire d'onboarding", () => {
  test.beforeEach(async ({ context, page }) => {
    await page.goto('/login')
    await injectSession(context, NEW_USER)
  })

  test.afterEach(async ({ context }) => {
    await clearSession(context)
  })

  test('soumission valide crée le restaurant et redirige vers /dashboard', async ({
    page,
  }) => {
    const onboardingPage = new OnboardingPage(page)
    await page.goto('/onboarding')
    await onboardingPage.waitForReady()

    // Mock POST /api/onboarding — avoids hitting the real DB.
    // Remove this mock to run as a full integration test against a seeded DB.
    await page.route('**/api/onboarding', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, restaurantId: crypto.randomUUID() }),
      })
    })

    // Mock the session refresh that router.refresh() triggers after the POST.
    // The dashboard server component calls auth() server-side; we mock the
    // client-side session endpoint so NextAuth returns an onboarded session,
    // preventing a redirect back to /onboarding after the push('/dashboard').
    await page.route('**/api/auth/session**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: ONBOARDED_USER.userId,
            name: ONBOARDED_USER.name,
            email: ONBOARDED_USER.email,
            restaurantId: ONBOARDED_USER.restaurantId,
            role: ONBOARDED_USER.role,
          },
          expires: new Date(Date.now() + 86_400_000).toISOString(),
        }),
      })
    })

    await onboardingPage.fillAndSubmit('Le Robin Test', 'groupes@test.le-robin.fr')

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 })
  })

  test('le bouton affiche "Création en cours…" pendant la soumission', async ({
    page,
  }) => {
    const onboardingPage = new OnboardingPage(page)
    await page.goto('/onboarding')
    await onboardingPage.waitForReady()

    // Delay the response to observe the loading state
    await page.route('**/api/onboarding', async (route) => {
      await new Promise((r) => setTimeout(r, 1_500))
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, restaurantId: crypto.randomUUID() }),
      })
    })

    await onboardingPage.nomInputFallback.fill('Le Robin Test')
    await onboardingPage.emailInputFallback.fill('groupes@test.le-robin.fr')
    await onboardingPage.submitBtnFallback.click()

    // onboarding/page.tsx line 137: button text changes to "Création en cours…"
    // and disabled=true when loading=true
    await expect(
      page.getByRole('button', { name: /création en cours/i }),
    ).toBeVisible()
    await expect(onboardingPage.submitBtnFallback).toBeDisabled()
  })
})

// ---------------------------------------------------------------------------
// 7. Onboarding error — API failure keeps user on /onboarding
// ---------------------------------------------------------------------------

test.describe("Erreur lors de l'onboarding", () => {
  test.beforeEach(async ({ context, page }) => {
    await page.goto('/login')
    await injectSession(context, NEW_USER)
  })

  test.afterEach(async ({ context }) => {
    await clearSession(context)
  })

  test("une erreur 500 affiche le message d'erreur sans quitter /onboarding", async ({
    page,
  }) => {
    const onboardingPage = new OnboardingPage(page)
    await page.goto('/onboarding')
    await onboardingPage.waitForReady()

    await page.route('**/api/onboarding', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Une erreur interne est survenue' }),
      })
    })

    await onboardingPage.nomInputFallback.fill('Erreur Test')
    await onboardingPage.emailInputFallback.fill('erreur@test.le-robin.fr')
    await onboardingPage.submitBtnFallback.click()

    // onboarding/page.tsx lines 108–120: error paragraph rendered when error
    // state is set
    await expect(onboardingPage.errorFallback).toBeVisible({ timeout: 8_000 })
    await expect(onboardingPage.errorFallback).toContainText(
      'Une erreur interne est survenue',
    )
    await expect(page).toHaveURL(/\/onboarding/)
  })
})

// ---------------------------------------------------------------------------
// 8. HTML5 required validation — empty submit must not reach the API
// ---------------------------------------------------------------------------

test.describe('Validation HTML5 du formulaire', () => {
  test.beforeEach(async ({ context, page }) => {
    await page.goto('/login')
    await injectSession(context, NEW_USER)
  })

  test.afterEach(async ({ context }) => {
    await clearSession(context)
  })

  test('soumettre sans remplir les champs ne déclenche pas la requête API', async ({
    page,
  }) => {
    const onboardingPage = new OnboardingPage(page)
    await page.goto('/onboarding')
    await onboardingPage.waitForReady()

    let apiCalled = false
    await page.route('**/api/onboarding', () => {
      apiCalled = true
    })

    // Both inputs carry the `required` attribute (onboarding/page.tsx lines
    // 72 and 93). The browser's native validation prevents form submission.
    await onboardingPage.submitBtnFallback.click()
    await page.waitForTimeout(500)

    expect(apiCalled).toBe(false)
    await expect(page).toHaveURL(/\/onboarding/)
  })
})

// ---------------------------------------------------------------------------
// 9. Already-onboarded user bypasses /login and /onboarding
// ---------------------------------------------------------------------------

test.describe('Utilisateur déjà configuré', () => {
  test.beforeEach(async ({ context, page }) => {
    await page.goto('/login')
    await injectSession(context, ONBOARDED_USER)
  })

  test.afterEach(async ({ context }) => {
    await clearSession(context)
  })

  test('/login redirige vers /dashboard', async ({ page }) => {
    // middleware.ts line 24: fully configured user on /login → /dashboard
    await page.goto('/login')
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 })
  })

  test('/onboarding redirige vers /dashboard', async ({ page }) => {
    // middleware.ts line 24: fully configured user on /onboarding → /dashboard
    await page.goto('/onboarding')
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 })
  })

  test('/dashboard affiche "Tableau de bord" (nécessite une vraie DB)', async ({
    page,
  }) => {
    // The dashboard Server Component calls fetchDemandesKanban() against the
    // real DB — this test is skipped unless E2E_REAL_DB is set, which signals
    // a seeded test/staging database is available.
    test.skip(
      !process.env.E2E_REAL_DB,
      'Ignoré : E2E_REAL_DB absent. Pointer sur une vraie DB de test pour activer.',
    )

    const dashboardPage = new DashboardPage(page)
    await dashboardPage.goto()
    await dashboardPage.waitForReady()

    await expect(dashboardPage.titleFallback).toBeVisible()
    await expect(page.getByText('Toutes les demandes en cours')).toBeVisible()
  })
})
