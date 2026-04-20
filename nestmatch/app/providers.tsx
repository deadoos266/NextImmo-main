"use client"
import { SessionProvider, useSession } from "next-auth/react"
import { createContext, useContext, useState, useEffect, ReactNode } from "react"
import { supabase } from "../lib/supabase"

type Role = "locataire" | "proprietaire"

interface RoleContextType {
  role: Role
  setRole: (r: Role) => void
  isAdmin: boolean
  setIsAdmin: (v: boolean) => void
  proprietaireActive: boolean
  setProprietaireActive: (v: boolean) => void
  mounted: boolean
}

const RoleContext = createContext<RoleContextType>({
  role: "locataire",
  setRole: () => {},
  isAdmin: false,
  setIsAdmin: () => {},
  proprietaireActive: false,
  setProprietaireActive: () => {},
  mounted: false,
})

export function useRole() { return useContext(RoleContext) }

function RoleProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession()
  // IMPORTANT : on ne lit JAMAIS localStorage dans l'init de useState.
  // Le SSR rend les defaults ("locataire" / false), mais le premier render
  // client lirait les vraies valeurs de localStorage → divergence HTML → React
  // error #418 (hydration mismatch) qui fait exploser le tree (Navbar, AdminBar,
  // ScoreBlock, ContactButton, OwnerActions, Footer se re-génèrent) et donne
  // l'impression que les annonces "disparaissent" quand on est connecté.
  // On hydrate depuis localStorage dans un useEffect post-mount. Les
  // consommateurs qui veulent éviter le flash "Locataire → Propriétaire"
  // utilisent le flag `mounted` exposé dans le context.
  const [role, setRoleState] = useState<Role>("locataire")
  const [isAdmin, setIsAdminState] = useState(false)
  const [proprietaireActive, setProprietaireActiveState] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const savedRole = localStorage.getItem("nestmatch_role")
    if (savedRole === "proprietaire") setRoleState("proprietaire")
    if (localStorage.getItem("nestmatch_admin") === "true") setIsAdminState(true)
    if (localStorage.getItem("nestmatch_proprio_active") === "true") setProprietaireActiveState(true)
    setMounted(true)
  }, [])

  // Sync role et isAdmin depuis la session authentifiée
  useEffect(() => {
    if (status === "authenticated" && session?.user) {
      const sessionRole = session.user.role
      if (sessionRole === "locataire" || sessionRole === "proprietaire") {
        setRoleState(sessionRole)
        localStorage.setItem("nestmatch_role", sessionRole)
      }
      const sessionIsAdmin = session.user.isAdmin ?? false
      setIsAdminState(sessionIsAdmin)
      localStorage.setItem("nestmatch_admin", sessionIsAdmin ? "true" : "false")
    } else if (status === "unauthenticated") {
      setProprietaireActiveState(false)
      setRoleState("locataire")
      localStorage.removeItem("nestmatch_admin")
      localStorage.removeItem("nestmatch_proprio_active")
    }
  }, [session, status])

  // Auto-sync `proprietaireActive` UNIQUEMENT si pas de choix manuel stocké.
  // Dès que le user (ou admin) a cliqué une fois sur le toggle AdminBar,
  // localStorage contient "true" ou "false" et on ne re-sync PLUS JAMAIS.
  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.email) return
    const saved = localStorage.getItem("nestmatch_proprio_active")
    if (saved === "true" || saved === "false") {
      // Choix manuel déjà fait — on respecte, on ne touche à rien
      return
    }
    // Pas de choix stocké → on détecte depuis la DB
    const email = session.user.email
    Promise.all([
      supabase.from("profils").select("is_proprietaire").eq("email", email).single(),
      supabase.from("annonces").select("id", { count: "exact", head: true }).eq("proprietaire_email", email),
    ]).then(([{ data: profil }, { count }]) => {
      const isProprio = profil?.is_proprietaire === true || (count ?? 0) > 0
      setProprietaireActiveState(isProprio)
      localStorage.setItem("nestmatch_proprio_active", isProprio ? "true" : "false")
    })
  }, [session, status])

  function setRole(r: Role) {
    setRoleState(r)
    localStorage.setItem("nestmatch_role", r)
  }

  function setIsAdmin(v: boolean) {
    setIsAdminState(v)
    localStorage.setItem("nestmatch_admin", v ? "true" : "false")
  }

  function setProprietaireActive(v: boolean) {
    setProprietaireActiveState(v)
    localStorage.setItem("nestmatch_proprio_active", v ? "true" : "false")
  }

  return (
    <RoleContext.Provider value={{ role, setRole, isAdmin, setIsAdmin, proprietaireActive, setProprietaireActive, mounted }}>
      {children}
    </RoleContext.Provider>
  )
}

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <RoleProvider>
        {children}
      </RoleProvider>
    </SessionProvider>
  )
}
