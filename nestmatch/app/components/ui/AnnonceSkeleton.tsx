import Skeleton from "./Skeleton"

/**
 * Placeholder pour une carte annonce en cours de chargement.
 * Matché approximativement sur la card réelle dans /annonces (padding,
 * radius, hauteur image, empilement texte) pour éviter reflow quand les
 * vraies données arrivent.
 */
export default function AnnonceSkeleton() {
  return (
    <div
      aria-busy="true"
      style={{
        background: "white",
        borderRadius: 20,
        border: "1px solid #EAE6DF",
        overflow: "hidden",
      }}
    >
      <div style={{ aspectRatio: "4 / 5", position: "relative" }}>
        <Skeleton height="100%" rounded={0} style={{ borderRadius: 0, position: "absolute", inset: 0 }} />
      </div>
      <div
        style={{
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <Skeleton height={10} width="30%" />
        <Skeleton height={16} width="80%" />
        <Skeleton height={12} width="55%" />
        <Skeleton height={22} width="45%" rounded="sm" />
      </div>
    </div>
  )
}
