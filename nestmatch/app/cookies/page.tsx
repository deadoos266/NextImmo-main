"use client"
import { useState } from "react"
import Link from "next/link"
import { useResponsive } from "../hooks/useResponsive"

const STORAGE_KEY = "cookie_consent"

/* ── Section wrapper ── */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 36 }}>
      <h2 style={{ fontSize: 20, fontWeight: 800, color: "#111", margin: "0 0 14px", letterSpacing: "-0.3px" }}>{title}</h2>
      {children}
    </div>
  )
}

/* ── Paragraph ── */
function P({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 14, color: "#374151", lineHeight: 1.75, margin: "0 0 12px" }}>{children}</p>
}

/* ── Cookie table row ── */
function CookieTableRow({ category, purpose, duration, legal }: { category: string; purpose: string; duration: string; legal: string }) {
  const cellStyle: React.CSSProperties = { padding: "12px 14px", fontSize: 13, color: "#374151", lineHeight: 1.5, borderBottom: "1px solid #f3f4f6" }
  return (
    <tr>
      <td style={{ ...cellStyle, fontWeight: 700, color: "#111" }}>{category}</td>
      <td style={cellStyle}>{purpose}</td>
      <td style={cellStyle}>{duration}</td>
      <td style={cellStyle}>{legal}</td>
    </tr>
  )
}

