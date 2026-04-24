"use client"
import { useState } from "react"
import { useSession } from "next-auth/react"
import { SUJETS_CONTACT } from "../../lib/contacts"
import { useResponsive } from "../hooks/useResponsive"

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
    border: "1px solid #EAE6DF",
    borderRadius: 12,
    fontSize: 15,
    outline: "none",
    boxSizing: "border-box",
    fontFamily: "inherit",
    background: "white",
    color: "#111",
  }

  const lbl: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 700,
    color: "#8a8477",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    display: "block",
    marginBottom: 8,
  }

  return (
    <main style={{ minHeight: "100vh", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: isMobile ? "32px 16px" : "56px 32px" }}>

        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 12 }}>
            Contact
          </p>
          <h1 style={{ fontSize: isMobile ? 28 : 38, fontWeight: 800, letterSpacing: "-1px", marginBottom: 10 }}>
            Une question ? Écrivez-nous.
          </h1>
          <p style={{ color: "#8a8477", fontSize: isMobile ? 14 : 15, lineHeight: 1.6 }}>
            Notre équipe revient vers vous sous 48 heures ouvrées.
          </p>
        </div>

        {done ? (
          <div style={{ background: "white", borderRadius: 20, padding: isMobile ? "28px 20px" : "40px 32px", textAlign: "center", boxShadow: "0 2px 16px rgba(0,0,0,0.06)" }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 10, color: "#15803d" }}>Message envoyé</h2>
            <p style={{ fontSize: 14, color: "#111", lineHeight: 1.6, marginBottom: 20 }}>
              Merci pour votre message. Un membre de l'équipe KeyMatch vous répondra par email sous 48 heures.
            </p>
            <button
              onClick={() => setDone(false)}
              style={{ background: "#111", color: "white", border: "none", borderRadius: 999, padding: "10px 24px", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}
            >
              Envoyer un autre message
            </button>
          </div>
        ) : (
          <form onSubmit={submit} style={{ background: "white", borderRadius: 20, padding: isMobile ? "24px 18px" : "32px 28px", boxShadow: "0 2px 16px rgba(0,0,0,0.06)", display: "flex", flexDirection: "column", gap: 18 }}>
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
              <p style={{ fontSize: 11, color: "#8a8477", marginTop: 6 }}>
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
              <div style={{ background: "#FEECEC", color: "#b91c1c", padding: "10px 14px", borderRadius: 10, fontSize: 13, fontWeight: 600 }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                background: loading ? "#8a8477" : "#111",
                color: "white",
                border: "none",
                borderRadius: 999,
                padding: "14px 32px",
                fontWeight: 700,
                fontSize: 15,
                cursor: loading ? "not-allowed" : "pointer",
                fontFamily: "inherit",
                alignSelf: isMobile ? "stretch" : "flex-end",
              }}
            >
              {loading ? "Envoi..." : "Envoyer le message"}
            </button>

            <p style={{ fontSize: 11, color: "#8a8477", marginTop: 4, lineHeight: 1.5 }}>
              Vos données ne sont utilisées que pour répondre à votre demande et conservées 12 mois.
              Conformément au RGPD, vous pouvez demander leur suppression à tout moment.
            </p>
          </form>
        )}

        <div style={{ marginTop: 32, textAlign: "center" }}>
          <p style={{ fontSize: 13, color: "#8a8477", lineHeight: 1.7 }}>
            Vous avez déjà un compte ? Les questions liées à une annonce ou à un utilisateur
            peuvent aussi être remontées via le bouton <strong>Signaler</strong> dans la plateforme.
          </p>
        </div>

      </div>
    </main>
  )
}
