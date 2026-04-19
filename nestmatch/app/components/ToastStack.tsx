"use client"
import { useEffect, useState, useCallback } from "react"
import { createPortal } from "react-dom"
import { useSession } from "next-auth/react"
import { usePathname, useRouter } from "next/navigation"
import { supabase } from "../../lib/supabase"

type ToastType = "message" | "visite_nouvelle" | "visite_confirmee" | "visite_annulee"

type Toast = {
  id: number
  type: ToastType
  title: string
  body?: string
  href?: string
  emoji?: string
}

const COLORS: Record<ToastType, { bg: string; border: string }> = {
  message:           { bg: "#eff6ff", border: "#bfdbfe" },
  visite_nouvelle:   { bg: "#fff7ed", border: "#fed7aa" },
  visite_confirmee:  { bg: "#f0fdf4", border: "#bbf7d0" },
  visite_annulee:    { bg: "#fef2f2", border: "#fecaca" },
}

/**
 * Provider global de notifications temps réel.
 * Monté une fois dans layout.tsx — écoute les events Supabase Realtime
 * pour l'user connecté et affiche des toasts en bas à droite.
 *
 * Ne toast pas si on est déjà sur la page concernée (pas de bruit).
 */
export default function ToastStack() {
  const { data: session } = useSession()
  const pathname = usePathname()
  const router = useRouter()
  const email = session?.user?.email?.toLowerCase() ?? null
  const [toasts, setToasts] = useState<Toast[]>([])
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev, { ...t, id }])
    setTimeout(() => dismiss(id), 5500)
  }, [dismiss])

  useEffect(() => {
    if (!email) return

    const channel = supabase.channel(`toasts-${email}`)
      // Nouveau message reçu
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `to_email=eq.${email}` }, (payload) => {
        const m = payload.new as any
        // Skip si déjà sur /messages (user voit direct le message)
        if (pathname?.startsWith("/messages")) return
        // Messages système : toast spécifique selon le préfixe
        const raw = m.contenu || ""
        if (raw.startsWith("[DOSSIER_CARD]") || raw.startsWith("[DEMANDE_DOSSIER]")) return
        if (raw.startsWith("[EDL_CARD]")) {
          push({ type: "message", title: "État des lieux partagé", body: "Ouvrir vos messages", href: "/messages" })
          return
        }
        if (raw.startsWith("[BAIL_CARD]")) {
          push({ type: "message", title: "Bail reçu", body: "Ouvrir vos messages", href: "/messages" })
          return
        }
        if (raw.startsWith("[QUITTANCE_CARD]")) {
          push({ type: "message", title: "Quittance reçue", body: "Ouvrir vos messages", href: "/messages" })
          return
        }
        if (raw.startsWith("[CANDIDATURE_RETIREE]")) {
          push({ type: "visite_annulee", title: "Candidature retirée", body: "Le locataire a retiré sa candidature", href: "/messages" })
          return
        }
        if (raw.startsWith("[RELANCE]")) {
          push({ type: "message", title: "Relance candidat", body: raw.replace("[RELANCE]", "").slice(0, 80), href: "/messages" })
          return
        }
        if (raw.startsWith("[LOCATION_ACCEPTEE]")) {
          push({ type: "visite_confirmee", title: "Candidature acceptée !", body: "Rendez-vous dans « Mon logement »", href: "/mon-logement" })
          return
        }
        const preview = raw.replace(/^\[REPLY:\d+\]\n/, "").slice(0, 80)
        push({
          type: "message",
          title: "Nouveau message",
          body: preview,
          href: "/messages",
        })
      })
      // Nouvelle visite qui me concerne
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "visites" }, (payload) => {
        const v = payload.new as any
        const prop = (v.proprietaire_email || "").toLowerCase()
        const loc = (v.locataire_email || "").toLowerCase()
        if (prop !== email && loc !== email) return
        // Pas de toast si c'est moi qui ai proposé
        if ((v.propose_par || "").toLowerCase() === email) return
        if (pathname?.startsWith("/visites") || pathname?.startsWith("/messages")) return
        const dateStr = v.date_visite ? String(v.date_visite).split("T")[0] : ""
        push({
          type: "visite_nouvelle",
          title: "Nouvelle demande de visite",
          body: `${dateStr} à ${v.heure || ""}`,
          href: "/visites",
        })
      })
      // Changement de statut visite
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "visites" }, (payload) => {
        const v = payload.new as any
        const old = payload.old as any
        const prop = (v.proprietaire_email || "").toLowerCase()
        const loc = (v.locataire_email || "").toLowerCase()
        if (prop !== email && loc !== email) return
        if (v.statut === old?.statut) return
        if (v.statut === "confirmée") {
          push({ type: "visite_confirmee", title: "Visite confirmée", body: `${String(v.date_visite).split("T")[0]} à ${v.heure}`, href: "/visites" })
        } else if (v.statut === "annulée") {
          push({ type: "visite_annulee", title: "Visite annulée", body: `${String(v.date_visite).split("T")[0]} à ${v.heure}`, href: "/visites" })
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [email, pathname, push])

  if (!mounted || !email || toasts.length === 0) return null

  const stack = (
    <div
      aria-live="polite"
      style={{
        position: "fixed",
        bottom: 20,
        right: 20,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        maxWidth: 380,
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      {toasts.map(t => {
        const c = COLORS[t.type]
        return (
          <div
            key={t.id}
            role="status"
            onClick={() => { if (t.href) router.push(t.href); dismiss(t.id) }}
            style={{
              background: c.bg,
              border: `1.5px solid ${c.border}`,
              borderRadius: 14,
              padding: "12px 14px",
              boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
              cursor: t.href ? "pointer" : "default",
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
              animation: "toastSlideIn 0.22s ease-out",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 800, color: "#111", margin: 0 }}>{t.title}</p>
              {t.body && (
                <p style={{ fontSize: 12, color: "#4b5563", margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const }}>
                  {t.body}
                </p>
              )}
            </div>
            <button
              onClick={e => { e.stopPropagation(); dismiss(t.id) }}
              aria-label="Fermer"
              style={{ background: "none", border: "none", color: "#9ca3af", fontSize: 18, cursor: "pointer", padding: 0, lineHeight: 1, flexShrink: 0 }}
            >
              ×
            </button>
          </div>
        )
      })}
      <style>{`
        @keyframes toastSlideIn {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  )

  return createPortal(stack, document.body)
}
