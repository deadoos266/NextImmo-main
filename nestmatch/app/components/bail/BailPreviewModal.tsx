"use client"

// V32.1 (Paul 2026-04-29) — Modal preview PDF avant envoi au locataire.
// Audit V31 R1.1 : avant cette feature, le proprio cliquait "Générer le bail"
// → PDF + email Resend partaient en 1 clic, sans relecture. Une faute de
// frappe = bail vicié déjà signé.
//
// Flow nouveau :
// 1. Proprio clique "Générer le bail" → on construit le PDF Blob côté client.
// 2. Modal s'ouvre, iframe affiche le PDF inline (object URL).
// 3. Boutons :
//    - "Modifier les informations" → ferme modal, garde l'état du form.
//    - "Confirmer et envoyer au locataire" → trigger l'envoi (même code
//      que l'ancien `generer()` : insert message + notif + download local).
//
// Style cohérent avec le design system KeyMatch (#F7F4EF, #111, Fraunces serif
// pour le titre).

import { useEffect, useState } from "react"
import { Z_INDEX } from "../../../lib/zIndex"

interface BailPreviewModalProps {
  open: boolean
  pdfBlob: Blob | null
  filename: string
  onCancel: () => void
  onConfirm: () => void | Promise<void>
  sending: boolean
}

export default function BailPreviewModal({
  open,
  pdfBlob,
  filename,
  onCancel,
  onConfirm,
  sending,
}: BailPreviewModalProps) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!pdfBlob) {
      setPdfUrl(null)
      return
    }
    const url = URL.createObjectURL(pdfBlob)
    setPdfUrl(url)
    return () => {
      URL.revokeObjectURL(url)
    }
  }, [pdfBlob])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !sending) onCancel()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, sending, onCancel])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-label="Prévisualisation du bail avant envoi"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(17, 17, 17, 0.55)",
        // V74.5 — était 13000 hardcodé > Navbar (10000) → burger inaccessible.
        // Migration vers Z_INDEX.modal (4100) qui respecte la hiérarchie
        // modal > drawer (3200) > navbar (500).
        zIndex: Z_INDEX.modal,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 16px",
        fontFamily: "'DM Sans', sans-serif",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !sending) onCancel()
      }}
    >
      <div
        style={{
          background: "#F7F4EF",
          // V97.39.29 — mobile : prend toute la hauteur dispo + bord arrondi
          // top seul pour avoir le footer accessible sans scroll. Avant :
          // hauteur fixe min(880px, 92vh) qui causait footer hors viewport
          // sur iOS (avec URL bar dynamique) → bouton "envoyer" inaccessible.
          borderRadius: 24,
          width: "min(960px, 95vw)",
          height: "min(880px, calc(100vh - 16px))",
          maxHeight: "calc(100vh - 16px)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 24px 64px rgba(0,0,0,0.25)",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px 28px 16px",
            borderBottom: "1px solid #EAE6DF",
            background: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div>
            <p
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "1.8px",
                textTransform: "uppercase",
                color: "#666",
                margin: "0 0 4px",
              }}
            >
              Vérifiez avant d&apos;envoyer
            </p>
            <h2
              style={{
                fontFamily: "'Fraunces', Georgia, serif",
                fontStyle: "italic",
                fontWeight: 500,
                fontSize: 24,
                margin: 0,
                color: "#111",
                letterSpacing: "-0.5px",
              }}
            >
              Prévisualisation du bail
            </h2>
            <p style={{ fontSize: 12.5, color: "#8a8477", margin: "6px 0 0", lineHeight: 1.5 }}>
              Relisez attentivement. Une fois envoyé, toute modification nécessitera un avenant.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={sending}
            aria-label="Fermer la prévisualisation"
            style={{
              background: "transparent",
              border: "none",
              color: "#8a8477",
              fontSize: 24,
              cursor: sending ? "not-allowed" : "pointer",
              padding: 4,
              lineHeight: 1,
              opacity: sending ? 0.4 : 1,
            }}
          >
            ×
          </button>
        </div>

        {/* PDF iframe */}
        <div
          style={{
            flex: 1,
            background: "#EAE6DF",
            overflow: "hidden",
            position: "relative",
          }}
        >
          {pdfUrl ? (
            <iframe
              src={pdfUrl + "#toolbar=1&view=FitH"}
              title={filename}
              style={{ width: "100%", height: "100%", border: "none", background: "#fff" }}
            />
          ) : (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#8a8477",
                fontSize: 13,
              }}
            >
              Génération du PDF en cours…
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div
          style={{
            // V97.39.29 — Footer responsive. Avant : flexWrap row → bouton
            // "Confirmer et envoyer" passait sous le viewport mobile (bug Paul :
            // "ça previsualise et ça envoie pas"). Maintenant : layout vertical
            // avec bouton confirmer en BAS (pouce naturel) + 52px min-height
            // (zone tactile WCAG 2.5.5) + safe-area-inset-bottom iOS.
            padding: "16px 16px calc(16px + env(safe-area-inset-bottom))",
            background: "#fff",
            borderTop: "1px solid #EAE6DF",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <p style={{ fontSize: 11.5, color: "#8a8477", margin: 0, lineHeight: 1.4, wordBreak: "break-word" }}>
            <strong style={{ color: "#111" }}>{filename}</strong>
          </p>
          <div style={{
            display: "flex",
            gap: 8,
            flexDirection: "column-reverse",
            alignItems: "stretch",
          }}>
            <button
              type="button"
              onClick={onCancel}
              disabled={sending}
              style={{
                padding: "13px 22px",
                background: "#fff",
                color: "#111",
                border: "1px solid #EAE6DF",
                borderRadius: 999,
                fontSize: 14,
                fontWeight: 600,
                cursor: sending ? "not-allowed" : "pointer",
                fontFamily: "inherit",
                opacity: sending ? 0.4 : 1,
                minHeight: 48,
                WebkitTapHighlightColor: "rgba(0,0,0,0.1)",
              }}
            >
              Modifier les informations
            </button>
            <button
              type="button"
              onClick={() => void onConfirm()}
              disabled={sending || !pdfBlob}
              style={{
                padding: "15px 22px",
                background: "#111",
                color: "#fff",
                border: "none",
                borderRadius: 999,
                fontSize: 15,
                fontWeight: 700,
                cursor: sending || !pdfBlob ? "not-allowed" : "pointer",
                fontFamily: "inherit",
                opacity: sending || !pdfBlob ? 0.6 : 1,
                minHeight: 52,
                WebkitTapHighlightColor: "rgba(255,255,255,0.2)",
              }}
            >
              {sending ? "Envoi…" : "Confirmer et envoyer au locataire"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
