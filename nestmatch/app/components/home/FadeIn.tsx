"use client"
import { useEffect, useRef, useState } from "react"

/**
 * Wrapper IntersectionObserver : fade-in discret au scroll.
 * Opacity 0 -> 1 + translateY 20px -> 0, 600ms ease-out.
 * threshold 0.15 : se déclenche quand ~15 % du bloc est visible.
 *
 * Respecte prefers-reduced-motion : si l'user a activé la réduction
 * d'animations dans son OS, on rend l'élément déjà visible.
 */
export default function FadeIn({
  children,
  delay = 0,
  as = "div",
}: {
  children: React.ReactNode
  delay?: number
  as?: "div" | "section" | "article"
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    setReducedMotion(mq.matches)
  }, [])

  useEffect(() => {
    if (reducedMotion) {
      setVisible(true)
      return
    }
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true)
            observer.unobserve(entry.target)
          }
        }
      },
      { threshold: 0.15 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [reducedMotion])

  const style: React.CSSProperties = {
    opacity: visible ? 1 : 0,
    transform: visible ? "translateY(0)" : "translateY(20px)",
    transition: `opacity 600ms ease-out ${delay}ms, transform 600ms ease-out ${delay}ms`,
    willChange: visible ? "auto" : "opacity, transform",
  }

  const Component = as
  return (
    <Component ref={ref as React.RefObject<HTMLDivElement>} style={style}>
      {children}
    </Component>
  )
}
