"use client"
import ThemeToggle from "../components/ThemeToggle"

export default function OngletApparence() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <section style={{ background: "white", borderRadius: 20, padding: 28 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 4px" }}>Thème</h2>
        <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 18px" }}>
          Choisissez l&apos;apparence qui vous convient le mieux. Le réglage est appliqué instantanément sur cet appareil.
        </p>
        <ThemeToggle />
      </section>
    </div>
  )
}
