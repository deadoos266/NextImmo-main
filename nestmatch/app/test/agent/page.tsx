import { redirect } from "next/navigation"

// Page /test/agent supprimée — c'était une interface de debug inutile en prod.
// Redirect vers l'accueil pour que les anciens liens ne cassent pas.
export default function RemovedAgentPage() {
  redirect("/")
}
