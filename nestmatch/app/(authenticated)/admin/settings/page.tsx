import AdminPageHeader from "../../../components/admin/AdminPageHeader"
import { km } from "../../../components/ui/km"
import { NO_INDEX } from "../../../../lib/featureFlags"

export const metadata = {
  title: "Settings admin — KeyMatch",
  description: "Configuration de l'application (feature flags, env vars, mode bêta).",
  robots: { index: false, follow: false },
}
export const dynamic = "force-dynamic"

/**
 * V85.8 — /admin/settings
 *
 * Affichage read-only des feature flags + env vars publiques + mode bêta.
 *
 * V86+ : ajouter écriture (toggle feature flag stockés en DB
 * `feature_flags` au lieu de hardcoded dans lib/featureFlags.ts).
 */

function SettingRow({ label, value, secret = false }: { label: string; value: string | boolean | null; secret?: boolean }) {
  const display = secret && value ? "•••••• (masqué)" : (value === true ? "true" : value === false ? "false" : value === null ? "(non défini)" : String(value))
  const color = value === false || value === null ? km.muted : km.ink
  return (
    <div style={{ display: "flex", gap: 14, padding: "10px 0", borderBottom: `1px solid ${km.line}`, fontSize: 13 }}>
      <div style={{ flex: "0 0 240px", color: km.muted, fontWeight: 600 }}>{label}</div>
      <div style={{ flex: 1, color, fontFamily: secret || typeof value !== "string" ? "monospace" : "inherit" }}>
        {display}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ background: km.white, border: `1px solid ${km.line}`, borderRadius: 14, padding: 22, marginBottom: 18 }}>
      <h2 style={{ fontFamily: "var(--font-fraunces), 'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 22, margin: "0 0 14px", color: km.ink }}>
        {title}
      </h2>
      {children}
    </section>
  )
}

export default function AdminSettingsPage() {
  const env = process.env

  return (
    <div>
      <AdminPageHeader
        title="Settings"
        subtitle="Feature flags, env vars publiques, mode bêta — read-only (V86+ pour écriture)"
      />

      <Section title="Feature flags">
        <SettingRow label="NO_INDEX (lib/featureFlags)" value={NO_INDEX} />
        <SettingRow label="NEXT_PUBLIC_BETA (env)" value={env.NEXT_PUBLIC_BETA || null} />
        <SettingRow label="NEXT_PUBLIC_NOINDEX (env)" value={env.NEXT_PUBLIC_NOINDEX || null} />
      </Section>

      <Section title="Branding & URL">
        <SettingRow label="NEXT_PUBLIC_URL" value={env.NEXT_PUBLIC_URL || null} />
        <SettingRow label="NODE_ENV" value={env.NODE_ENV || "—"} />
        <SettingRow label="VERCEL_ENV" value={env.VERCEL_ENV || "(local)"} />
        <SettingRow label="VERCEL_GIT_COMMIT_SHA" value={env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) || "(local)"} />
      </Section>

      <Section title="Services tiers (présence)">
        <SettingRow label="SUPABASE_URL" value={env.NEXT_PUBLIC_SUPABASE_URL ? "configuré ✓" : null} />
        <SettingRow label="SUPABASE_SERVICE_ROLE_KEY" value={env.SUPABASE_SERVICE_ROLE_KEY ? "configuré ✓" : null} secret />
        <SettingRow label="NEXTAUTH_SECRET" value={env.NEXTAUTH_SECRET ? "configuré ✓" : null} secret />
        <SettingRow label="GOOGLE_CLIENT_ID" value={env.GOOGLE_CLIENT_ID ? "configuré ✓" : null} secret />
        <SettingRow label="RESEND_API_KEY" value={env.RESEND_API_KEY ? "configuré ✓" : null} secret />
        <SettingRow label="CRON_SECRET" value={env.CRON_SECRET ? "configuré ✓" : null} secret />
        <SettingRow label="UPSTASH_REDIS_REST_URL" value={env.UPSTASH_REDIS_REST_URL ? "configuré ✓" : null} secret />
        <SettingRow label="SENTRY_DSN" value={env.SENTRY_DSN ? "configuré ✓" : null} secret />
        <SettingRow label="ANTHROPIC_API_KEY" value={env.ANTHROPIC_API_KEY ? "configuré ✓" : null} secret />
      </Section>

      <Section title="À faire V86+">
        <ul style={{ margin: 0, paddingLeft: 18, color: km.muted, fontSize: 12.5, lineHeight: 1.8 }}>
          <li>Table <code>feature_flags</code> en DB avec toggle UI ici (au lieu de hardcoded)</li>
          <li>Bouton &quot;Toggle bêta&quot; pour passer NEXT_PUBLIC_BETA on/off via Vercel API</li>
          <li>Test SMTP : envoyer email test depuis ici</li>
          <li>Audit dependencies : versions / vulnérabilités</li>
          <li>Backup status : dernière sauvegarde DB Supabase</li>
        </ul>
      </Section>
    </div>
  )
}
