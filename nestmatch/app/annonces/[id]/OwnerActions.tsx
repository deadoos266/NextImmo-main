"use client"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useState } from "react"

export default function OwnerActions({
  proprietaireEmail,
  annonceId,
}: {
  proprietaireEmail: string
  annonceId: number
}) {
  const { data: session } = useSession()
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)

  const isOwner = session?.user?.email && session.user.email === proprietaireEmail
  const isAdmin = !!session?.user?.isAdmin

  // Ni proprio ni admin → pas d'actions
  if (!isOwner && !isAdmin) return null

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
      {isOwner && (
        <>
          <Link
            href={`/proprietaire/modifier/${annonceId}`}
            style={{ ...btnStyle, background: "#111", color: "white", border: "none" }}
          >
            Modifier l&apos;annonce
          </Link>
          <Link
            href={`/proprietaire/stats?id=${annonceId}`}
            style={{ ...btnStyle, background: "#eff6ff", color: "#1d4ed8", border: "1.5px solid #bfdbfe" }}
          >
            Statistiques
          </Link>
        </>
      )}
      {/* Bouton admin : visible aux admins MEME s'ils ne sont pas proprio.
          Gate serveur dans /api/annonces/[id] DELETE qui re-check isAdmin. */}
      {isAdmin && !isOwner && (
        <button
          type="button"
          onClick={supprimerAdmin}
          disabled={deleting}
          style={{ ...btnStyle, background: "#fee2e2", color: "#991b1b", border: "1.5px solid #fca5a5", fontWeight: 800, opacity: deleting ? 0.6 : 1 }}
          title="Suppression en tant qu'admin — la page /admin > onglet Annonces permet la même action"
        >
          {deleting ? "Suppression…" : "Supprimer (admin)"}
        </button>
      )}
    </div>
  )
}
