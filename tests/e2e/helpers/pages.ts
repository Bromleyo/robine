/**
 * Page Object Model (POM) definitions for Robin v2 E2E tests.
 *
 * Each class wraps a specific page/route. Locators prefer data-testid
 * attributes and fall back to semantic selectors (role, text, placeholder)
 * where data-testid attributes have not yet been added to the source.
 *
 * DATA-TESTID ATTRIBUTES TO ADD TO SOURCE FILES
 * -----------------------------------------------
 * See "NEEDS data-testid" comments on each locator below for the exact
 * attribute + value to add to the corresponding source component.
 *
 * src/app/login/page.tsx
 *   line 12  <div style={{...}}>               → add data-testid="login-page"
 *   line 27  <h1 style={{...}}>Robin</h1>      → add data-testid="login-title"
 *   line 37  {error && <p style={{...}}>}      → add data-testid="login-error"
 *   line 52  <button onClick={...}>             → add data-testid="login-microsoft-btn"
 *
 * src/app/onboarding/page.tsx
 *   line 35  <div style={{display:'flex',...}}>  → add data-testid="onboarding-page"
 *   line 51  <h1 style={{...}}>Bienvenue...</h1> → add data-testid="onboarding-title"
 *   line 67  <input type="text" ...>             → add data-testid="onboarding-nom"
 *   line 88  <input type="email" ...>            → add data-testid="onboarding-email"
 *   line 108 {error && <p style={{...}}>}        → add data-testid="onboarding-error"
 *   line 122 <button type="submit" ...>          → add data-testid="onboarding-submit"
 *
 * src/app/(app)/dashboard/page.tsx  (or Topbar / DashboardClient component)
 *   Topbar component root element    → add data-testid="topbar"
 *   Stats grid wrapper <div>         → add data-testid="dashboard-stats"
 */

import { Page, Locator, expect } from '@playwright/test'

// ---------------------------------------------------------------------------
// LoginPage
// ---------------------------------------------------------------------------

export class LoginPage {
  readonly page: Page

  readonly root: Locator           // NEEDS data-testid="login-page"
  readonly title: Locator          // NEEDS data-testid="login-title"
  readonly errorMessage: Locator   // NEEDS data-testid="login-error"
  readonly microsoftBtn: Locator   // NEEDS data-testid="login-microsoft-btn"

  constructor(page: Page) {
    this.page = page
    this.root         = page.locator('[data-testid="login-page"]')
    this.title        = page.locator('[data-testid="login-title"]')
    this.errorMessage = page.locator('[data-testid="login-error"]')
    this.microsoftBtn = page.locator('[data-testid="login-microsoft-btn"]')
  }

  // Fallback locators used when data-testid is not yet in the source
  get titleFallback(): Locator {
    return this.page.getByRole('heading', { name: 'Robin' })
  }

  get microsoftBtnFallback(): Locator {
    return this.page.getByRole('button', { name: /connexion avec microsoft/i })
  }

  get errorFallback(): Locator {
    // The error paragraph text contains either the AccessDenied message or the
    // generic fallback — match either via a partial string
    return this.page.locator('p', { hasText: /accès refusé|erreur est survenue/i })
  }

  async goto(): Promise<void> {
    await this.page.goto('/login')
  }

  async waitForReady(): Promise<void> {
    await expect(this.page).toHaveURL(/\/login/)
    await expect(this.titleFallback).toBeVisible()
    await expect(this.microsoftBtnFallback).toBeVisible()
  }

  async clickMicrosoftLogin(): Promise<void> {
    await this.microsoftBtnFallback.click()
  }
}

// ---------------------------------------------------------------------------
// OnboardingPage
// ---------------------------------------------------------------------------

export class OnboardingPage {
  readonly page: Page

  readonly root: Locator           // NEEDS data-testid="onboarding-page"
  readonly title: Locator          // NEEDS data-testid="onboarding-title"
  readonly nomInput: Locator       // NEEDS data-testid="onboarding-nom"
  readonly emailInput: Locator     // NEEDS data-testid="onboarding-email"
  readonly errorMessage: Locator   // NEEDS data-testid="onboarding-error"
  readonly submitBtn: Locator      // NEEDS data-testid="onboarding-submit"

  constructor(page: Page) {
    this.page = page
    this.root         = page.locator('[data-testid="onboarding-page"]')
    this.title        = page.locator('[data-testid="onboarding-title"]')
    this.nomInput     = page.locator('[data-testid="onboarding-nom"]')
    this.emailInput   = page.locator('[data-testid="onboarding-email"]')
    this.errorMessage = page.locator('[data-testid="onboarding-error"]')
    this.submitBtn    = page.locator('[data-testid="onboarding-submit"]')
  }

  // Fallback locators
  get titleFallback(): Locator {
    return this.page.getByRole('heading', { name: /bienvenue sur robin/i })
  }

  get nomInputFallback(): Locator {
    return this.page.getByPlaceholder('Le Robin')
  }

  get emailInputFallback(): Locator {
    return this.page.getByPlaceholder('groupes@monrestaurant.fr')
  }

  get submitBtnFallback(): Locator {
    return this.page.getByRole('button', { name: /créer mon espace/i })
  }

  get errorFallback(): Locator {
    return this.page.locator('p', { hasText: /erreur|requis/i })
  }

  async goto(): Promise<void> {
    await this.page.goto('/onboarding')
  }

  async waitForReady(): Promise<void> {
    await expect(this.page).toHaveURL(/\/onboarding/)
    await expect(this.titleFallback).toBeVisible()
    await expect(this.nomInputFallback).toBeVisible()
    await expect(this.emailInputFallback).toBeVisible()
    await expect(this.submitBtnFallback).toBeVisible()
  }

  /**
   * Fills and submits the onboarding form, waiting for the API response.
   * Resolves once the POST /api/onboarding response arrives.
   */
  async fillAndSubmit(nom: string, emailGroupes: string): Promise<void> {
    await this.nomInputFallback.fill(nom)
    await this.emailInputFallback.fill(emailGroupes)

    const responsePromise = this.page.waitForResponse(
      (res) =>
        res.url().includes('/api/onboarding') &&
        res.request().method() === 'POST',
    )
    await this.submitBtnFallback.click()
    await responsePromise
  }

  /** Returns the visible error text, or null if no error banner is shown. */
  async getErrorText(): Promise<string | null> {
    const visible = await this.errorFallback.isVisible().catch(() => false)
    return visible ? this.errorFallback.textContent() : null
  }
}

// ---------------------------------------------------------------------------
// DashboardPage
// ---------------------------------------------------------------------------

export class DashboardPage {
  readonly page: Page

  readonly topbar: Locator      // NEEDS data-testid="topbar"
  readonly stats: Locator       // NEEDS data-testid="dashboard-stats"

  constructor(page: Page) {
    this.page = page
    this.topbar = page.locator('[data-testid="topbar"]')
    this.stats  = page.locator('[data-testid="dashboard-stats"]')
  }

  // Fallback: Topbar receives title="Tableau de bord" as a prop
  get titleFallback(): Locator {
    return this.page.getByText('Tableau de bord')
  }

  async goto(): Promise<void> {
    await this.page.goto('/dashboard')
  }

  async waitForReady(): Promise<void> {
    await expect(this.page).toHaveURL(/\/dashboard/)
    await expect(this.titleFallback).toBeVisible()
  }
}
