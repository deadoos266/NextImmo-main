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
        borderRadius: 16,
        overflow: "hidden",
        boxShadow: "0 1px 6px rgba(0,0,0,0.05)",
      }}
    >
      <Skeleton height={170} rounded={0} style={{ borderRadius: 0 }} />
      <div
        style={{
          padding: 14,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <Skeleton height={16} width="70%" />
        <Skeleton height={12} width="50%" />
        <Skeleton height={22} width="40%" rounded="sm" />
      </div>
    </div>
  )
}
