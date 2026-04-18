"use client"
import { useSession } from "next-auth/react"
import { useState, useEffect } from "react"
import { supabase } from "../../../lib/supabase"

const HEURES = [
  "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
  "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00", "17:30", "18:00",
]

const STATUT_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  "proposée":  { bg: "#fff7ed", color: "#c2410c", label: "En attente de confirmation" },
  "confirmée": { bg: "#dcfce7", color: "#15803d", label: "Confirmée" },
  "annulée":   { bg: "#fee2e2", color: "#dc2626", label: "Annulée" },
  "effectuée": { bg: "#f3f4f6", color: "#374151", label: "Effectuée" },
}

export default function BookingVisite({
  annonceId,
  proprietaireEmail,
}: {
  annonceId: number
  proprietaireEmail: string
}) {
  const { data: session } = useSession()
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState("")
  const [heure, setHeure] = useState("")
  const [message, setMessage] = useState("")
  const [saving, setSaving] = useState(false)
  const [erreur, setErreur] = useState("")
  const [existante, setExistante] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)

  const myEmail = session?.user?.email
  const isOwner = myEmail === proprietaireEmail

  useEffect(() => {
    if (!myEmail || isOwner) { setLoading(false); return }
    supabase.from("visites")
      .select("*")
      .eq("annonce_id", annonceId)
      .eq("locataire_email", myEmail)
      .order("created_at", { ascending: false })
      .limit(1)
      .single()
      .then(({ data }) => {
        if (data) setExistante(data)
        setLoading(false)
      })
  }, [myEmail, annonceId])

  async function proposer() {
    if (!date) { setErreur("Choisissez une date"); return }
    if (!heure) { setErreur("Choisissez un créneau horaire"); return }
    setSaving(true)
    setErreur("")

    const { data, error } = await supabase.from("visites").insert({
      annonce_id: annonceId,
      locataire_email: myEmail!,
      proprietaire_email: proprietaireEmail,
      date_visite: date,
      heure,
      message: message || null,
      statut: "proposée",
      propose_par: myEmail!,
    }).select().single()

    if (error) {
      setErreur("L'envoi de la demande de visite a échoué. Veuillez réessayer.")
    } else {
      setExistante(data)
      setOpen(false)
    }
    setSaving(false)
  }

  async function annuler() {
    if (!existante) return
    await supabase.from("visites").update({ statut: "annulée" }).eq("id", existante.id)
    setExistante((prev: any) => ({ ...prev, statut: "annulée" }))
  }

  if (!session || isOwner || loading || !proprietaireEmail) return null

  const inp: any = {
    width: "100%", padding: "10px 14px", border: "1.5px solid #e5e7eb",
    borderRadius: 10, fontSize: 14, outline: "none", boxSizing: "border-box",
    fontFamily: "inherit", background: "white",
  }

  // Visite déjà proposée
  if (existante && existante.statut !== "annulée") {
    const style = STATUT_STYLE[existante.statut] ?? STATUT_STYLE["proposée"]
    return (
      <div style={{ background: "white", borderRadius: 20, padding: "20px 24px", border: "1.5px solid #e5e7eb", marginTop: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <p style={{ fontWeight: 700, fontSize: 15 }}>Votre visite</p>
          <span style={{ marginLeft: "auto", background: style.bg, color: style.color, fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 999 }}>
            {style.label}
          </span>
        </div>
        <p style={{ fontSize: 14, color: "#374151" }}>
          <strong>{new Date(existante.date_visite).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</strong> à <strong>{existante.heure}</strong>
        </p>
        {existante.message && (
          <p style={{ fontSize: 13, color: "#6b7280", marginTop: 6, fontStyle: "italic" }}>"{existante.message}"</p>
        )}
        {existante.statut === "proposée" && (
          <button onClick={annuler}
            style={{ marginTop: 12, fontSize: 13, fontWeight: 600, color: "#dc2626", background: "none", border: "1.5px solid #fecaca", borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontFamily: "inherit" }}>
            Annuler la visite
          </button>
        )}
      </div>
    )
  }

  return (
    <div style={{ marginTop: 16 }}>
      {!open ? (
        <button onClick={() => setOpen(true)}
          style={{ width: "100%", padding: "13px 0", background: "#f0fdf4", border: "1.5px solid #bbf7d0", color: "#15803d", borderRadius: 14, fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          Proposer une visite
        </button>
      ) : (
        <div style={{ background: "white", borderRadius: 20, padding: "20px 24px", border: "2px solid #111" }}>
          <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 18 }}>Proposer une visite</h3>

          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 14 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: "#6b7280", display: "block", marginBottom: 6 }}>Date *</label>
              <input type="date" style={inp} value={date} onChange={e => setDate(e.target.value)}
                min={new Date().toISOString().split("T")[0]} />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: "#6b7280", display: "block", marginBottom: 6 }}>Créneau *</label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                {HEURES.map(h => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setHeure(h)}
                    style={{
                      padding: "12px 0",
                      minHeight: 44,
                      borderRadius: 8,
                      border: heure === h ? "2px solid #111" : "1.5px solid #e5e7eb",
                      background: heure === h ? "#111" : "white",
                      color: heure === h ? "white" : "#111",
                      fontSize: 14,
                      fontWeight: heure === h ? 800 : 600,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    {h}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: "#6b7280", display: "block", marginBottom: 6 }}>Message (optionnel)</label>
            <textarea style={{ ...inp, resize: "vertical", minHeight: 70 }} value={message}
              onChange={e => setMessage(e.target.value)} placeholder="Présentez-vous brièvement..." />
          </div>

          {erreur && (
            <div style={{ background: "#fee2e2", color: "#dc2626", padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, marginBottom: 14 }}>
              {erreur}
            </div>
          )}

          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => { setOpen(false); setErreur("") }}
              style={{ flex: 1, padding: "10px 0", background: "none", border: "1.5px solid #e5e7eb", borderRadius: 999, cursor: "pointer", fontWeight: 600, fontSize: 14, fontFamily: "inherit" }}>
              Annuler
            </button>
            <button onClick={proposer} disabled={saving}
              style={{ flex: 2, padding: "10px 0", background: "#111", color: "white", border: "none", borderRadius: 999, cursor: saving ? "not-allowed" : "pointer", fontWeight: 700, fontSize: 14, fontFamily: "inherit", opacity: saving ? 0.6 : 1 }}>
              {saving ? "Envoi..." : "Envoyer la demande"}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
