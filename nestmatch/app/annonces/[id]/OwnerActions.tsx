"use client"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useState } from "react"

export default function OwnerActions({
  proprietaireEmail,
  annonceId,
  statut,
}: {
  proprietaireEmail: string
  annonceId: number
  statut?: string | null
}) {
  const { data: session } = useSession()
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)
  const [terminating, setTerminating] = useState(false)

  const isOwner = session?.user?.email && session.user.email === proprietaireEmail
  const isAdmin = !!session?.user?.isAdmin

  // Ni proprio ni admin → pas d'actions
  if (!isOwner && !isAdmin) return null

  const isLouee = statut === "loué"
  const isTerminee = statut === "loue_termine"

  const btnStyle = {
    display: "inline-flex",
    alignItems: "center",
    padding: "10px 18px",
    borderRadius: 999,
    fontWeight: 700,
    fontSize: 13,
    textDecoration: "none",
    fontFamily: "'DM Sans', sans-serif",
    cursor: "pointer",
  } as const

  async function terminerBail() {
    if (terminating) return
    if (!confirm(`Mettre fin au bail de cette annonce ?\n\n• Le bien passera dans "Mes anciens biens"\n• L'auto-paiement sera désactivé\n• Le locataire verra ce bien dans ses "anciens logements"\n• L'historique (quittances, échanges, EDL) reste accessible aux deux parties\n\nCette action est définitive.`)) return
    setTerminating(true)
    try {
      const res = await fetch("/api/annonces/terminer-bail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ annonceId }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) {
        alert(`Echec : ${json.error || res.statusText}`)
        return
      }
      router.refresh()
    } finally {
      setTerminating(false)
    }
  }

  async function supprimerAdmin() {
    if (deleting) return
    if (!confirm(`[ADMIN] Supprimer l'annonce #${annonceId} ?\n\nCette action est IRREVERSIBLE. Pensez à prévenir le propriétaire si la suppression est légitime.`)) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/annonces/${annonceId}`, { method: "DELETE" })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.success) {
        alert(`Suppression échouée : ${json.error || res.statusText}`)
        return
      }
      router.push("/annonces")
      router.refresh()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" as const }}>
      {isOwner && !isTerminee && (
        <>
          <Link
            href={`/proprietaire/modifier/${annonceId}`}
            style={{ ...btnStyle, background: "#111", color: "white", border: "none" }}
          >
            Modifier l&apos;annonce
          </Link>
          <Link
            href={`/proprietaire/stats?id=${annonceId}`}
            style={{ ...btnStyle, background: "#EEF3FB", color: "#1d4ed8", border: "1px solid #D7E3F4" }}
          >
            Statistiques
          </Link>
          {isLouee && (
            <button
              type="button"
              onClick={terminerBail}
              disabled={terminating}
              style={{ ...btnStyle, background: "#FBF6EA", color: "#a16207", border: "1px solid #F0E1B5", opacity: terminating ? 0.6 : 1 }}
              title="Bascule l'annonce dans 'Mes anciens biens' et désactive l'auto-paiement"
            >
              {terminating ? "Fin de bail…" : "Terminer le bail"}
            </button>
          )}
        </>
      )}
      {isOwner && isTerminee && (
        <Link
          href={`/proprietaire/stats?id=${annonceId}`}
          style={{ ...btnStyle, background: "#F7F4EF", color: "#6b6559", border: "1px solid #EAE6DF" }}
        >
          Voir l&apos;historique (ancien bien)
        </Link>
      )}
      {/* Bouton admin : visible aux admins MEME s'ils ne sont pas proprio.
          Gate serveur dans /api/annonces/[id] DELETE qui re-check isAdmin. */}
      {isAdmin && !isOwner && (
        <button
          type="button"
          onClick={supprimerAdmin}
          disabled={deleting}
          style={{ ...btnStyle, background: "#FEECEC", color: "#b91c1c", border: "1px solid #F4C9C9", fontWeight: 800, opacity: deleting ? 0.6 : 1 }}
          title="Suppression en tant qu'admin — la page /admin > onglet Annonces permet la même action"
        >
          {deleting ? "Suppression…" : "Supprimer (admin)"}
        </button>
      )}
    </div>
  )
}
