import Skeleton from "./Skeleton"

/**
 * Placeholder pour un item de conversation dans la sidebar /messages.
 * Matché sur le layout row : avatar rond à gauche, nom + preview à droite.
 */
export default function MessageSkeleton() {
  return (
    <div
      aria-busy="true"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 14px",
        borderBottom: "1px solid #F7F4EF",
      }}
    >
      <Skeleton width={42} height={42} rounded="full" style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        <Skeleton height={13} width="55%" />
        <Skeleton height={11} width="85%" />
      </div>
    </div>
  )
}
