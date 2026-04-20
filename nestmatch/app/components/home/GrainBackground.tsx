/**
 * Grain SVG ultra-léger (3 % opacité) en overlay.
 * Utilisé sur le Hero pour chaleur éditoriale sans coût CPU.
 * pointerEvents:none pour ne pas bloquer les clics dessous.
 */
export default function GrainBackground() {
  return (
    <svg
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        opacity: 0.03,
        mixBlendMode: "multiply",
      }}
    >
      <filter id="km-grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter="url(#km-grain)" />
    </svg>
  )
}
