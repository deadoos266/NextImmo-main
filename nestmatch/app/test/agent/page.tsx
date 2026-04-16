"use client"
import { useState, useRef, useEffect } from "react"
import { useSession } from "next-auth/react"

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  role: "user" | "assistant"
  content: string
  meta?: {
    intent?: string
    toolsUsed?: string[]
    thinking?: string
    ms?: number
  }
}

// ─── Composants utilitaires (hors fonction principale) ────────────────────────

function Badge({ label, color = "#f3f4f6", text = "#111" }: { label: string; color?: string; text?: string }) {
  return (
    <span style={{
      background: color, color: text, borderRadius: 999,
      fontSize: 11, fontWeight: 700, padding: "2px 10px",
      letterSpacing: "0.3px", whiteSpace: "nowrap",
    }}>
      {label}
    </span>
  )
}

function ThinkingBlock({ content }: { content: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ marginTop: 10 }}>
      <button onClick={() => setOpen(o => !o)} style={{
        background: "none", border: "1px solid #e5e7eb", borderRadius: 8,
        padding: "4px 12px", fontSize: 12, cursor: "pointer",
        color: "#6b7280", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6,
      }}>
        <span style={{ fontSize: 14 }}>{open ? "▾" : "▸"}</span>
        Raisonnement Opus ({Math.round(content.length / 4)} tokens ~)
      </button>
      {open && (
        <pre style={{
          marginTop: 8, padding: 16, background: "#fafafa", border: "1px solid #e5e7eb",
          borderRadius: 10, fontSize: 12, lineHeight: 1.6, whiteSpace: "pre-wrap",
          color: "#374151", maxHeight: 300, overflowY: "auto",
          fontFamily: "ui-monospace, monospace",
        }}>
          {content}
        </pre>
      )}
    </div>
  )
}

