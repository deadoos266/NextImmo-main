import type { Metadata } from "next"
import Link from "next/link"
import { BRAND } from "../../lib/brand"

export const metadata: Metadata = {
  title: "Hors ligne",
  robots: { index: false, follow: false },
}

export default function OfflinePage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#F7F4EF",
        fontFamily: "'DM Sans', sans-serif",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 20px",
      }}
    >
      <div
        style={{
          background: "white",
          borderRadius: 20,
          padding: "40px 32px",
          textAlign: "center",
          maxWidth: 440,
          width: "100%",
        }}
      >
        {/* Logo mark (icône seule) */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
          <svg width="72" height="72" viewBox="0 0 400 400" aria-hidden>
            <defs>
              <linearGradient id="offline-grad" x1="200" y1="60" x2="200" y2="340" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#FF8A1E" />
                <stop offset="55%" stopColor="#FF4A1C" />
                <stop offset="100%" stopColor="#E8271C" />
              </linearGradient>
            </defs>
            <path d="M 105 325 L 200 95" stroke="url(#offline-grad)" strokeWidth={54} strokeLinecap="round" strokeLinejoin="round" fill="none" />
            <path d="M 200 95 L 295 325" stroke="url(#offline-grad)" strokeWidth={54} strokeLinecap="round" strokeLinejoin="round" fill="none" />
            <g fill="url(#offline-grad)">
              <rect x={178} y={228} width={20} height={20} rx={4} />
              <rect x={202} y={228} width={20} height={20} rx={4} />
              <rect x={178} y={252} width={20} height={20} rx={4} />
              <rect x={202} y={252} width={20} height={20} rx={4} />
            </g>
          </svg>
        </div>

        <h1
          style={{
            fontSize: 22,
            fontWeight: 800,
            color: "#111",
            margin: "0 0 10px",
            letterSpacing: "-0.4px",
          }}
        >
          Vous êtes hors ligne
        </h1>
        <p
          style={{
            fontSize: 14,
            color: "#6b7280",
            margin: "0 0 24px",
            lineHeight: 1.6,
          }}
        >
          {BRAND.name} n&apos;arrive pas à joindre le serveur. Vérifiez votre
          connexion puis réessayez. Les pages déjà visitées peuvent encore
          être accessibles.
        </p>

        <Link
          href="/"
          style={{
            display: "inline-block",
            background: "#111",
            color: "white",
            padding: "12px 26px",
            borderRadius: 999,
            textDecoration: "none",
            fontWeight: 700,
            fontSize: 14,
          }}
        >
          Réessayer
        </Link>
      </div>
    </main>
  )
}
