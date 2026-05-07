"use client"

// V11.14 (Paul 2026-04-28) — full-bleed messagerie. User feedback :
// "enlever le layout sur toute la partie message même sur pc je ne trouve
// pas ça necessaire". V11.10 ne hidait Footer + AdminBar que dans un
// thread (convActive). Maintenant : sur TOUTE la route /messages.
//
// Mécanisme : ce client component dispatch 'km:messages-route-active' au
// mount et au unmount. Footer + AdminBar (V11.10) listenent l'event en
// plus de 'km:thread-active'. Navbar listene en plus de
// 'km:thread-mobile-open' (mobile-only hide sur toute la route).
//
// Pourquoi un event au lieu d'un context : Footer/AdminBar/Navbar sont
// mounts dans app/layout.tsx (parent), ils ne peuvent pas consommer un
// context fourni par un descendant. L'event window est le pattern le
// plus simple pour cette comm parent <- descendant.

import { useEffect } from "react"

export default function MessagesRouteSignal() {
  useEffect(() => {
    if (typeof window === "undefined") return
    window.dispatchEvent(new CustomEvent("km:messages-route-active", { detail: { open: true } }))
    return () => {
      window.dispatchEvent(new CustomEvent("km:messages-route-active", { detail: { open: false } }))
    }
  }, [])
  return null
}
