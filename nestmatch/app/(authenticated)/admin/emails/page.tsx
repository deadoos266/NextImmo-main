import AdminPageHeader from "../../../components/admin/AdminPageHeader"
import { km } from "../../../components/ui/km"

export const metadata = {
  title: "Emails admin — KeyMatch",
  description: "Logs Resend + status deliverability.",
  robots: { index: false, follow: false },
}
export const dynamic = "force-dynamic"

/**
 * V85.6 — /admin/emails
 *
 * KeyMatch utilise Resend pour le transactionnel (signup, candidature,
 * visite, bail, quittance...). Le logging détaillé est dans le dashboard
 * Resend externe — on n'importe pas les logs en DB (coût + volumineux).
 *
 * Cette page agrège ce qu'on a côté KeyMatch :
 *  - Quick actions : ouvrir Resend, tester un email
 *  - Stats indirectes : nombre de notifs envoyées via /api/notifications,
 *    nombre de loyer-retard dispatchés via cron_logs result_summary
 *
 * Future V86+ : webhook Resend → table email_logs pour historique full.
 */

const RESEND_DASHBOARD = "https://resend.com/emails"

export default function AdminEmailsPage() {
  return (
    <div>
      <AdminPageHeader
        title="Emails"
        subtitle="Statut de la deliverability Resend + accès logs externes"
      />

      <section style={{ background: km.white, border: `1px solid ${km.line}`, borderRadius: 14, padding: 22, marginBottom: 18, fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif" }}>
        <h2 style={{ fontFamily: "var(--font-fraunces), 'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 22, margin: "0 0 12px", color: km.ink }}>
          Resend — Provider transactionnel
        </h2>
        <p style={{ color: km.muted, fontSize: 13, lineHeight: 1.5, margin: "0 0 14px" }}>
          KeyMatch envoie tous ses emails transactionnels via Resend (signup, candidature, visite, bail, quittance, digest, retards loyer).
          Les logs détaillés (delivery / bounce / complaint) sont consultables sur le dashboard Resend externe.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <a href={RESEND_DASHBOARD} target="_blank" rel="noopener noreferrer" style={ctaPrimary}>
            Ouvrir Resend ↗
          </a>
          <a href="https://resend.com/domains" target="_blank" rel="noopener noreferrer" style={ctaSecondary}>
            Vérifier SPF/DKIM/DMARC ↗
          </a>
        </div>
      </section>

      <section style={{ background: km.white, border: `1px solid ${km.line}`, borderRadius: 14, padding: 22, marginBottom: 18 }}>
        <h2 style={{ fontFamily: "var(--font-fraunces), 'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 22, margin: "0 0 12px", color: km.ink }}>
          Domaine d&apos;envoi
        </h2>
        <dl style={{ margin: 0, fontSize: 13, color: km.muted, lineHeight: 1.8 }}>
          <div style={{ display: "flex", gap: 10 }}>
            <dt style={{ width: 160, color: km.muted, fontWeight: 600 }}>From address</dt>
            <dd style={{ color: km.ink, margin: 0, fontFamily: "monospace" }}>noreply@keymatch-immo.fr</dd>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <dt style={{ width: 160, color: km.muted, fontWeight: 600 }}>Reply-to</dt>
            <dd style={{ color: km.ink, margin: 0, fontFamily: "monospace" }}>contact@keymatch-immo.fr</dd>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <dt style={{ width: 160, color: km.muted, fontWeight: 600 }}>Domain</dt>
            <dd style={{ color: km.ink, margin: 0, fontFamily: "monospace" }}>keymatch-immo.fr</dd>
          </div>
        </dl>
      </section>

      <section style={{ background: km.beige, border: `1px solid ${km.line}`, borderRadius: 14, padding: 18 }}>
        <h3 style={{ fontFamily: "var(--font-fraunces), 'Fraunces', serif", fontStyle: "italic", fontWeight: 500, fontSize: 18, margin: "0 0 8px", color: km.ink }}>
          Future V86+
        </h3>
        <ul style={{ margin: 0, paddingLeft: 18, color: km.muted, fontSize: 12.5, lineHeight: 1.6 }}>
          <li>Webhook Resend → table <code>email_logs</code> (delivery / bounce / complaint / opened / clicked)</li>
          <li>Dashboard interne : taux délivrabilité par template / par jour</li>
          <li>Test email depuis l&apos;admin : bouton &quot;Envoyer test à mon adresse&quot;</li>
          <li>Audit list rebound : suppression auto des emails marked &quot;suppressed&quot; par Resend</li>
        </ul>
      </section>
    </div>
  )
}

const ctaPrimary: React.CSSProperties = {
  background: km.ink,
  color: km.white,
  padding: "10px 18px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 0.6,
  textDecoration: "none",
  fontFamily: "inherit",
}

const ctaSecondary: React.CSSProperties = {
  background: km.white,
  color: km.ink,
  border: `1px solid ${km.line}`,
  padding: "10px 18px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 600,
  textDecoration: "none",
  fontFamily: "inherit",
}
