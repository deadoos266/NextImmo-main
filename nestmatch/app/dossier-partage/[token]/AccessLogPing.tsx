"use client"
import { useEffect } from "react"

/**
 * Client mount only — notifie l'API que ce dossier partagé vient d'être
 * consulté. L'insert est fire-and-forget et rate-limité côté serveur.
 * Permet au locataire de voir "qui a consulté mon dossier" dans /dossier.
 */
export default function AccessLogPing({ token }: { token: string }) {
  useEffect(() => {
    fetch("/api/dossier/access-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, userAgent: navigator.userAgent }),
    }).catch(() => { /* silencieux — ne bloque pas l'affichage */ })
  }, [token])
  return null
}
