import Skeleton from "./Skeleton"

/**
 * Placeholder pour une ligne de document dans /dossier ou /dossier-partage.
 * Layout : label doc + pastille statut + bouton upload à droite.
 */
export default function DocRowSkeleton() {
  return (
    <div
      aria-busy="true"
      style={{
        background: "white",
        borderRadius: 14,
        padding: "14px 16px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        border: "1px solid #F7F4EF",
      }}
    >
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        <Skeleton height={14} width="45%" />
        <Skeleton height={11} width="75%" />
      </div>
      <Skeleton width={72} height={30} rounded="full" style={{ flexShrink: 0 }} />
    </div>
  )
}
