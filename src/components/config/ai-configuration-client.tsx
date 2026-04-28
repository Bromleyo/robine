'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import EspacesClient from './espaces-client'
import MenusClient from './menus-client'
import AIPersonalizationClient from './ai-personalization-client'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Espace {
  id: string; nom: string; capaciteMin: number; capaciteMax: number; description: string | null; actif: boolean
}
interface Menu {
  id: string; nom: string; prixCents: number; description: string | null; minConvives: number | null; maxConvives: number | null; actif: boolean
}
interface Mailbox { id: string; email: string; displayName: string | null }
interface AIConfigData {
  setupCompleted: boolean; wizardStep: number
  styleRules: string | null; customRules: string | null; compiledPrompt: string | null
  styleMetadata: Record<string, unknown> | null
  supplements: Record<string, unknown>; acompte: Record<string, unknown>
  cancellationConditions: string | null
}
interface PersonalizationData {
  id: string; mailboxId: string; mailboxEmail: string; mailboxDisplayName: string | null
  threadsAnalyzed: number; rulesMarkdown: string; keywords: string[]; createdAt: string
}
interface Props {
  config: AIConfigData | null
  espaces: Espace[]
  menus: Menu[]
  mailboxes: Mailbox[]
  initialPersonalization: PersonalizationData | null
}

// ── Helper ────────────────────────────────────────────────────────────────────

