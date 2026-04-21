"use client"
import { useEffect } from "react"
import { applyTheme, getStoredTheme } from "../../lib/theme"

export default function ThemeApplier() {
  useEffect(() => {
    applyTheme(getStoredTheme())
  }, [])
  return null
}
