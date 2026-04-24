"use client"
import ThemeToggle from "../components/ThemeToggle"

export default function OngletApparence() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@1,9..144,500&display=swap');`}</style>
      <section style={{ background: "white", border: "1px solid #EAE6DF", borderRadius: 20, padding: 28, boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
        <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontWeight: 500, fontSize: 22, letterSpacing: "-0.3px", color: "#111", margin: "0 0 6px" }}>Thème</h2>
        <p style={{ fontSize: 13, color: "#8a8477", margin: "0 0 18px" }}>
          Choisissez l&apos;apparence qui vous convient le mieux. Le réglage est appliqué instantanément sur cet appareil.
        </p>
        <ThemeToggle />
      </section>
    </div>
  )
}
