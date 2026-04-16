"use client"
import { useState, useEffect } from "react"

export function useResponsive() {
  const [width, setWidth] = useState(1200)

  useEffect(() => {
    setWidth(window.innerWidth)
    function onResize() { setWidth(window.innerWidth) }
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  return {
    isMobile: width < 640,
    isTablet: width >= 640 && width < 1024,
    isDesktop: width >= 1024,
  }
}