export default function CookiesPage() {
  const { isMobile } = useResponsive()
  const [prefsOpened, setPrefsOpened] = useState(false)
  const [functional, setFunctional] = useState(true)
  const [analytics, setAnalytics] = useState(false)

  function openPreferences(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        setFunctional(parsed.functional ?? true)
        setAnalytics(parsed.analytics ?? false)
      }
    } catch { /* ignore */ }
    setPrefsOpened(true)
  }

  function savePreferences(): void {
    const consent = { necessary: true, functional, analytics, marketing: false, date: new Date().toISOString() }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(consent))
    setPrefsOpened(false)
  }

  const headCell: React.CSSProperties = {
    padding: "12px 14px",
    fontSize: 11,
    fontWeight: 800,
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    borderBottom: "2px solid #e5e7eb",
    textAlign: "left",
  }

  return (
    <main style={{ minHeight: "100vh", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif", padding: isMobile ? "32px 16px" : "40px 48px" }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: 40 }}>
          <Link
            href="/"
            style={{ fontSize: 13, color: "#6b7280", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 20 }}
          >
            <span style={{ fontSize: 16 }}>←</span> Retour a l'accueil
          </Link>
          <h1 style={{ fontSize: isMobile ? 28 : 36, fontWeight: 800, color: "#111", margin: "0 0 8px", letterSpacing: "-0.5px" }}>
            Politique de cookies
          </h1>
          <p style={{ fontSize: 14, color: "#6b7280", margin: 0 }}>Derniere mise a jour : avril 2026</p>
        </div>

        {/* Content card */}
        <div style={{ background: "white", borderRadius: 20, padding: isMobile ? "24px 20px" : "36px 40px", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>

          {/* 1. Qu'est-ce qu'un cookie */}
          <Section title="1. Qu'est-ce qu'un cookie ?">
            <P>
              Un cookie est un petit fichier texte depose sur votre navigateur lorsque vous visitez un site web.
              Il permet au site de memoriser certaines informations sur votre visite, comme vos preferences
              de langue ou le contenu de votre panier, afin de faciliter votre prochaine visite et de rendre
              le site plus utile pour vous.
            </P>
            <P>
              Les cookies peuvent etre "de session" (supprimes a la fermeture du navigateur) ou "persistants"
              (conserves pendant une duree definie). Ils peuvent etre deposes par NestMatch ("cookies internes")
              ou par des services tiers ("cookies tiers").
            </P>
          </Section>

          {/* 2. Les cookies que nous utilisons */}
          <Section title="2. Les cookies que nous utilisons">
            <P>
              NestMatch utilise un nombre limite de cookies, strictement necessaires au fonctionnement du service
              ou soumis a votre consentement prealable.
            </P>
            <div style={{ overflowX: "auto", margin: "16px 0" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
                <thead>
                  <tr>
                    <th style={headCell}>Categorie</th>
                    <th style={headCell}>Finalite</th>
                    <th style={headCell}>Duree</th>
                    <th style={headCell}>Base legale</th>
                  </tr>
                </thead>
                <tbody>
                  <CookieTableRow
                    category="Necessaires"
                    purpose="Jeton de session NextAuth (next-auth.session-token), protection CSRF (next-auth.csrf-token). Indispensables a l'authentification et a la securite."
                    duration="Session"
                    legal="Interet legitime"
                  />
                  <CookieTableRow
                    category="Fonctionnels"
                    purpose="Preferences utilisateur (cookie_consent, favoris, role selectionne). Permettent de personnaliser l'interface."
                    duration="1 an"
                    legal="Consentement"
                  />
                  <CookieTableRow
                    category="Analytiques"
                    purpose="Comptage des pages vues (colonne 'vues' en base). Aucun outil d'analyse tiers n'est utilise. Donnees anonymisees."
                    duration="Session"
                    legal="Consentement"
                  />
                  <CookieTableRow
                    category="Marketing"
                    purpose="Aucun cookie marketing n'est utilise actuellement. Cette categorie est affichee par transparence."
                    duration="—"
                    legal="—"
                  />
                </tbody>
              </table>
            </div>
          </Section>

          {/* 3. Comment gerer vos cookies */}
          <Section title="3. Comment gerer vos cookies ?">
            <P>
              Lors de votre premiere visite, un bandeau de consentement vous permet d'accepter ou de refuser
              les cookies non essentiels. Vous pouvez modifier vos choix a tout moment en cliquant sur le
              bouton 🍪 situe en bas a droite de chaque page, ou en utilisant le bouton "Modifier mes preferences"
              en bas de cette page.
            </P>
            <P>
              Vous pouvez egalement configurer votre navigateur pour bloquer ou supprimer les cookies :
            </P>
            <ul style={{ paddingLeft: 20, margin: "8px 0 16px" }}>
              {[
                { name: "Google Chrome", url: "chrome://settings/cookies" },
                { name: "Mozilla Firefox", url: "about:preferences#privacy" },
                { name: "Safari", url: "Preferences > Confidentialite" },
                { name: "Microsoft Edge", url: "edge://settings/privacy" },
              ].map(b => (
                <li key={b.name} style={{ fontSize: 14, color: "#374151", lineHeight: 2 }}>
                  <strong>{b.name}</strong> : {b.url}
                </li>
              ))}
            </ul>
            <P>
              Attention : la desactivation de certains cookies peut affecter le fonctionnement du site,
              notamment la connexion a votre compte.
            </P>
          </Section>

          {/* 4. Cookies tiers */}
          <Section title="4. Cookies tiers">
            <P>
              Certains services tiers integres a NestMatch peuvent deposer leurs propres cookies :
            </P>
            <ul style={{ paddingLeft: 20, margin: "8px 0 16px" }}>
              <li style={{ fontSize: 14, color: "#374151", lineHeight: 2 }}>
                <strong>Google OAuth</strong> — L'authentification via Google (NextAuth) implique le depot de cookies
                par Google pour gerer la session d'authentification. Ces cookies sont strictement necessaires
                a la connexion avec votre compte Google.
              </li>
              <li style={{ fontSize: 14, color: "#374151", lineHeight: 2 }}>
                <strong>Supabase</strong> — Notre base de donnees utilise des mecanismes techniques de gestion
                de session. Aucun cookie de suivi n'est depose.
              </li>
              <li style={{ fontSize: 14, color: "#374151", lineHeight: 2 }}>
                <strong>Leaflet / OpenStreetMap</strong> — L'affichage des cartes peut impliquer le chargement
                de tuiles depuis les serveurs OpenStreetMap, susceptibles de deposer des cookies techniques.
              </li>
            </ul>
          </Section>

          {/* 5. Vos droits */}
          <Section title="5. Vos droits (RGPD)">
            <P>
              Conformement au Reglement General sur la Protection des Donnees (RGPD) et a la loi
              Informatique et Libertes, vous disposez des droits suivants :
            </P>
            <ul style={{ paddingLeft: 20, margin: "8px 0 16px" }}>
              {[
                "Droit d'acces : obtenir une copie des donnees collectees via les cookies.",
                "Droit de rectification : corriger des donnees inexactes.",
                "Droit de suppression : demander l'effacement de vos donnees.",
                "Droit de retrait du consentement : vous pouvez retirer votre consentement a tout moment via le bandeau cookies, sans que cela affecte la licite du traitement effectue avant le retrait.",
                "Droit d'opposition : vous opposer au traitement de vos donnees pour des motifs legitimes.",
                "Droit a la portabilite : recevoir vos donnees dans un format structure et lisible.",
              ].map(d => (
                <li key={d} style={{ fontSize: 14, color: "#374151", lineHeight: 2 }}>{d}</li>
              ))}
            </ul>
            <P>
              Pour exercer ces droits, vous pouvez nous contacter a l'adresse suivante :{" "}
              <strong>contact@nestmatch.fr</strong>
            </P>
            <P>
              Vous pouvez egalement introduire une reclamation aupres de la CNIL (Commission Nationale de
              l'Informatique et des Libertes) :{" "}
              <a
                href="https://www.cnil.fr"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#111", fontWeight: 600, textDecoration: "underline", textUnderlineOffset: 2 }}
              >
                www.cnil.fr
              </a>
            </P>
          </Section>

          {/* 6. Modifications */}
          <Section title="6. Modifications de cette politique">
            <P>
              NestMatch se reserve le droit de modifier la presente politique de cookies afin de l'adapter
              aux evolutions reglementaires ou aux changements apportes au site. La date de derniere mise
              a jour est indiquee en haut de cette page. Nous vous invitons a consulter cette page
              regulierement.
            </P>
          </Section>

          {/* Divider */}
          <div style={{ height: 1, background: "#e5e7eb", margin: "32px 0" }} />

          {/* Preferences section */}
          {!prefsOpened ? (
            <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "stretch" : "center", gap: 12 }}>
              <button
                onClick={openPreferences}
                style={{
                  background: "#111",
                  color: "white",
                  borderRadius: 999,
                  padding: "10px 24px",
                  fontWeight: 700,
                  fontSize: 13,
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                Modifier mes preferences
              </button>
              <Link
                href="/"
                style={{
                  background: "none",
                  border: "1.5px solid #e5e7eb",
                  borderRadius: 999,
                  padding: "8px 20px",
                  fontWeight: 600,
                  fontSize: 13,
                  color: "#111",
                  fontFamily: "'DM Sans', sans-serif",
                  textDecoration: "none",
                  textAlign: "center",
                }}
              >
                Retour a l'accueil
              </Link>
            </div>
          ) : (
            <div>
              <p style={{ fontSize: 16, fontWeight: 800, color: "#111", margin: "0 0 16px" }}>Vos preferences</p>

              <div style={{ marginBottom: 16 }}>
                <PreferenceRow label="Necessaires" description="Session, authentification, securite." checked={true} disabled />
                <PreferenceRow label="Fonctionnels" description="Preferences, favoris, personnalisation." checked={functional} onChange={setFunctional} />
                <PreferenceRow label="Analytiques" description="Pages vues, performance. Aucun outil tiers." checked={analytics} onChange={setAnalytics} />
                <PreferenceRow label="Marketing" description="Non utilise actuellement." checked={false} disabled />
              </div>

              <div style={{ display: "flex", gap: 10, flexDirection: isMobile ? "column" : "row" }}>
                <button
                  onClick={savePreferences}
                  style={{
                    background: "#111",
                    color: "white",
                    borderRadius: 999,
                    padding: "10px 24px",
                    fontWeight: 700,
                    fontSize: 13,
                    border: "none",
                    cursor: "pointer",
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                >
                  Enregistrer mes choix
                </button>
                <button
                  onClick={() => setPrefsOpened(false)}
                  style={{
                    background: "none",
                    border: "1.5px solid #e5e7eb",
                    borderRadius: 999,
                    padding: "8px 20px",
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: "pointer",
                    color: "#111",
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                >
                  Annuler
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}

/* ── Inline preference row for the page ── */
function PreferenceRow({ label, description, checked, disabled, onChange }: {
  label: string
  description: string
  checked: boolean
  disabled?: boolean
  onChange?: (v: boolean) => void
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "12px 0", borderBottom: "1px solid #f3f4f6" }}>
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: 14, fontWeight: 700, color: "#111", margin: 0 }}>{label}</p>
        <p style={{ fontSize: 12, color: "#6b7280", margin: "2px 0 0" }}>{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange?.(!checked)}
        style={{
          width: 44,
          height: 24,
          borderRadius: 999,
          border: "none",
          background: checked ? "#111" : "#d1d5db",
          position: "relative",
          cursor: disabled ? "not-allowed" : "pointer",
          transition: "background 0.2s ease",
          opacity: disabled ? 0.5 : 1,
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 3,
            left: checked ? 23 : 3,
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: "white",
            transition: "left 0.2s ease",
            boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
          }}
        />
      </button>
    </div>
  )
}
