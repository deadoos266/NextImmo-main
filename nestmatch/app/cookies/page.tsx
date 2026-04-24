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
  return <p style={{ fontSize: 14, color: "#111", lineHeight: 1.75, margin: "0 0 12px" }}>{children}</p>
}

/* ── Cookie table row ── */
function CookieTableRow({ category, purpose, duration, legal }: { category: string; purpose: string; duration: string; legal: string }) {
  const cellStyle: React.CSSProperties = { padding: "12px 14px", fontSize: 13, color: "#111", lineHeight: 1.5, borderBottom: "1px solid #F7F4EF" }
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
    color: "#8a8477",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    borderBottom: "2px solid #EAE6DF",
    textAlign: "left",
  }

  return (
    <main style={{ minHeight: "100vh", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif", padding: isMobile ? "32px 16px" : "40px 48px" }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: 40 }}>
          <Link
            href="/"
            style={{ fontSize: 13, color: "#8a8477", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 20 }}
          >
            <span style={{ fontSize: 16 }}>←</span> Retour à l&apos;accueil
          </Link>
          <h1 style={{ fontSize: isMobile ? 28 : 36, fontWeight: 800, color: "#111", margin: "0 0 8px", letterSpacing: "-0.5px" }}>
            Politique de cookies
          </h1>
          <p style={{ fontSize: 14, color: "#8a8477", margin: 0 }}>En vigueur au 18 avril 2026</p>
        </div>

        {/* Content card */}
        <div style={{ background: "white", borderRadius: 20, padding: isMobile ? "24px 20px" : "36px 40px", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>

          {/* 1. Qu'est-ce qu'un cookie */}
          <Section title="1. Qu&apos;est-ce qu&apos;un cookie ?">
            <P>
              Un cookie est un petit fichier texte déposé sur votre navigateur lorsque vous visitez un site web.
              Il permet au site de mémoriser certaines informations sur votre visite, comme vos préférences
              de langue ou votre état de connexion, afin de faciliter votre prochaine visite et de rendre
              le site plus utile pour vous.
            </P>
            <P>
              Les cookies peuvent être « de session » (supprimés à la fermeture du navigateur) ou « persistants »
              (conservés pendant une durée définie). Ils peuvent être déposés par KeyMatch (« cookies internes »)
              ou par des services tiers (« cookies tiers »).
            </P>
          </Section>

          {/* 2. Les cookies que nous utilisons */}
          <Section title="2. Les cookies que nous utilisons">
            <P>
              KeyMatch utilise un nombre limité de cookies, strictement nécessaires au fonctionnement du service
              ou soumis à votre consentement préalable.
            </P>
            <div style={{ overflowX: "auto", margin: "16px 0" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
                <thead>
                  <tr>
                    <th style={headCell}>Catégorie</th>
                    <th style={headCell}>Finalité</th>
                    <th style={headCell}>Durée</th>
                    <th style={headCell}>Base légale</th>
                  </tr>
                </thead>
                <tbody>
                  <CookieTableRow
                    category="Nécessaires"
                    purpose="Jeton de session NextAuth (next-auth.session-token), protection CSRF (next-auth.csrf-token). Indispensables à l'authentification et à la sécurité."
                    duration="Session"
                    legal="Intérêt légitime"
                  />
                  <CookieTableRow
                    category="Fonctionnels"
                    purpose="Préférences utilisateur (cookie_consent, favoris, rôle sélectionné). Permettent de personnaliser l'interface."
                    duration="1 an"
                    legal="Consentement"
                  />
                  <CookieTableRow
                    category="Analytiques"
                    purpose="Comptage des pages vues. Aucun outil d'analyse tiers n'est utilisé. Données anonymisées."
                    duration="Session"
                    legal="Consentement"
                  />
                  <CookieTableRow
                    category="Marketing"
                    purpose="Aucun cookie marketing n'est utilisé actuellement. Cette catégorie est affichée par transparence."
                    duration="—"
                    legal="—"
                  />
                </tbody>
              </table>
            </div>
          </Section>

          {/* 3. Comment gérer vos cookies */}
          <Section title="3. Comment gérer vos cookies ?">
            <P>
              Lors de votre première visite, un bandeau de consentement vous permet d&apos;accepter ou de refuser
              les cookies non essentiels. Vous pouvez modifier vos choix à tout moment en cliquant sur le
              bouton situé en bas à droite de chaque page, ou en utilisant le bouton &quot;Modifier mes préférences&quot;
              en bas de cette page.
            </P>
            <P>
              Vous pouvez également configurer votre navigateur pour bloquer ou supprimer les cookies :
            </P>
            <ul style={{ paddingLeft: 20, margin: "8px 0 16px" }}>
              {[
                { name: "Google Chrome", url: "chrome://settings/cookies" },
                { name: "Mozilla Firefox", url: "about:preferences#privacy" },
                { name: "Safari", url: "Préférences > Confidentialité" },
                { name: "Microsoft Edge", url: "edge://settings/privacy" },
              ].map(b => (
                <li key={b.name} style={{ fontSize: 14, color: "#111", lineHeight: 2 }}>
                  <strong>{b.name}</strong> : {b.url}
                </li>
              ))}
            </ul>
            <P>
              Attention : la désactivation de certains cookies peut affecter le fonctionnement du site,
              notamment la connexion à votre compte.
            </P>
          </Section>

          {/* 4. Cookies tiers */}
          <Section title="4. Cookies tiers">
            <P>
              Certains services tiers intégrés à KeyMatch peuvent déposer leurs propres cookies :
            </P>
            <ul style={{ paddingLeft: 20, margin: "8px 0 16px" }}>
              <li style={{ fontSize: 14, color: "#111", lineHeight: 2 }}>
                <strong>Google OAuth</strong> — L&apos;authentification via Google implique le dépôt de cookies
                par Google pour gérer la session d&apos;authentification. Ces cookies sont strictement nécessaires
                à la connexion avec votre compte Google.
              </li>
              <li style={{ fontSize: 14, color: "#111", lineHeight: 2 }}>
                <strong>Base de données</strong> — Notre base de données utilise des mécanismes techniques de gestion
                de session. Aucun cookie de suivi n&apos;est déposé.
              </li>
              <li style={{ fontSize: 14, color: "#111", lineHeight: 2 }}>
                <strong>OpenStreetMap</strong> — L&apos;affichage des cartes peut impliquer le chargement
                de tuiles depuis les serveurs OpenStreetMap, susceptibles de déposer des cookies techniques.
              </li>
            </ul>
          </Section>

          {/* 5. Vos droits */}
          <Section title="5. Vos droits (RGPD)">
            <P>
              Conformément au Règlement Général sur la Protection des Données (RGPD) et à la loi
              Informatique et Libertés, vous disposez des droits suivants :
            </P>
            <ul style={{ paddingLeft: 20, margin: "8px 0 16px" }}>
              {[
                "Droit d'accès : obtenir une copie des données collectées via les cookies.",
                "Droit de rectification : corriger des données inexactes.",
                "Droit de suppression : demander l'effacement de vos données.",
                "Droit de retrait du consentement : vous pouvez retirer votre consentement à tout moment via le bandeau cookies, sans que cela affecte la licéité du traitement effectué avant le retrait.",
                "Droit d'opposition : vous opposer au traitement de vos données pour des motifs légitimes.",
                "Droit à la portabilité : recevoir vos données dans un format structuré et lisible.",
              ].map(d => (
                <li key={d} style={{ fontSize: 14, color: "#111", lineHeight: 2 }}>{d}</li>
              ))}
            </ul>
            <P>
              Pour exercer ces droits, vous pouvez nous contacter à l&apos;adresse suivante :{" "}
              <strong>contact@keymatch-immo.fr</strong>
            </P>
            <P>
              Vous pouvez également introduire une réclamation auprès de la CNIL (Commission Nationale de
              l&apos;Informatique et des Libertés) :{" "}
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
              KeyMatch se réserve le droit de modifier la présente politique de cookies afin de l&apos;adapter
              aux évolutions réglementaires ou aux changements apportés au site. La date de dernière mise
              à jour est indiquée en haut de cette page. Nous vous invitons à la consulter régulièrement.
            </P>
          </Section>

          {/* Divider */}
          <div style={{ height: 1, background: "#EAE6DF", margin: "32px 0" }} />

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
                Modifier mes préférences
              </button>
              <Link
                href="/"
                style={{
                  background: "none",
                  border: "1px solid #EAE6DF",
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
                Retour à l&apos;accueil
              </Link>
            </div>
          ) : (
            <div>
              <p style={{ fontSize: 16, fontWeight: 800, color: "#111", margin: "0 0 16px" }}>Vos préférences</p>

              <div style={{ marginBottom: 16 }}>
                <PreferenceRow label="Nécessaires" description="Session, authentification, sécurité." checked={true} disabled />
                <PreferenceRow label="Fonctionnels" description="Préférences, favoris, personnalisation." checked={functional} onChange={setFunctional} />
                <PreferenceRow label="Analytiques" description="Pages vues, performance. Aucun outil tiers." checked={analytics} onChange={setAnalytics} />
                <PreferenceRow label="Marketing" description="Non utilisé actuellement." checked={false} disabled />
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
                    border: "1px solid #EAE6DF",
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
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "12px 0", borderBottom: "1px solid #F7F4EF" }}>
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: 14, fontWeight: 700, color: "#111", margin: 0 }}>{label}</p>
        <p style={{ fontSize: 12, color: "#8a8477", margin: "2px 0 0" }}>{description}</p>
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
          background: checked ? "#111" : "#EAE6DF",
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
