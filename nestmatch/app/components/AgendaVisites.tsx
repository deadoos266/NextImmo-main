"use client"
import { useState } from "react"
import Link from "next/link"

const JOURS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"]
const MOIS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"]

const STATUT: Record<string, { color: string; bg: string; border: string; label: string }> = {
  "proposée":  { color: "#c2410c", bg: "#fff7ed", border: "#fed7aa", label: "En attente" },
  "confirmée": { color: "#15803d", bg: "#dcfce7", border: "#bbf7d0", label: "Confirmée" },
  "annulée":   { color: "#dc2626", bg: "#fee2e2", border: "#fecaca", label: "Annulée" },
  "effectuée": { color: "#374151", bg: "#f3f4f6", border: "#e5e7eb", label: "Effectuée" },
}

const DOT: Record<string, string> = {
  "proposée":  "#f97316",
  "confirmée": "#16a34a",
  "annulée":   "#dc2626",
  "effectuée": "#9ca3af",
}

export default function AgendaVisites({
  visites,
  biens,
  mode = "locataire",
  onChangerStatut,
  myEmail,
}: {
  visites: any[]
  biens: Record<number, any> | any[]
  mode?: "locataire" | "proprietaire"
  onChangerStatut?: (id: string, statut: string) => void
  myEmail?: string | null
}) {
  const today = new Date()
  const [annee, setAnnee] = useState(today.getFullYear())
  const [mois, setMois] = useState(today.getMonth())
  const [jourSelectionne, setJourSelectionne] = useState<string | null>(null)

  function getBien(annonceId: number) {
    if (Array.isArray(biens)) return (biens as any[]).find(b => b.id === annonceId)
    return (biens as Record<number, any>)[annonceId]
  }

  function prevMois() {
    if (mois === 0) { setMois(11); setAnnee(a => a - 1) }
    else setMois(m => m - 1)
    setJourSelectionne(null)
  }
  function nextMois() {
    if (mois === 11) { setMois(0); setAnnee(a => a + 1) }
    else setMois(m => m + 1)
    setJourSelectionne(null)
  }

  // Calcul des jours du mois
  const premierJour = new Date(annee, mois, 1)
  const dernierJour = new Date(annee, mois + 1, 0)
  const nbJours = dernierJour.getDate()
  // Lundi = 0 ... Dimanche = 6
  const offsetDebut = (premierJour.getDay() + 6) % 7

  // Indexer les visites par date "YYYY-MM-DD"
  const parDate: Record<string, any[]> = {}
  visites.forEach(v => {
    const d = v.date_visite?.slice(0, 10)
    if (!d) return
    if (!parDate[d]) parDate[d] = []
    parDate[d].push(v)
  })

  const visitesJour = jourSelectionne ? (parDate[jourSelectionne] || []) : []
  const todayStr = today.toISOString().slice(0, 10)

  function dateStr(jour: number) {
    return `${annee}-${String(mois + 1).padStart(2, "0")}-${String(jour).padStart(2, "0")}`
  }

  return (
    <div>
      {/* Header navigation */}
      <div style={{ background: "white", borderRadius: 20, padding: "20px 24px", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <button onClick={prevMois}
            style={{ width: 36, height: 36, borderRadius: "50%", border: "1.5px solid #e5e7eb", background: "white", cursor: "pointer", fontWeight: 700, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>
            ‹
          </button>
          <h2 style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.3px" }}>
            {MOIS[mois]} {annee}
          </h2>
          <button onClick={nextMois}
            style={{ width: 36, height: 36, borderRadius: "50%", border: "1.5px solid #e5e7eb", background: "white", cursor: "pointer", fontWeight: 700, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>
            ›
          </button>
        </div>

        {/* Jours de la semaine */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 8 }}>
          {JOURS.map(j => (
            <div key={j} style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: "#9ca3af", padding: "4px 0", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              {j}
            </div>
          ))}
        </div>

        {/* Grille des jours */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
          {/* Cases vides avant le 1er */}
          {Array.from({ length: offsetDebut }).map((_, i) => (
            <div key={`empty-${i}`} style={{ minHeight: 80 }} />
          ))}

          {/* Jours du mois */}
          {Array.from({ length: nbJours }).map((_, i) => {
            const jour = i + 1
            const ds = dateStr(jour)
            const visitesDuJour = parDate[ds] || []
            const isToday = ds === todayStr
            const isSelected = ds === jourSelectionne
            const hasVisite = visitesDuJour.length > 0

            return (
              <div key={jour}
                onClick={() => setJourSelectionne(isSelected ? null : ds)}
                style={{
                  minHeight: 80,
                  borderRadius: 10,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  cursor: hasVisite ? "pointer" : "default",
                  background: isSelected ? "#111" : isToday ? "#f3f4f6" : "white",
                  border: isSelected ? "1.5px solid #111" : isToday ? "1.5px solid #d1d5db" : "1.5px solid #f3f4f6",
                  transition: "all 0.1s",
                  padding: "8px 8px 6px",
                  overflow: "hidden",
                }}
                onMouseEnter={e => { if (hasVisite && !isSelected) e.currentTarget.style.background = "#f9fafb" }}
                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = isToday ? "#f3f4f6" : "white" }}
              >
                {/* Numéro du jour */}
                <span style={{
                  fontSize: 13, fontWeight: isToday || isSelected ? 800 : 500,
                  color: isSelected ? "white" : isToday ? "#111" : "#374151",
                  marginBottom: hasVisite ? 5 : 0,
                  lineHeight: 1,
                }}>
                  {jour}
                </span>

                {/* Chips visites */}
                {visitesDuJour.slice(0, 2).map((v, idx) => (
                  <div key={idx} style={{
                    width: "100%",
                    background: isSelected ? "rgba(255,255,255,0.15)" : DOT[v.statut] + "22",
                    borderLeft: `3px solid ${isSelected ? "white" : DOT[v.statut]}`,
                    borderRadius: "0 4px 4px 0",
                    padding: "2px 5px",
                    marginBottom: 2,
                  }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: isSelected ? "white" : DOT[v.statut], display: "block", lineHeight: 1.3 }}>
                      {v.heure}
                    </span>
                  </div>
                ))}
                {visitesDuJour.length > 2 && (
                  <span style={{ fontSize: 9, fontWeight: 700, color: isSelected ? "rgba(255,255,255,0.7)" : "#9ca3af", marginTop: 1 }}>
                    +{visitesDuJour.length - 2} autre{visitesDuJour.length - 2 > 1 ? "s" : ""}
                  </span>
                )}
              </div>
            )
          })}
        </div>

        {/* Légende */}
        <div style={{ display: "flex", gap: 16, marginTop: 16, paddingTop: 12, borderTop: "1px solid #f3f4f6", flexWrap: "wrap" }}>
          {Object.entries(DOT).map(([statut, color]) => (
            <div key={statut} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
              <span style={{ fontSize: 11, color: "#6b7280" }}>{STATUT[statut]?.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Détail du jour sélectionné */}
      {jourSelectionne && (
        <div style={{ background: "white", borderRadius: 20, padding: "20px 24px" }}>
          <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 16 }}>
            📅 {new Date(jourSelectionne + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </h3>

          {visitesJour.length === 0 ? (
            <p style={{ fontSize: 14, color: "#9ca3af" }}>Aucune visite ce jour</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {visitesJour.map((v: any) => {
                const bien = getBien(v.annonce_id)
                const s = STATUT[v.statut] ?? STATUT["proposée"]
                const photo = Array.isArray(bien?.photos) && bien.photos.length > 0 ? bien.photos[0] : null
                return (
                  <div key={v.id} style={{ border: `1.5px solid ${s.border}`, borderRadius: 14, overflow: "hidden", display: "flex" }}>
                    {photo ? (
                      <div style={{ width: 80, flexShrink: 0 }}>
                        <img src={photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      </div>
                    ) : (
                      <div style={{ width: 80, flexShrink: 0, background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>🏠</div>
                    )}
                    <div style={{ flex: 1, padding: "12px 16px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                        <div>
                          <p style={{ fontWeight: 700, fontSize: 14 }}>{bien?.titre || "Bien"}</p>
                          <p style={{ fontSize: 12, color: "#9ca3af" }}>{bien?.ville}{bien?.prix ? ` · ${bien.prix} €/mois` : ""}</p>
                        </div>
                        <span style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}`, fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 999, flexShrink: 0 }}>
                          {s.label}
                        </span>
                      </div>

                      <p style={{ fontSize: 14, fontWeight: 700, color: "#111", marginBottom: 4 }}>⏰ {v.heure}</p>

                      {mode === "proprietaire" && (
                        <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>👤 {v.locataire_email}</p>
                      )}
                      {v.message && (
                        <p style={{ fontSize: 12, color: "#6b7280", fontStyle: "italic", marginBottom: 8 }}>"{v.message}"</p>
                      )}

                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {mode === "proprietaire" && v.statut === "proposée" && onChangerStatut && v.propose_par !== myEmail && (
                          <>
                            <button onClick={() => onChangerStatut(v.id, "confirmée")}
                              style={{ background: "#111", color: "white", border: "none", borderRadius: 999, padding: "6px 14px", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                              ✓ Confirmer
                            </button>
                            <button onClick={() => onChangerStatut(v.id, "annulée")}
                              style={{ background: "none", border: "1.5px solid #fecaca", color: "#dc2626", borderRadius: 999, padding: "6px 12px", fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                              Refuser
                            </button>
                          </>
                        )}
                        {mode === "proprietaire" && v.statut === "proposée" && v.propose_par === myEmail && (
                          <span style={{ fontSize: 11, color: "#6b7280", fontStyle: "italic" }}>
                            En attente du locataire
                          </span>
                        )}
                        {mode === "proprietaire" && v.statut === "confirmée" && onChangerStatut && (
                          <button onClick={() => onChangerStatut(v.id, "effectuée")}
                            style={{ background: "#f3f4f6", border: "none", color: "#374151", borderRadius: 999, padding: "6px 12px", fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                            Marquer effectuée
                          </button>
                        )}
                        {mode === "locataire" && v.statut === "proposée" && (
                          <Link href={`/annonces/${v.annonce_id}`}
                            style={{ fontSize: 12, fontWeight: 600, color: "#111", textDecoration: "none", border: "1.5px solid #e5e7eb", borderRadius: 999, padding: "5px 12px" }}>
                            Voir l'annonce
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Message si aucune visite ce mois */}
      {!jourSelectionne && Object.keys(parDate).filter(d => d.startsWith(`${annee}-${String(mois + 1).padStart(2, "0")}`)).length === 0 && (
        <div style={{ textAlign: "center", padding: "30px 0", background: "white", borderRadius: 20, color: "#9ca3af" }}>
          <p style={{ fontSize: 14 }}>Aucune visite ce mois-ci</p>
        </div>
      )}
    </div>
  )
}
