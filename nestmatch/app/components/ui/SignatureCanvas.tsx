"use client"
import { useEffect, useRef, useState } from "react"

interface Props {
  onChange: (dataUrl: string | null) => void
  width?: number
  height?: number
}

/**
 * Canvas HTML5 pour dessiner une signature (souris + tactile).
 *
 * - Vecteur lissé (quadratic curves entre points)
 * - Fond blanc + trait noir épais
 * - Export PNG base64 via toDataURL()
 * - Bouton Effacer → reset + onChange(null)
 *
 * La signature elle-même n'a pas de valeur juridique sans audit trail (IP, timestamp,
 * mention manuscrite). Le flux complet vit dans BailSignatureModal.
 */
export default function SignatureCanvas({
  onChange,
  width = 480,
  height = 180,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [drawing, setDrawing] = useState(false)
  const lastPoint = useRef<{ x: number; y: number } | null>(null)
  const [hasContent, setHasContent] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    // Fond blanc
    ctx.fillStyle = "white"
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    // Trait
    ctx.lineWidth = 2.2
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    ctx.strokeStyle = "#111"
  }, [])

  function getPoint(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    }
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.setPointerCapture(e.pointerId)
    const p = getPoint(e)
    lastPoint.current = p
    setDrawing(true)
    // Dessine un point initial pour les simples clics
    const ctx = canvas.getContext("2d")
    if (ctx) {
      ctx.beginPath()
      ctx.arc(p.x, p.y, 1.1, 0, Math.PI * 2)
      ctx.fillStyle = "#111"
      ctx.fill()
    }
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing) return
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx || !lastPoint.current) return
    const p = getPoint(e)
    // Quadratic smoothing
    const mid = { x: (lastPoint.current.x + p.x) / 2, y: (lastPoint.current.y + p.y) / 2 }
    ctx.beginPath()
    ctx.moveTo(lastPoint.current.x, lastPoint.current.y)
    ctx.quadraticCurveTo(lastPoint.current.x, lastPoint.current.y, mid.x, mid.y)
    ctx.stroke()
    lastPoint.current = p
  }

  function handlePointerUp() {
    if (!drawing) return
    setDrawing(false)
    lastPoint.current = null
    const canvas = canvasRef.current
    if (canvas) {
      setHasContent(true)
      onChange(canvas.toDataURL("image/png"))
    }
  }

  function clear() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.fillStyle = "white"
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    setHasContent(false)
    onChange(null)
  }

  return (
    <div>
      <div
        style={{
          background: "white",
          border: "2px dashed #EAE6DF",
          borderRadius: 14,
          padding: 4,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <canvas
          ref={canvasRef}
          width={width * 2}
          height={height * 2}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={handlePointerUp}
          style={{
            display: "block",
            width: "100%",
            height,
            touchAction: "none",
            cursor: "crosshair",
            borderRadius: 10,
            background: "white",
          }}
        />
        {!hasContent && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
              color: "#EAE6DF",
              fontSize: 14,
              fontStyle: "italic",
            }}
          >
            Signez ici avec votre doigt ou la souris
          </div>
        )}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, alignItems: "center" }}>
        <p style={{ fontSize: 11, color: "#8a8477", margin: 0 }}>
          {hasContent ? "✓ Signature capturée" : "Tracez votre signature sur la zone ci-dessus"}
        </p>
        <button
          type="button"
          onClick={clear}
          disabled={!hasContent}
          style={{
            background: "white",
            color: hasContent ? "#8a8477" : "#EAE6DF",
            border: "1px solid #EAE6DF",
            borderRadius: 8,
            padding: "6px 14px",
            fontSize: 12,
            fontWeight: 700,
            cursor: hasContent ? "pointer" : "not-allowed",
            fontFamily: "inherit",
          }}
        >
          Effacer
        </button>
      </div>
    </div>
  )
}
