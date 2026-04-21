"use client"
import { useEffect, useState, type ReactNode } from "react"

/**
 * Gate un sous-tree derrière un flag `mounted` pour garantir que le
 * SSR et le premier render client rendent EXACTEMENT le même DOM.
 *
 * Utilisation : wrapper tout composant client qui peut diverger entre
 * SSR et CSR (lecture localStorage, window.innerWidth, Date.now, etc.).
 *
 * `fallback` DOIT être déterministe (même DOM au SSR et au CSR). Par
 * défaut `null` — prévoir un placeholder avec les bonnes dimensions
 * si on veut éviter le CLS (layout shift) post-mount.
 */
export default function MountedOnly({
  children,
  fallback = null,
}: {
  children: ReactNode
  fallback?: ReactNode
}) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  return <>{mounted ? children : fallback}</>
}
