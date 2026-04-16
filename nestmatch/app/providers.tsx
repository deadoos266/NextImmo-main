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
  const [role, setRoleState] = useState<Role>("locataire")
  const [isAdmin, setIsAdminState] = useState(false)
  const [proprietaireActive, setProprietaireActiveState] = useState(false)
  const [mounted, setMounted] = useState(false)

  // Initialise from localStorage on mount, then override with session values
  useEffect(() => {
    const saved = localStorage.getItem("nestmatch_role") as Role | null
    if (saved === "locataire" || saved === "proprietaire") setRoleState(saved)
    setMounted(true)
  }, [])

  // Sync role and isAdmin from the authenticated session
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
    }
  }, [session, status])

  // Check proprietaire status: profil flag OR has published annonces
  useEffect(() => {
    if (status === "authenticated" && session?.user?.email) {
      const email = session.user.email
      Promise.all([
        supabase.from("profils").select("is_proprietaire").eq("email", email).single(),
        supabase.from("annonces").select("id", { count: "exact", head: true }).eq("proprietaire_email", email),
      ]).then(([{ data: profil }, { count }]) => {
        const isProprio = profil?.is_proprietaire === true || (count ?? 0) > 0
        setProprietaireActiveState(isProprio)
        localStorage.setItem("nestmatch_proprio_active", isProprio ? "true" : "false")
      })
    }
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
