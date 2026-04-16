/**
 * Mémoire en variable module (survit aux requêtes en dev, reset au redémarrage).
 * Interface conçue pour un swap Supabase ultérieur : remplace les fonctions
 * getMemory / saveMemory / clearMemory sans toucher au reste.
 */

export interface AgentMessage {
  role: "user" | "assistant"
  content: string
  timestamp: number
}

export interface AgentSession {
  sessionId: string
  userEmail?: string
  messages: AgentMessage[]
  createdAt: number
  updatedAt: number
}

// ─── Store in-memory ──────────────────────────────────────────────────────────

const store = new Map<string, AgentSession>()

// TTL 2h — nettoie les sessions trop anciennes
const SESSION_TTL_MS = 2 * 60 * 60 * 1000

function pruneOldSessions() {
  const cutoff = Date.now() - SESSION_TTL_MS
  for (const [id, session] of store.entries()) {
    if (session.updatedAt < cutoff) store.delete(id)
  }
}

// ─── API publique ─────────────────────────────────────────────────────────────

export function getSession(sessionId: string): AgentSession | null {
  return store.get(sessionId) ?? null
}

export function getOrCreateSession(
  sessionId: string,
  userEmail?: string
): AgentSession {
  pruneOldSessions()
  let session = store.get(sessionId)
  if (!session) {
    session = {
      sessionId,
      userEmail,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    store.set(sessionId, session)
  }
  return session
}

export function addMessage(
  sessionId: string,
  role: AgentMessage["role"],
  content: string
) {
  const session = store.get(sessionId)
  if (!session) return
  session.messages.push({ role, content, timestamp: Date.now() })
  session.updatedAt = Date.now()
  // Fenêtre glissante : garde les 20 derniers échanges
  if (session.messages.length > 20) {
    session.messages = session.messages.slice(-20)
  }
}

export function clearSession(sessionId: string) {
  store.delete(sessionId)
}

export function listSessions(): AgentSession[] {
  return Array.from(store.values())
}

// ─── Helpers format Anthropic ─────────────────────────────────────────────────

/** Convertit l'historique en tableau messages Anthropic */
export function toAnthropicHistory(
  session: AgentSession
): { role: "user" | "assistant"; content: string }[] {
  return session.messages.map(({ role, content }) => ({ role, content }))
}
