"use client"
import { useState } from "react"
import { useSession } from "next-auth/react"
import { SUJETS_CONTACT } from "../../lib/contacts"
import { useResponsive } from "../hooks/useResponsive"
import { km, KMButton, KMCard, KMEyebrow, KMHeading } from "../components/ui/km"

export default function ContactPage() {
  const { data: session } = useSession()
  const { isMobile } = useResponsive()
  const [nom, setNom] = useState(session?.user?.name || "")
  const [email, setEmail] = useState(session?.user?.email || "")
  const [sujet, setSujet] = useState("question_generale")
  const [message, setMessage] = useState("")
  const [website, setWebsite] = useState("") // honeypot anti-bot — reste vide
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState("")

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!nom.trim() || nom.trim().length < 2) { setError("Nom trop court"); return }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError("Email invalide"); return }
    if (!message.trim() || message.trim().length < 10) { setError("Message trop court (10 caractères minimum)"); return }
    setError("")
    setLoading(true)
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nom: nom.trim(), email: email.trim(), sujet, message: message.trim(), website }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        setError(json.error || "Erreur serveur. Veuillez réessayer.")
        setLoading(false)
        return
      }
      setDone(true)
      setMessage("")
      setLoading(false)
    } catch {
      setError("Erreur réseau. Veuillez réessayer.")
      setLoading(false)
    }
  }

  const inp: React.CSSProperties = {
    width: "100%",
    padding: "12px 16px",
    border: `1px solid ${km.line}`,
    borderRadius: 12,
    fontSize: 15,
    outline: "none",
    boxSizing: "border-box",
    fontFamily: "inherit",
    background: km.white,
    color: km.ink,
  }

  const lbl: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 700,
    color: km.muted,
    textTransform: "uppercase",
    letterSpacing: "1.4px",
    display: "block",
    marginBottom: 8,
  }

  return (
    <main style={{
      minHeight: "100vh",
      background: km.beige,
      fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
    }}>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: isMobile ? "32px 16px" : "56px 32px" }}>

        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <KMEyebrow style={{ marginBottom: 14 }}>Contact · Nous écrire</KMEyebrow>
          <KMHeading as="h1" size={isMobile ? 30 : 42} style={{ marginBottom: 12 }}>
            Une question ? Écrivez-nous.
          </KMHeading>
          <p style={{
            color: km.muted, fontSize: isMobile ? 14 : 15, lineHeight: 1.6,
            maxWidth: 480, margin: "0 auto",
          }}>
            Notre équipe revient vers vous sous 48 heures ouvrées.
          </p>
        </div>

        {done ? (
          <KMCard padding={isMobile ? "28px 20px" : "40px 32px"} style={{ textAlign: "center" }}>
            <div style={{
              width: 56, height: 56, margin: "0 auto 18px",
              background: km.successBg, color: km.successText,
              border: `1px solid ${km.successLine}`,
              borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            </div>
            <KMHeading as="h2" size={22} style={{ marginBottom: 10 }}>Message envoyé</KMHeading>
            <p style={{ fontSize: 14, color: "#3f3c37", lineHeight: 1.6, marginBottom: 22 }}>
              Merci pour votre message. Un membre de l&apos;équipe KeyMatch vous répondra par email sous 48 heures.
            </p>
            <KMButton onClick={() => setDone(false)}>Envoyer un autre message</KMButton>
          </KMCard>
        ) : (
          <form onSubmit={submit}>
            <KMCard padding={isMobile ? "24px 18px" : "32px 28px"} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14 }}>
                <div>
                  <label style={lbl}>Votre nom</label>
                  <input
                    type="text"
                    value={nom}
                    onChange={e => setNom(e.target.value)}
                    required
                    maxLength={120}
                    placeholder="Prénom Nom"
                    style={inp}
                  />
                </div>
                <div>
                  <label style={lbl}>Votre email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    maxLength={180}
                    placeholder="vous@exemple.fr"
                    style={inp}
                  />
                </div>
              </div>

              <div>
                <label style={lbl}>Sujet</label>
                <select value={sujet} onChange={e => setSujet(e.target.value)} style={inp}>
                  {SUJETS_CONTACT.map(s => (
                    <option key={s.code} value={s.code}>{s.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={lbl}>Votre message</label>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  required
                  minLength={10}
                  maxLength={4000}
                  rows={6}
                  placeholder="Décrivez votre demande le plus précisément possible."
                  style={{ ...inp, resize: "vertical", minHeight: 140 }}
                />
                <p style={{ fontSize: 10, color: km.muted, marginTop: 6, textTransform: "uppercase", letterSpacing: "1.2px", fontWeight: 600 }}>
                  {message.trim().length} / 4000 caractères
                </p>
              </div>

              {/* Honeypot invisible — si rempli par un bot → rejet silencieux côté API */}
              <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", top: 0, width: 1, height: 1, overflow: "hidden" }}>
                <label htmlFor="website">Site web (laissez vide)</label>
                <input
                  id="website"
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={website}
                  onChange={e => setWebsite(e.target.value)}
                />
              </div>

              {error && (
                <div style={{
                  background: km.errBg, color: km.errText,
                  border: `1px solid ${km.errLine}`,
                  padding: "10px 14px", borderRadius: 10,
                  fontSize: 13, fontWeight: 500,
                }}>
                  {error}
                </div>
              )}

              <KMButton
                type="submit"
                disabled={loading}
                size="lg"
                style={{
                  alignSelf: isMobile ? "stretch" : "flex-end",
                }}
              >
                {loading ? "Envoi…" : "Envoyer le message"}
              </KMButton>

              <p style={{ fontSize: 11, color: km.muted, marginTop: 4, lineHeight: 1.5 }}>
                Vos données ne sont utilisées que pour répondre à votre demande et conservées 12 mois.
                Conformément au RGPD, vous pouvez demander leur suppression à tout moment.
              </p>
            </KMCard>
          </form>
        )}

        <div style={{ marginTop: 32, textAlign: "center" }}>
          <p style={{ fontSize: 13, color: km.muted, lineHeight: 1.7 }}>
            Vous avez déjà un compte ? Les questions liées à une annonce ou à un utilisateur
            peuvent aussi être remontées via le bouton <strong style={{ color: km.ink, fontWeight: 700 }}>Signaler</strong> dans la plateforme.
          </p>
        </div>

      </div>
    </main>
  )
}
