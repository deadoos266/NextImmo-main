"use client"
import { useRouter, usePathname } from "next/navigation"
import { useSession } from "next-auth/react"
import { useRole } from "../providers"

export type ActiveRole = "locataire" | "proprietaire"

/**
 * Hook qui pilote le toggle "Mode Locataire ↔ Mode Proprietaire" type
 * Airbnb. Decoupe de useRole() pour exposer une API claire au composant
 * RoleSwitchToggle (Paul 2026-04-27).
 *
 * V41 (Paul 2026-04-29) — bug fix user "c'est toi qui a enlevé le fait
 * qu'on puisse changer du proprio au locataire ?". Avant : canSwitch était
 * gated par canBeProprio (= au moins 1 annonce OU flag is_proprietaire).
 * Conséquence : pure-locataire ne voyait JAMAIS le toggle, donc impossible
 * de basculer en mode proprio pour publier sa 1ère annonce. Pareil pour
 * un proprio dont les annonces ont été supprimées et qui se retrouve
 * bloqué.
 *
 * Maintenant : canSwitch = user logged-in. Le clic "Propriétaire" sur un
 * pure-locataire le bascule vers le dashboard /proprietaire qui propose
 * l'onboarding "Publier une annonce". Côté DB, le flag is_proprietaire
 * n'est posé qu'à la 1ère annonce — le toggle reste cohérent.
 *
 * - canSwitch : true si user authentifié.
 * - currentRole : 'proprietaire' si proprietaireActive=true, sinon
 *   'locataire'.
 * - switchTo(role) : update proprietaireActive + redirect home si l'user
 *   etait sur une page non-coherente avec le nouveau role.
 */
export function useRoleSwitch(): {
  canSwitch: boolean
  currentRole: ActiveRole
  switchTo: (role: ActiveRole) => void
} {
  const { proprietaireActive, setProprietaireActive } = useRole()
  const { status } = useSession()
  const router = useRouter()
  const pathname = usePathname()

  const canSwitch = status === "authenticated"
  const currentRole: ActiveRole = proprietaireActive ? "proprietaire" : "locataire"

  function switchTo(targetRole: ActiveRole) {
    if (targetRole === currentRole) return
    setProprietaireActive(targetRole === "proprietaire")

    // Redirect si l'user etait sur une page reservee au role qu'il vient de
    // quitter (ex: locataire qui passe en proprio sur /dossier → redirect
    // /proprietaire ; proprio qui passe en locataire sur /proprietaire/* →
    // redirect /annonces).
    if (!pathname) return
    if (targetRole === "locataire" && pathname.startsWith("/proprietaire")) {
      router.push("/annonces")
    } else if (targetRole === "proprietaire" && (pathname.startsWith("/dossier") || pathname.startsWith("/mes-candidatures") || pathname.startsWith("/mon-logement"))) {
      router.push("/proprietaire")
    }
  }

  return { canSwitch, currentRole, switchTo }
}
