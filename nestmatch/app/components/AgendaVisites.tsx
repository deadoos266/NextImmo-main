"use client"
import { useState } from "react"
import Link from "next/link"
import { STATUT_VISITE_STYLE as STATUT, STATUT_VISITE_DOT as DOT } from "../../lib/visitesHelpers"

const JOURS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"]
const MOIS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"]

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
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@1,9..144,500&display=swap');`}</style>
      {/* Header navigation */}
      <div style={{ background: "#fff", border: "1px solid #EAE6DF", borderRadius: 20, padding: "22px 26px", marginBottom: 16, boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <button onClick={prevMois}
            style={{ width: 36, height: 36, borderRadius: "50%", border: "1px solid #EAE6DF", background: "#F7F4EF", cursor: "pointer", fontWeight: 600, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", color: "#111", fontFamily: "inherit" }}>
            ‹
          </button>
          <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontWeight: 500, fontSize: 22, letterSpacing: "-0.3px", color: "#111", margin: 0 }}>
            {MOIS[mois]} {annee}
          </h2>
          <button onClick={nextMois}
            style={{ width: 36, height: 36, borderRadius: "50%", border: "1px solid #EAE6DF", background: "#F7F4EF", cursor: "pointer", fontWeight: 600, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", color: "#111", fontFamily: "inherit" }}>
            ›
          </button>
        </div>

        {/* Jours de la semaine */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 8 }}>
          {JOURS.map(j => (
            <div key={j} style={{ textAlign: "center", fontSize: 10, fontWeight: 700, color: "#8a8477", padding: "4px 0", textTransform: "uppercase", letterSpacing: "1.2px" }}>
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
                  borderRadius: 12,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  cursor: hasVisite ? "pointer" : "default",
                  background: isSelected ? "#111" : isToday ? "#F7F4EF" : "#fff",
                  border: isSelected ? "1px solid #111" : isToday ? "1px solid #EAE6DF" : "1px solid #F0ECE5",
                  transition: "all 0.15s ease",
                  padding: "8px 8px 6px",
                  overflow: "hidden",
                }}
                onMouseEnter={e => { if (hasVisite && !isSelected) e.currentTarget.style.background = "#F7F4EF" }}
                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = isToday ? "#F7F4EF" : "#fff" }}
              >
                {/* Numéro du jour */}
                <span style={{
                  fontSize: 13, fontWeight: isToday || isSelected ? 700 : 500,
                  color: isSelected ? "#fff" : isToday ? "#111" : "#111",
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
                    borderLeft: `3px solid ${isSelected ? "#fff" : DOT[v.statut]}`,
                    borderRadius: "0 4px 4px 0",
                    padding: "2px 5px",
                    marginBottom: 2,
                  }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: isSelected ? "#fff" : DOT[v.statut], display: "block", lineHeight: 1.3 }}>
                      {v.heure}
                    </span>
                  </div>
                ))}
                {visitesDuJour.length > 2 && (
                  <span style={{ fontSize: 9, fontWeight: 700, color: isSelected ? "rgba(255,255,255,0.7)" : "#8a8477", marginTop: 1 }}>
                    +{visitesDuJour.length - 2} autre{visitesDuJour.length - 2 > 1 ? "s" : ""}
                  </span>
                )}
              </div>
            )
          })}
        </div>

        {/* Légende */}
        <div style={{ display: "flex", gap: 16, marginTop: 16, paddingTop: 14, borderTop: "1px solid #EAE6DF", flexWrap: "wrap" }}>
          {Object.entries(DOT).map(([statut, color]) => (
            <div key={statut} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
              <span style={{ fontSize: 11, color: "#8a8477" }}>{STATUT[statut]?.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Détail du jour sélectionné */}
      {jourSelectionne && (
        <div style={{ background: "#fff", border: "1px solid #EAE6DF", borderRadius: 20, padding: "22px 26px", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
          <h3 style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontWeight: 500, fontSize: 20, letterSpacing: "-0.3px", color: "#111", marginTop: 0, marginBottom: 18, textTransform: "capitalize" }}>
            {new Date(jourSelectionne + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </h3>

          {visitesJour.length === 0 ? (
            <p style={{ fontSize: 14, color: "#8a8477", margin: 0 }}>Aucune visite ce jour</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {visitesJour.map((v: any) => {
                const bien = getBien(v.annonce_id)
                const s = STATUT[v.statut] ?? STATUT["proposée"]
                const photo = Array.isArray(bien?.photos) && bien.photos.length > 0 ? bien.photos[0] : null
                return (
                  <div key={v.id} style={{ border: `1px solid ${s.border || "#EAE6DF"}`, borderRadius: 16, overflow: "hidden", display: "flex", background: "#fff" }}>
                    {photo ? (
                      <div style={{ width: 88, flexShrink: 0 }}>
                        <img src={photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      </div>
                    ) : (
                      <div style={{ width: 88, flexShrink: 0, background: "#F7F4EF", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontSize: 24, color: "#8a8477" }}>{(bien?.titre || "B")[0].toUpperCase()}</div>
                    )}
                    <div style={{ flex: 1, padding: "14px 18px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8, gap: 10 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontWeight: 600, fontSize: 14, color: "#111", margin: 0, letterSpacing: "-0.2px" }}>{bien?.titre || "Bien"}</p>
                          <p style={{ fontSize: 12, color: "#8a8477", margin: "2px 0 0" }}>{bien?.ville}{bien?.prix ? <> <span style={{ color: "#EAE6DF" }}>·</span> {bien.prix} €/mois</> : ""}</p>
                        </div>
                        <span style={{ background: s.bg, color: s.color, border: `1px solid ${s.border || "#EAE6DF"}`, fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 999, flexShrink: 0, textTransform: "uppercase", letterSpacing: "1.2px" }}>
                          {s.label}
                        </span>
                      </div>

                      <p style={{ fontSize: 14, fontWeight: 600, color: "#111", margin: "0 0 4px" }}>{v.heure}</p>

                      {mode === "proprietaire" && (
                        <p style={{ fontSize: 12, color: "#8a8477", margin: "0 0 8px" }}>{v.locataire_email}</p>
                      )}
                      {v.message && (
                        <p style={{ fontSize: 12, color: "#8a8477", fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", margin: "0 0 10px" }}>«&nbsp;{v.message}&nbsp;»</p>
                      )}

                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {mode === "proprietaire" && v.statut === "proposée" && onChangerStatut && (v.propose_par || "").toLowerCase() !== (myEmail || "").toLowerCase() && (
                          <>
                            <button onClick={() => onChangerStatut(v.id, "confirmée")}
                              style={{ background: "#111", color: "#fff", border: "none", borderRadius: 999, padding: "7px 16px", fontWeight: 600, fontSize: 11, cursor: "pointer", fontFamily: "inherit", textTransform: "uppercase", letterSpacing: "0.3px" }}>
                              Confirmer
                            </button>
                            <button onClick={() => onChangerStatut(v.id, "annulée")}
                              style={{ background: "#fff", border: "1px solid #F4C9C9", color: "#b91c1c", borderRadius: 999, padding: "7px 16px", fontWeight: 600, fontSize: 11, cursor: "pointer", fontFamily: "inherit", textTransform: "uppercase", letterSpacing: "0.3px" }}>
                              Refuser
                            </button>
                          </>
                        )}
                        {mode === "proprietaire" && v.statut === "proposée" && (v.propose_par || "").toLowerCase() === (myEmail || "").toLowerCase() && (
                          <span style={{ fontSize: 11, color: "#8a8477", fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic" }}>
                            En attente du locataire
                          </span>
                        )}
                        {mode === "proprietaire" && v.statut === "confirmée" && onChangerStatut && (
                          <button onClick={() => onChangerStatut(v.id, "effectuée")}
                            style={{ background: "#F7F4EF", border: "1px solid #EAE6DF", color: "#111", borderRadius: 999, padding: "7px 16px", fontWeight: 600, fontSize: 11, cursor: "pointer", fontFamily: "inherit", textTransform: "uppercase", letterSpacing: "0.3px" }}>
                            Marquer effectuée
                          </button>
                        )}
                        {mode === "locataire" && v.statut === "proposée" && (
                          <Link href={`/annonces/${v.annonce_id}`}
                            style={{ fontSize: 11, fontWeight: 600, color: "#111", textDecoration: "none", border: "1px solid #EAE6DF", borderRadius: 999, padding: "7px 16px", background: "#fff", textTransform: "uppercase", letterSpacing: "0.3px" }}>
                            Voir l&apos;annonce
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
        <div style={{ textAlign: "center", padding: "32px 24px", background: "#fff", border: "1px solid #EAE6DF", borderRadius: 20, color: "#8a8477", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
          <p style={{ fontSize: 14, margin: 0 }}>Aucune visite ce mois-ci</p>
        </div>
      )}
    </div>
  )
}
