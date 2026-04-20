/**
 * Grain SVG ultra-léger (3 % d'opacité) en overlay pour chaleur éditoriale
 * sans coût CPU (SVG filter, pas de noise canvas).
 *
 * Utilisé en position:absolute inset:0 au-dessus du fond #F7F4EF du Hero.
 * pointerEvents:none pour ne pas bloquer les clics.
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
      <filter id="keym-grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter="url(#keym-grain)" />
    </svg>
  )
}