function TypingDots() {
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center", padding: "12px 16px" }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          width: 7, height: 7, borderRadius: "50%", background: "#9ca3af",
          animation: "bounce 1.2s infinite",
          animationDelay: `${i * 0.2}s`,
        }} />
      ))}
      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0) }
          40% { transform: translateY(-6px) }
        }
      `}</style>
    </div>
  )
}

// ─── Suggestions rapides ──────────────────────────────────────────────────────

const SUGGESTIONS = [
  "Trouve-moi un T3 à Lyon sous 900€",
  "Comment optimiser mon annonce ?",
  "Explique-moi le score de matching",
  "Quels documents pour mon dossier locataire ?",
  "Y a-t-il des biens meublés disponibles à Paris ?",
]

// ─── Page principale ──────────────────────────────────────────────────────────

export default function TestAgent() {
  const { data: session } = useSession()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [showThinking, setShowThinking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, loading])

  async function send(text?: string) {
    const msg = (text ?? input).trim()
    if (!msg || loading) return

    setInput("")
    setError(null)
    setMessages(prev => [...prev, { role: "user", content: msg }])
    setLoading(true)

    const t0 = Date.now()
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: msg,
          sessionId: sessionId ?? undefined,
          userEmail: session?.user?.email ?? undefined,
          showThinking,
        }),
      })

      const data = await res.json()
      const ms = Date.now() - t0

      if (!res.ok) {
        setError(data.error ?? "Erreur inconnue")
        setMessages(prev => prev.slice(0, -1)) // retire le message user si erreur
        return
      }

      if (!sessionId) setSessionId(data.sessionId)

      setMessages(prev => [
        ...prev,
        {
          role: "assistant",
          content: data.response,
          meta: {
            intent: data.intent,
            toolsUsed: data.toolsUsed,
            thinking: data.thinking,
            ms,
          },
        },
      ])
    } catch (e) {
      setError("Impossible de contacter /api/agent")
      setMessages(prev => prev.slice(0, -1))
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  function reset() {
    setMessages([])
    setSessionId(null)
    setError(null)
    inputRef.current?.focus()
  }

  return (
    <main style={{ minHeight: "100vh", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "32px 24px 100px" }}>

        {/* En-tête */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#111", color: "white", borderRadius: 999, padding: "4px 14px", fontSize: 12, fontWeight: 700, letterSpacing: "0.5px", marginBottom: 10 }}>
                <span style={{ width: 7, height: 7, background: "#4ade80", borderRadius: "50%", display: "inline-block" }} />
                AGENT TEST
              </div>
              <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.5px", margin: 0 }}>NestMatch AI</h1>
              <p style={{ color: "#6b7280", fontSize: 14, marginTop: 4 }}>
                Opus (raisonnement) + Sonnet (exécution) · Mémoire de session
              </p>
            </div>

            {/* Contrôles */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: "#374151" }}>
                <div
                  onClick={() => setShowThinking(v => !v)}
                  style={{
                    width: 38, height: 22, borderRadius: 999,
                    background: showThinking ? "#111" : "#d1d5db",
                    position: "relative", cursor: "pointer", transition: "background 0.2s",
                  }}
                >
                  <div style={{
                    width: 16, height: 16, borderRadius: "50%", background: "white",
                    position: "absolute", top: 3,
                    left: showThinking ? 19 : 3,
                    transition: "left 0.2s",
                  }} />
                </div>
                Afficher le thinking Opus
              </label>
              {sessionId && (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, color: "#9ca3af", fontFamily: "monospace" }}>
                    session: {sessionId.slice(0, 8)}…
                  </span>
                  <button onClick={reset} style={{
                    background: "none", border: "1px solid #e5e7eb", borderRadius: 8,
                    padding: "3px 10px", fontSize: 12, cursor: "pointer",
                    color: "#6b7280", fontFamily: "inherit",
                  }}>
                    Réinitialiser
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Pipeline */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
            {[
              { label: "claude-opus-4-5", sub: "Extended thinking · 10k tokens", color: "#fef3c7", text: "#92400e" },
              { label: "→", sub: "", color: "transparent", text: "#9ca3af" },
              { label: "claude-sonnet-4-6", sub: "Exécution + tools Supabase", color: "#dbeafe", text: "#1e40af" },
              { label: "→", sub: "", color: "transparent", text: "#9ca3af" },
              { label: "Mémoire session", sub: "20 tours · in-memory", color: "#d1fae5", text: "#065f46" },
            ].map((item, i) => item.sub ? (
              <div key={i} style={{ background: item.color, borderRadius: 10, padding: "6px 12px", textAlign: "center" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: item.text }}>{item.label}</div>
                <div style={{ fontSize: 10, color: item.text, opacity: 0.8, marginTop: 1 }}>{item.sub}</div>
              </div>
            ) : (
              <span key={i} style={{ color: item.text, fontSize: 18, fontWeight: 300 }}>{item.label}</span>
            ))}
          </div>
        </div>

        {/* Zone de messages */}
        <div style={{
          background: "white", borderRadius: 20, minHeight: 420,
          display: "flex", flexDirection: "column", overflow: "hidden",
          boxShadow: "0 2px 16px rgba(0,0,0,0.06)",
        }}>
          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px", display: "flex", flexDirection: "column", gap: 20 }}>

            {/* État vide */}
            {messages.length === 0 && !loading && (
              <div style={{ textAlign: "center", padding: "48px 24px" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🧠</div>
                <p style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Pose ta question à NestMatch AI</p>
                <p style={{ color: "#9ca3af", fontSize: 14, marginBottom: 28 }}>
                  Opus analyse et planifie · Sonnet interroge Supabase et répond
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
                  {SUGGESTIONS.map((s, i) => (
                    <button key={i} onClick={() => send(s)} style={{
                      background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 999,
                      padding: "7px 14px", fontSize: 13, cursor: "pointer",
                      color: "#374151", fontFamily: "inherit", transition: "background 0.15s",
                    }}
                      onMouseEnter={e => (e.currentTarget.style.background = "#f3f4f6")}
                      onMouseLeave={e => (e.currentTarget.style.background = "#f9fafb")}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Messages */}
            {messages.map((m, i) => (
              <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                <div style={{ maxWidth: "78%" }}>
                  {/* Bulle */}
                  <div style={{
                    padding: "12px 18px",
                    borderRadius: m.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                    background: m.role === "user" ? "#111" : "#f9fafb",
                    color: m.role === "user" ? "white" : "#111",
                    border: m.role === "assistant" ? "1px solid #e5e7eb" : "none",
                    fontSize: 14, lineHeight: 1.65, whiteSpace: "pre-wrap",
                  }}>
                    {m.content}
                  </div>

                  {/* Métadonnées assistant */}
                  {m.role === "assistant" && m.meta && (
                    <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                      {m.meta.intent && (
                        <Badge label={`Intent: ${m.meta.intent}`} color="#f3f4f6" text="#374151" />
                      )}
                      {m.meta.toolsUsed && m.meta.toolsUsed.length > 0 && m.meta.toolsUsed.map(t => (
                        <Badge key={t} label={`🔧 ${t}`} color="#eff6ff" text="#1d4ed8" />
                      ))}
                      {m.meta.ms && (
                        <Badge label={`${(m.meta.ms / 1000).toFixed(1)}s`} color="#f0fdf4" text="#166534" />
                      )}
                    </div>
                  )}

                  {/* Thinking Opus */}
                  {m.role === "assistant" && m.meta?.thinking && (
                    <ThinkingBlock content={m.meta.thinking} />
                  )}
                </div>
              </div>
            ))}

            {/* Animation chargement */}
            {loading && (
              <div style={{ display: "flex", justifyContent: "flex-start" }}>
                <div style={{
                  background: "#f9fafb", border: "1px solid #e5e7eb",
                  borderRadius: "18px 18px 18px 4px", display: "inline-block",
                }}>
                  <TypingDots />
                </div>
              </div>
            )}

            {/* Erreur */}
            {error && (
              <div style={{
                background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12,
                padding: "12px 16px", fontSize: 13, color: "#dc2626",
              }}>
                <strong>Erreur :</strong> {error}
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Zone de saisie */}
          <div style={{ borderTop: "1px solid #f3f4f6", padding: "16px 24px" }}>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Pose ta question… (Entrée pour envoyer, Shift+Entrée pour un saut de ligne)"
                rows={1}
                style={{
                  flex: 1, padding: "11px 16px",
                  border: "1.5px solid #e5e7eb", borderRadius: 14,
                  fontSize: 14, outline: "none", resize: "none",
                  fontFamily: "inherit", lineHeight: 1.5,
                  overflowY: "hidden",
                }}
                onInput={e => {
                  const t = e.currentTarget
                  t.style.height = "auto"
                  t.style.height = Math.min(t.scrollHeight, 120) + "px"
                }}
              />
              <button
                onClick={() => send()}
                disabled={loading || !input.trim()}
                style={{
                  background: "#111", color: "white", border: "none",
                  borderRadius: 12, padding: "11px 22px",
                  fontWeight: 700, fontSize: 14, cursor: loading || !input.trim() ? "not-allowed" : "pointer",
                  opacity: loading || !input.trim() ? 0.45 : 1,
                  fontFamily: "inherit", flexShrink: 0,
                  transition: "opacity 0.15s",
                }}
              >
                {loading ? "…" : "Envoyer"}
              </button>
            </div>
            <p style={{ marginTop: 8, fontSize: 11, color: "#9ca3af" }}>
              {session?.user?.email
                ? `Connecté en tant que ${session.user.email}`
                : "Non connecté — connecte-toi pour que l'agent accède à ton profil"
              }
              {sessionId && ` · ${messages.filter(m => m.role === "user").length} message(s) en mémoire`}
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}
