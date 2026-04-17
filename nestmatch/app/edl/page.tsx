import { redirect } from "next/navigation"

// Redirection générique : les EDL sont toujours liés à un bien spécifique.
// Un locataire consulte un EDL reçu dans ses messages, un proprio accède
// à l'EDL d'un bien via son dashboard.
export default function EdlIndex() {
  redirect("/proprietaire")
}
