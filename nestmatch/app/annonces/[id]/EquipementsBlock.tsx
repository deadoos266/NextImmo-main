"use client"
import { useState } from "react"
import EquipementsModal from "./EquipementsModal"
import { countEquipementsActifs, getAperçuEquipements } from "../../../lib/equipements"

/**
 * Bloc équipements de la fiche annonce, vu par le locataire potentiel.
 *
 * Rend un aperçu compact (jusqu'à 4 équipements clés issus de
 * `annonce.equipements_extras`) + un bouton "Voir tous les équipements"
 * qui ouvre une popup détaillant toute la liste par groupe.
 *
 * Pourquoi en client component : la fiche annonce parente est server-rendered
 * (pas de useState). Cette portion isolée gère l'état modale localement
 * sans casser le SSR du reste de la page.
 *
 * Si aucun équipement n'est renseigné par le proprio, le bloc se masque
 * complètement (return null) plutôt que d'afficher une coquille vide.
 */
export default function EquipementsBlock({
  extras,
}: {
  extras: Record<string, unknown> | null | undefined
}) {
  const [open, setOpen] = useState(false)
  const total = countEquipementsActifs(extras)
  if (total === 0) return null
  const aperçu = getAperçuEquipements(extras, 4)
  const restants = Math.max(0, total - aperçu.length)

  return (
    <div style={{ background: "white", borderRadius: 20, padding: 22, boxShadow: "0 4px 24px rgba(0,0,0,0.06)" }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "1.2px", margin: 0, marginBottom: 8 }}>
        Équipements
      </p>
      <h3 style={{ fontSize: 16, fontWeight: 400, fontStyle: "italic", fontFamily: "'Fraunces', 'DM Sans', serif", letterSpacing: "-0.3px", margin: 0, marginBottom: 14, color: "#111" }}>
        Ce qui est inclus dans le bien
      </h3>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {aperçu.map(eq => (
          <li key={eq.k} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#111" }}>
            <span aria-hidden style={{
              width: 18, height: 18, borderRadius: "50%",
              background: "#F0FAEE", color: "#15803d",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </span>
            {eq.label}
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          marginTop: 14,
          background: "transparent",
          border: "1px solid #111",
          borderRadius: 999,
          padding: "8px 18px",
          fontSize: 12,
          fontWeight: 700,
          color: "#111",
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        Voir tous les équipements{restants > 0 ? ` (${total})` : ""}
      </button>

      <EquipementsModal open={open} onClose={() => setOpen(false)} extras={extras} />
    </div>
  )
}
