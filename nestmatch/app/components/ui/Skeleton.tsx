type Props = {
  width?: number | string
  height?: number | string
  rounded?: "sm" | "md" | "lg" | "full" | number
  style?: React.CSSProperties
}

const RADIUS_MAP = { sm: 6, md: 10, lg: 14, full: 999 }

/**
 * Placeholder animé pour contenus en cours de chargement.
 * Rendu pur, accessible via aria-hidden (l'annonce du chargement est portée
 * par le conteneur parent via aria-busy).
 *
 * Usage :
 *   {loading ? <Skeleton height={20} width="60%" /> : <p>{titre}</p>}
 */
export default function Skeleton({ width = "100%", height = 14, rounded = "md", style }: Props) {
  const borderRadius = typeof rounded === "number" ? rounded : RADIUS_MAP[rounded]
  return (
    <div
      aria-hidden
      style={{
        width,
        height,
        borderRadius,
        background: "linear-gradient(90deg, #F7F4EF 0%, #EAE6DF 50%, #F7F4EF 100%)",
        backgroundSize: "200% 100%",
        animation: "nm-skeleton-shimmer 1.4s ease-in-out infinite",
        ...style,
      }}
    />
  )
}