async function putConfig(data: Record<string, unknown>) {
  return fetch('/api/admin/ai-configuration', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

// ── Root ──────────────────────────────────────────────────────────────────────

export default function AIConfigurationClient(props: Props) {
  const router = useRouter()
  const [setupCompleted, setSetupCompleted] = useState(props.config?.setupCompleted ?? false)

  if (!setupCompleted) {
    return (
      <Wizard
        {...props}
        onComplete={() => { setSetupCompleted(true); router.refresh() }}
      />
    )
  }

  return (
    <Overview
      {...props}
      config={props.config!}
      onReset={() => setSetupCompleted(false)}
    />
  )
}

// ── Wizard ────────────────────────────────────────────────────────────────────

type WizardProps = Props & { onComplete: () => void }

function Wizard({ config, espaces, menus, mailboxes, initialPersonalization, onComplete }: WizardProps) {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(config?.wizardStep ?? 1)
  const [saving, setSaving] = useState(false)
  const [showReanalyze, setShowReanalyze] = useState(false)

  // Step 2 state
  const suppl = (config?.supplements ?? {}) as Record<string, number>
  const acc = (config?.acompte ?? {}) as { actif?: boolean; pourcentage?: number }
  const [vinEuros, setVinEuros] = useState(suppl.vinBouteilleCents ? String(suppl.vinBouteilleCents / 100) : '')
  const [enfantEuros, setEnfantEuros] = useState(suppl.menuEnfantCents ? String(suppl.menuEnfantCents / 100) : '')
  const [heuresEuros, setHeuresEuros] = useState(suppl.heuresSuppCentsParH ? String(suppl.heuresSuppCentsParH / 100) : '')
  const [acompteActif, setAcompteActif] = useState(acc.actif ?? false)
  const [acomptePct, setAcomptePct] = useState(acc.pourcentage ?? 30)
  const [conditions, setConditions] = useState(config?.cancellationConditions ?? '')

  // Step 4 state
  const [compiledPrompt, setCompiledPrompt] = useState(config?.compiledPrompt ?? null)
  const [localStyleRules, setLocalStyleRules] = useState(config?.styleRules ?? '')
  const [localCustomRules, setLocalCustomRules] = useState(config?.customRules ?? '')
  const [loadingPrompt, setLoadingPrompt] = useState(false)

  // Credit gate (Promise-based modal)
  const [creditGate, setCreditGate] = useState<'confirm' | 'insufficient' | null>(null)
  const creditGateResolve = useRef<((v: boolean) => void) | null>(null)

  const onBeforeAnalyze = async (): Promise<boolean> => {
    const r = await fetch('/api/admin/ai-credits')
    const data = await r.json() as { balance?: number }
    setCreditGate((data.balance ?? 0) < 1 ? 'insufficient' : 'confirm')
    return new Promise(resolve => { creditGateResolve.current = resolve })
  }

  const confirmCredit = async () => {
    const r = await fetch('/api/admin/ai-credits/consume', { method: 'POST' })
    setCreditGate(null)
    creditGateResolve.current?.(r.ok)
  }

  const cancelCredit = () => { setCreditGate(null); creditGateResolve.current?.(false) }

  const onAnalysisComplete = async (personalization: PersonalizationData) => {
    setLoadingPrompt(true)
    await putConfig({
      styleRules: personalization.rulesMarkdown,
      styleMetadata: { threadsAnalyzed: personalization.threadsAnalyzed, keywords: personalization.keywords },
      wizardStep: 4,
    })
    const r = await fetch('/api/admin/ai-configuration')
    const data = await r.json() as { config?: { compiledPrompt?: string; styleRules?: string } }
    setCompiledPrompt(data.config?.compiledPrompt ?? null)
    setLocalStyleRules(data.config?.styleRules ?? personalization.rulesMarkdown)
    setLoadingPrompt(false)
    setCurrentStep(4)
  }

  const goToStep2 = async () => {
    setSaving(true)
    await putConfig({ wizardStep: 2 })
    setSaving(false)
    setCurrentStep(2)
  }

  const saveStep2AndGoTo3 = async () => {
    setSaving(true)
    await putConfig({
      supplements: {
        ...(vinEuros ? { vinBouteilleCents: Math.round(Number(vinEuros) * 100) } : {}),
        ...(enfantEuros ? { menuEnfantCents: Math.round(Number(enfantEuros) * 100) } : {}),
        ...(heuresEuros ? { heuresSuppCentsParH: Math.round(Number(heuresEuros) * 100) } : {}),
      },
      acompte: { actif: acompteActif, pourcentage: acomptePct },
      cancellationConditions: conditions || null,
      wizardStep: 3,
    })
    setSaving(false)
    setCurrentStep(3)
  }

  const skipStep3AndLoadStep4 = async () => {
    setSaving(true)
    await putConfig({ wizardStep: 4 })
    setLoadingPrompt(true)
    const r = await fetch('/api/admin/ai-configuration')
    const data = await r.json() as { config?: { compiledPrompt?: string; styleRules?: string; customRules?: string } }
    setCompiledPrompt(data.config?.compiledPrompt ?? null)
    setLocalStyleRules(data.config?.styleRules ?? '')
    setLocalCustomRules(data.config?.customRules ?? '')
    setLoadingPrompt(false)
    setSaving(false)
    setCurrentStep(4)
  }

  const saveStep4AndGoTo5 = async () => {
    setSaving(true)
    await putConfig({ styleRules: localStyleRules || null, customRules: localCustomRules || null, wizardStep: 5 })
    setSaving(false)
    setCurrentStep(5)
  }

  const complete = async () => {
    setSaving(true)
    await putConfig({ setupCompleted: true, wizardStep: 5 })
    setSaving(false)
    onComplete()
  }

  // Step indicator
  const STEPS = ['Espaces', 'Menus', 'Style', 'Ajustements', 'Terminé']
  const stepIndicator = (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 32 }}>
      {STEPS.map((label, i) => {
        const num = i + 1
        const done = currentStep > num
        const active = currentStep === num
        return (
          <div key={num} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', display: 'grid', placeItems: 'center',
                fontSize: 12, fontWeight: 600,
                background: done || active ? 'var(--accent)' : 'var(--surface-sunken)',
                color: done || active ? '#fff' : 'var(--ink-400)',
                border: done || active ? 'none' : '1px solid var(--border)',
              }}>
                {done ? '✓' : num}
              </div>
              <div style={{ fontSize: 11, color: active ? 'var(--accent-ink)' : 'var(--ink-400)', fontWeight: active ? 550 : 400, whiteSpace: 'nowrap' }}>
                {label}
              </div>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{ width: 40, height: 1, background: done ? 'var(--accent)' : 'var(--border)', margin: '0 4px', marginBottom: 18 }} />
            )}
          </div>
        )
      })}
    </div>
  )

  const banner = (text: string) => (
    <div style={{ padding: '10px 14px', background: 'var(--surface-sunken)', border: '1px solid var(--hairline)', borderRadius: 'var(--r-sm)', fontSize: 13, color: 'var(--ink-600)', marginBottom: 24 }}>
      {text}
    </div>
  )

  const creditGateModal = creditGate ? (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'var(--surface)', borderRadius: 'var(--r-sm)', padding: '28px 32px', maxWidth: 420, width: '100%' }}>
        {creditGate === 'insufficient' ? (
          <>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Crédits insuffisants</div>
            <p style={{ fontSize: 13, color: 'var(--ink-600)', lineHeight: 1.6, marginBottom: 24 }}>
              Tu n&apos;as plus de crédits IA disponibles. Cette analyse consomme 1 crédit.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={cancelCredit} style={S.btnSecondary}>Fermer</button>
              <Link href="/credits" style={{ ...S.btnPrimary, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>Acheter des crédits</Link>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Confirmer l&apos;analyse</div>
            <p style={{ fontSize: 13, color: 'var(--ink-600)', lineHeight: 1.6, marginBottom: 24 }}>
              Cette analyse consommera 1 crédit IA. L&apos;opération prend 1 à 2 minutes et ne peut pas être annulée.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={cancelCredit} style={S.btnSecondary}>Annuler</button>
              <button onClick={confirmCredit} style={S.btnPrimary}>Confirmer</button>
            </div>
          </>
        )}
      </div>
    </div>
  ) : null

  // ── Step 1: Espaces ──────────────────────────────────────────────────────────
  if (currentStep === 1) {
    return (
      <div style={{ maxWidth: 720 }}>
        {creditGateModal}
        {stepIndicator}
        <h2 style={S.h2}>Présente-nous tes espaces de réception</h2>
        {banner("Robin utilisera ces informations pour orienter les clients selon la capacité qu'ils recherchent.")}
        <EspacesClient espaces={espaces} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
          <button
            onClick={goToStep2}
            disabled={espaces.length === 0 || saving}
            style={espaces.length === 0 || saving ? S.btnDisabled : S.btnPrimary}
          >
            {saving ? 'Enregistrement…' : 'Suivant →'}
          </button>
        </div>
      </div>
    )
  }

  // ── Step 2: Menus + règles admin ─────────────────────────────────────────────
  if (currentStep === 2) {
    return (
      <div style={{ maxWidth: 720 }}>
        {creditGateModal}
        {stepIndicator}
        <h2 style={S.h2}>Quels sont tes menus et tarifs ?</h2>
        {banner("Renseigne tes formules événementielles. Robin les citera dans ses réponses aux clients.")}

        <MenusClient menus={menus} />

        <div style={{ marginTop: 32, borderTop: '1px solid var(--hairline)', paddingTop: 28 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 16px' }}>Suppléments</h3>
          <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
            <div style={{ flex: 1 }}>
              <label style={S.label}>Vin (€/bouteille)</label>
              <input type="number" value={vinEuros} onChange={e => setVinEuros(e.target.value)} placeholder="45" style={S.input} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={S.label}>Menu enfant (€)</label>
              <input type="number" value={enfantEuros} onChange={e => setEnfantEuros(e.target.value)} placeholder="20" style={S.input} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={S.label}>Heures supp. (€/h)</label>
              <input type="number" value={heuresEuros} onChange={e => setHeuresEuros(e.target.value)} placeholder="150" style={S.input} />
            </div>
          </div>

          <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 12px' }}>Acompte</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--ink-800)' }}>
              <input type="checkbox" checked={acompteActif} onChange={e => setAcompteActif(e.target.checked)} style={{ cursor: 'pointer' }} />
              Demander un acompte à la réservation
            </label>
            {acompteActif && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="number"
                  value={acomptePct}
                  onChange={e => setAcomptePct(Number(e.target.value))}
                  style={{ ...S.input, width: 64 }}
                  min={1} max={100}
                />
                <span style={{ fontSize: 13, color: 'var(--ink-600)' }}>%</span>
              </div>
            )}
          </div>

          <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 8px' }}>Conditions d&apos;annulation</h3>
          <textarea
            value={conditions}
            onChange={e => setConditions(e.target.value)}
            placeholder="Ex : Annulation gratuite jusqu'à 30 jours avant l'événement. Au-delà, l'acompte est conservé."
            rows={3}
            style={{ ...S.input, resize: 'vertical', fontFamily: 'inherit' }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
          <button onClick={() => setCurrentStep(1)} style={S.btnSecondary}>← Retour</button>
          <button onClick={saveStep2AndGoTo3} disabled={saving} style={saving ? S.btnDisabled : S.btnPrimary}>
            {saving ? 'Enregistrement…' : 'Suivant →'}
          </button>
        </div>
      </div>
    )
  }

  // ── Step 3: Style IA ──────────────────────────────────────────────────────────
  if (currentStep === 3) {
    const hasExistingStyle = !!initialPersonalization && !!config?.styleRules

    if (hasExistingStyle && !showReanalyze) {
      const configDate = new Date(initialPersonalization!.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
      return (
        <div style={{ maxWidth: 640 }}>
          {creditGateModal}
          {stepIndicator}
          <h2 style={S.h2}>Ton style est déjà appris</h2>
          {banner("Robin a analysé tes mails et reproduit ton ton de communication. Tu peux continuer ou relancer une analyse.")}
          <div style={{ padding: '16px 20px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', marginBottom: 24 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink-900)', marginBottom: 4 }}>✓ Style appris</div>
            <div style={{ fontSize: 13, color: 'var(--ink-500)' }}>
              {initialPersonalization!.threadsAnalyzed} threads analysés · Configuré le {configDate}
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setCurrentStep(2)} style={S.btnSecondary}>← Retour</button>
              <button onClick={() => setShowReanalyze(true)} style={S.btnSecondary}>Relancer l&apos;analyse</button>
            </div>
            <button onClick={skipStep3AndLoadStep4} disabled={saving} style={saving ? S.btnDisabled : S.btnPrimary}>
              {saving ? 'Chargement…' : 'Continuer →'}
            </button>
          </div>
        </div>
      )
    }

    return (
      <div style={{ maxWidth: 900 }}>
        {creditGateModal}
        {stepIndicator}
        <h2 style={S.h2}>Apprends ton style depuis tes mails</h2>
        {banner("Robin va analyser tes échanges événementiels pour reproduire ton ton et tes formules. Cette étape consomme 1 crédit IA.")}
        {mailboxes.length === 0 ? (
          <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--ink-500)', fontSize: 14 }}>
            Aucune boîte mail configurée.{' '}
            <Link href="/config/mailboxes" style={{ color: 'var(--accent)' }}>Configurer une boîte mail</Link>
          </div>
        ) : (
          <AIPersonalizationClient
            mailboxes={mailboxes}
            initialPersonalization={null}
            onBeforeAnalyze={onBeforeAnalyze}
            onAnalysisComplete={onAnalysisComplete}
          />
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button
            onClick={() => { setShowReanalyze(false); setCurrentStep(2) }}
            style={S.btnSecondary}
          >
            ← Retour
          </button>
          <button onClick={skipStep3AndLoadStep4} disabled={saving} style={S.btnSecondary}>
            {saving ? 'Chargement…' : 'Passer cette étape'}
          </button>
        </div>
      </div>
    )
  }

  // ── Step 4: Vérification ─────────────────────────────────────────────────────
  if (currentStep === 4) {
    return (
      <div style={{ maxWidth: 720 }}>
        {creditGateModal}
        {stepIndicator}
        <h2 style={S.h2}>Vérifie et ajuste</h2>
        {banner("Voici le prompt généré pour Robin. Tu peux le laisser tel quel ou ajuster les règles ci-dessous.")}

        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-700)', marginBottom: 8 }}>Prompt généré</div>
          {loadingPrompt ? (
            <div style={{ padding: 20, background: 'var(--surface-sunken)', borderRadius: 'var(--r-sm)', color: 'var(--ink-500)', fontSize: 13 }}>
              Génération du prompt…
            </div>
          ) : (
            <div style={{ maxHeight: 260, overflowY: 'auto', padding: '14px 16px', background: 'var(--surface-sunken)', border: '1px solid var(--hairline)', borderRadius: 'var(--r-sm)', fontSize: 12, lineHeight: 1.7, color: 'var(--ink-700)', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
              {compiledPrompt ?? '(prompt vide — aucune donnée configurée)'}
            </div>
          )}
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={S.label}>Style et formules</label>
          <div style={{ padding: '8px 12px', marginBottom: 8, background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 'var(--r-sm)', fontSize: 12, color: '#92400E' }}>
            ⚠️ Modifier ce texte affecte le ton des réponses IA. Recommandé : laisser tel quel sauf si quelque chose vous gêne.
          </div>
          <textarea
            value={localStyleRules}
            onChange={e => setLocalStyleRules(e.target.value)}
            rows={6}
            style={{ ...S.input, resize: 'vertical', fontFamily: 'inherit' }}
            placeholder="Règles de style générées par Robin…"
          />
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={S.label}>Règles supplémentaires</label>
          <textarea
            value={localCustomRules}
            onChange={e => setLocalCustomRules(e.target.value)}
            rows={3}
            style={{ ...S.input, resize: 'vertical', fontFamily: 'inherit' }}
            placeholder="Ex : Toujours proposer de se rappeler le lendemain pour les demandes urgentes."
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <button onClick={() => setCurrentStep(3)} style={S.btnSecondary}>← Retour</button>
          <button onClick={saveStep4AndGoTo5} disabled={saving} style={saving ? S.btnDisabled : S.btnPrimary}>
            {saving ? 'Enregistrement…' : 'Suivant →'}
          </button>
        </div>
      </div>
    )
  }

  // ── Step 5: Récap ────────────────────────────────────────────────────────────
  const meta = (config?.styleMetadata ?? {}) as Record<string, unknown>
  const threadsCount = meta.threadsAnalyzed as number | undefined
  const activeMenus = menus.filter(m => m.actif).length

  return (
    <div style={{ maxWidth: 560 }}>
      {creditGateModal}
      {stepIndicator}
      <h2 style={S.h2}>Configuration terminée !</h2>
      {banner("Robin est prêt à générer des brouillons adaptés à ton restaurant.")}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 32 }}>
        <div style={S.recapItem}>✓ {espaces.length} espace{espaces.length > 1 ? 's' : ''} configuré{espaces.length > 1 ? 's' : ''}</div>
        <div style={S.recapItem}>✓ {activeMenus} menu{activeMenus > 1 ? 's' : ''} actif{activeMenus > 1 ? 's' : ''}</div>
        <div style={S.recapItem}>
          {threadsCount ? `✓ Style appris depuis ${threadsCount} threads` : '✓ Style standard (étape passée)'}
        </div>
        <div style={S.recapItem}>
          {localCustomRules || config?.customRules ? '✓ Règles supplémentaires définies' : '✓ Règles supplémentaires : aucune'}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={complete} disabled={saving} style={saving ? S.btnDisabled : S.btnPrimary}>
          {saving ? 'Finalisation…' : 'Voir ma configuration'}
        </button>
        <Link href="/dashboard" style={{ ...S.btnSecondary, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
          Aller au tableau de bord
        </Link>
      </div>
    </div>
  )
}

// ── Overview ──────────────────────────────────────────────────────────────────

type OverviewProps = Props & { config: AIConfigData; onReset: () => void }

function Overview({ config, espaces, menus, mailboxes, initialPersonalization, onReset }: OverviewProps) {
  const router = useRouter()
  const [showPromptModal, setShowPromptModal] = useState(false)
  const [showStyleModal, setShowStyleModal] = useState(false)
  const [showReanalyzeDrawer, setShowReanalyzeDrawer] = useState(false)
  const [editingStyle, setEditingStyle] = useState(false)
  const [editingCustom, setEditingCustom] = useState(false)
  const [localStyleRules, setLocalStyleRules] = useState(config.styleRules ?? '')
  const [localCustomRules, setLocalCustomRules] = useState(config.customRules ?? '')
  const [savingStyle, setSavingStyle] = useState(false)
  const [savingCustom, setSavingCustom] = useState(false)
  const [resetting, setResetting] = useState(false)

  const [creditGate, setCreditGate] = useState<'confirm' | 'insufficient' | null>(null)
  const creditGateResolve = useRef<((v: boolean) => void) | null>(null)

  const onBeforeAnalyze = async (): Promise<boolean> => {
    const r = await fetch('/api/admin/ai-credits')
    const data = await r.json() as { balance?: number }
    setCreditGate((data.balance ?? 0) < 1 ? 'insufficient' : 'confirm')
    return new Promise(resolve => { creditGateResolve.current = resolve })
  }

  const confirmCredit = async () => {
    const r = await fetch('/api/admin/ai-credits/consume', { method: 'POST' })
    setCreditGate(null)
    creditGateResolve.current?.(r.ok)
  }

  const cancelCredit = () => { setCreditGate(null); creditGateResolve.current?.(false) }

  const onReanalyzeComplete = async (personalization: PersonalizationData) => {
    await putConfig({
      styleRules: personalization.rulesMarkdown,
      styleMetadata: { threadsAnalyzed: personalization.threadsAnalyzed, keywords: personalization.keywords },
    })
    setShowReanalyzeDrawer(false)
    router.refresh()
  }

  const saveStyleRules = async () => {
    setSavingStyle(true)
    await putConfig({ styleRules: localStyleRules || null })
    setSavingStyle(false)
    setEditingStyle(false)
    router.refresh()
  }

  const saveCustomRules = async () => {
    setSavingCustom(true)
    await putConfig({ customRules: localCustomRules || null })
    setSavingCustom(false)
    setEditingCustom(false)
    router.refresh()
  }

  const handleReset = async () => {
    if (!confirm('Réinitialiser toute la configuration IA ? Cette action remet à zéro les règles, le style et les suppléments.')) return
    setResetting(true)
    await fetch('/api/admin/ai-configuration', { method: 'DELETE' })
    setResetting(false)
    onReset()
  }

  const meta = (config.styleMetadata ?? {}) as Record<string, unknown>
  const threadsAnalyzed = meta.threadsAnalyzed as number | undefined
  const mailboxLabel = initialPersonalization?.mailboxDisplayName ?? initialPersonalization?.mailboxEmail ?? null
  const stylePreview = localStyleRules ? localStyleRules.slice(0, 280) + (localStyleRules.length > 280 ? '…' : '') : null
  const customPreview = localCustomRules ? localCustomRules.slice(0, 200) + (localCustomRules.length > 200 ? '…' : '') : null
  const activeMenus = menus.filter(m => m.actif).length

  const creditGateModal = creditGate ? (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'var(--surface)', borderRadius: 'var(--r-sm)', padding: '28px 32px', maxWidth: 420, width: '100%' }}>
        {creditGate === 'insufficient' ? (
          <>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Crédits insuffisants</div>
            <p style={{ fontSize: 13, color: 'var(--ink-600)', lineHeight: 1.6, marginBottom: 24 }}>
              Tu n&apos;as plus de crédits IA disponibles. Cette analyse consomme 1 crédit.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={cancelCredit} style={S.btnSecondary}>Fermer</button>
              <Link href="/credits" style={{ ...S.btnPrimary, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>Acheter des crédits</Link>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Confirmer l&apos;analyse</div>
            <p style={{ fontSize: 13, color: 'var(--ink-600)', lineHeight: 1.6, marginBottom: 24 }}>
              Cette analyse consommera 1 crédit IA. L&apos;opération prend 1 à 2 minutes.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={cancelCredit} style={S.btnSecondary}>Annuler</button>
              <button onClick={confirmCredit} style={S.btnPrimary}>Confirmer</button>
            </div>
          </>
        )}
      </div>
    </div>
  ) : null

  return (
    <div style={{ maxWidth: 720 }}>
      {creditGateModal}

      {/* Re-analyze drawer */}
      {showReanalyzeDrawer && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 150, display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ background: 'var(--surface)', width: '100%', maxWidth: 860, overflowY: 'auto', padding: '24px 28px', height: '100%', boxShadow: '-4px 0 24px rgba(0,0,0,0.12)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h2 style={{ fontSize: 18, fontWeight: 650, margin: 0 }}>Re-analyser le style</h2>
              <button onClick={() => setShowReanalyzeDrawer(false)} style={{ ...S.btnSecondary, padding: '4px 10px' }}>✕</button>
            </div>
            <AIPersonalizationClient
              mailboxes={mailboxes}
              initialPersonalization={null}
              onBeforeAnalyze={onBeforeAnalyze}
              onAnalysisComplete={onReanalyzeComplete}
            />
          </div>
        </div>
      )}

      {/* Prompt modal */}
      {showPromptModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px', overflowY: 'auto' }}
          onClick={() => setShowPromptModal(false)}>
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--r-sm)', padding: '28px 32px', maxWidth: 760, width: '100%', maxHeight: '80vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>Prompt complet généré</div>
              <button onClick={() => setShowPromptModal(false)} style={{ ...S.btnSecondary, padding: '4px 10px' }}>✕</button>
            </div>
            <pre style={{ fontSize: 12, lineHeight: 1.7, color: 'var(--ink-700)', whiteSpace: 'pre-wrap', fontFamily: 'monospace', margin: 0 }}>
              {config.compiledPrompt ?? '(prompt vide)'}
            </pre>
          </div>
        </div>
      )}

      {/* Style detail modal */}
      {showStyleModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px', overflowY: 'auto' }}
          onClick={() => setShowStyleModal(false)}>
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--r-sm)', padding: '28px 32px', maxWidth: 760, width: '100%', maxHeight: '80vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>Règles de style complètes</div>
              <button onClick={() => setShowStyleModal(false)} style={{ ...S.btnSecondary, padding: '4px 10px' }}>✕</button>
            </div>
            <div style={{ fontSize: 13.5, color: 'var(--ink-700)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
              {config.styleRules ?? '(aucune règle de style)'}
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 650, margin: '0 0 4px' }}>Configuration IA</h1>
          <div style={{ fontSize: 13, color: 'var(--ink-500)' }}>✓ Configurée</div>
        </div>
        <button
          onClick={handleReset}
          disabled={resetting}
          style={{ padding: '6px 14px', borderRadius: 'var(--r-sm)', border: '1px solid #FCA5A5', background: '#FEF2F2', fontSize: 13, color: '#B91C1C', cursor: resetting ? 'default' : 'pointer', opacity: resetting ? 0.6 : 1 }}
        >
          {resetting ? 'Réinitialisation…' : 'Réinitialiser'}
        </button>
      </div>

      {/* Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 28 }}>

        {/* Card 1: Espaces & Menus */}
        <div style={S.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={S.cardTitle}>Établissement et menus</div>
              <div style={{ fontSize: 13, color: 'var(--ink-500)', marginTop: 4 }}>
                {espaces.length} espace{espaces.length > 1 ? 's' : ''} · {activeMenus} menu{activeMenus > 1 ? 's' : ''} actif{activeMenus > 1 ? 's' : ''}
              </div>
              {espaces.length > 0 && (
                <div style={{ marginTop: 6, fontSize: 12.5, color: 'var(--ink-600)' }}>
                  {espaces.slice(0, 3).map(e => e.nom).join(', ')}{espaces.length > 3 ? ` +${espaces.length - 3}` : ''}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <Link href="/config/espaces" style={{ ...S.btnSecondary, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>Espaces</Link>
              <Link href="/config/menus" style={{ ...S.btnSecondary, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>Menus</Link>
            </div>
          </div>
        </div>

        {/* Card 2: Style */}
        <div style={S.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: editingStyle ? 12 : (stylePreview ? 10 : 0) }}>
            <div>
              <div style={S.cardTitle}>Style de communication</div>
              <div style={{ fontSize: 13, color: 'var(--ink-500)', marginTop: 4 }}>
                {threadsAnalyzed && mailboxLabel
                  ? `Appris depuis ${threadsAnalyzed} threads · ${mailboxLabel}`
                  : 'Style standard'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              {stylePreview && !editingStyle && <button onClick={() => setShowStyleModal(true)} style={S.btnSecondary}>Voir le détail</button>}
              {!editingStyle && <button onClick={() => setShowReanalyzeDrawer(true)} style={S.btnSecondary}>Re-analyser</button>}
              {!editingStyle && <button onClick={() => setEditingStyle(true)} style={S.btnSecondary}>Modifier</button>}
            </div>
          </div>
          {editingStyle ? (
            <div>
              <textarea
                value={localStyleRules}
                onChange={e => setLocalStyleRules(e.target.value)}
                rows={6}
                style={{ ...S.input, resize: 'vertical', fontFamily: 'inherit', marginBottom: 8 }}
              />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => { setEditingStyle(false); setLocalStyleRules(config.styleRules ?? '') }} style={S.btnSecondary}>Annuler</button>
                <button onClick={saveStyleRules} disabled={savingStyle} style={savingStyle ? S.btnDisabled : S.btnPrimary}>
                  {savingStyle ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            </div>
          ) : stylePreview ? (
            <div style={{ fontSize: 12.5, color: 'var(--ink-600)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{stylePreview}</div>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--ink-400)', fontStyle: 'italic' }}>Aucun style appris — cliquez Re-analyser pour lancer l&apos;extraction</div>
          )}
        </div>

        {/* Card 3: Règles supplémentaires */}
        <div style={S.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: editingCustom || customPreview ? 10 : 0 }}>
            <div style={S.cardTitle}>Règles supplémentaires</div>
            {!editingCustom && <button onClick={() => setEditingCustom(true)} style={S.btnSecondary}>Modifier</button>}
          </div>
          {editingCustom ? (
            <div>
              <textarea
                value={localCustomRules}
                onChange={e => setLocalCustomRules(e.target.value)}
                rows={4}
                style={{ ...S.input, resize: 'vertical', fontFamily: 'inherit', marginBottom: 8 }}
                placeholder="Ex : Toujours proposer de se rappeler le lendemain pour les demandes urgentes."
              />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => { setEditingCustom(false); setLocalCustomRules(config.customRules ?? '') }} style={S.btnSecondary}>Annuler</button>
                <button onClick={saveCustomRules} disabled={savingCustom} style={savingCustom ? S.btnDisabled : S.btnPrimary}>
                  {savingCustom ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            </div>
          ) : customPreview ? (
            <div style={{ fontSize: 12.5, color: 'var(--ink-600)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{customPreview}</div>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--ink-400)', fontStyle: 'italic' }}>Aucune règle supplémentaire</div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <button onClick={() => setShowPromptModal(true)} style={{ ...S.btnSecondary, fontSize: 12.5 }}>
          Voir le prompt complet généré
        </button>
        <Link href="/credits" style={{ fontSize: 12.5, color: 'var(--ink-500)', textDecoration: 'none' }}>
          Mes crédits IA
        </Link>
      </div>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const S = {
  h2: { fontSize: 20, fontWeight: 650, color: 'var(--ink-900)', margin: '0 0 12px' } as React.CSSProperties,
  label: { fontSize: 12, color: 'var(--ink-600)', display: 'block', marginBottom: 4 } as React.CSSProperties,
  input: { width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', fontSize: 13, fontFamily: 'inherit', background: 'var(--surface-sunken)', color: 'var(--ink-900)', outline: 'none', boxSizing: 'border-box' as const } as React.CSSProperties,
  btnPrimary: { padding: '9px 20px', borderRadius: 'var(--r-sm)', background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 13.5, fontWeight: 550, cursor: 'pointer' } as React.CSSProperties,
  btnSecondary: { padding: '6px 14px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 13, color: 'var(--ink-700)', cursor: 'pointer' } as React.CSSProperties,
  btnDisabled: { padding: '9px 20px', borderRadius: 'var(--r-sm)', background: 'var(--border)', color: 'var(--ink-400)', border: 'none', fontSize: 13.5, cursor: 'not-allowed' } as React.CSSProperties,
  card: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: '20px 22px' } as React.CSSProperties,
  cardTitle: { fontSize: 15, fontWeight: 600, color: 'var(--ink-900)' } as React.CSSProperties,
  recapItem: { padding: '10px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', fontSize: 13.5, color: 'var(--ink-800)' } as React.CSSProperties,
}
