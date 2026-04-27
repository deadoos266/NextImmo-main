"use client"
import { useRouter, usePathname } from "next/navigation"
import { useRole } from "../providers"

export type ActiveRole = "locataire" | "proprietaire"

/**
 * Hook qui pilote le toggle "Mode Locataire ↔ Mode Proprietaire" type
 * Airbnb. Decoupe de useRole() pour exposer une API claire au composant
 * RoleSwitchToggle (Paul 2026-04-27).
 *
 * - canSwitch : true si l'user a acces aux 2 roles. Tout user authentifie
 *   = locataire par defaut (profil + dossier). canBeProprio depend de la
 *   DB (annonce ou flag is_proprietaire).
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
  const { proprietaireActive, setProprietaireActive, canBeProprio } = useRole()
  const router = useRouter()
  const pathname = usePathname()

  const canSwitch = canBeProprio
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
