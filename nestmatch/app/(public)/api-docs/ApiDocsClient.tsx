"use client"

/**
 * V97.39.34 — UI documentation API publique
 *
 * Page custom (pas swagger-ui-react direct pour éviter de gros bundle) :
 *   - Hero + value prop
 *   - Quickstart curl / Node / Python
 *   - Liens : OpenAPI YAML, page agence pour générer clé
 *
 * Note : Swagger UI interactif déféré à V2 (nécessite swagger-ui-dist via
 * iframe ou lazy import). Pour MVP, on liste les endpoints + samples curl.
 */

import { useState } from "react"
import Link from "next/link"

const PROD_BASE = "https://keymatch-immo.fr/api/v1"

type Lang = "curl" | "node" | "python"

const SAMPLES: Record<Lang, { list: string; create: string; update: string; candidatures: string }> = {
  curl: {
    list: `curl -H "Authorization: Bearer km_live_xxx..." \\
     "${PROD_BASE}/agences/<AGENCE_ID>/annonces?limit=50"`,
    create: `curl -X POST \\
     -H "Authorization: Bearer km_live_xxx..." \\
     -H "Content-Type: application/json" \\
     -d '{
       "external_ref": "APIMO-12345",
       "titre": "Studio Paris 11e",
       "ville": "Paris",
       "code_postal": "75011",
       "prix": 900,
       "surface": 22,
       "pieces": 1,
       "type_bien": "Studio",
       "dpe": "D",
       "meuble": true
     }' \\
     "${PROD_BASE}/agences/<AGENCE_ID>/annonces"`,
    update: `curl -X PUT \\
     -H "Authorization: Bearer km_live_xxx..." \\
     -H "Content-Type: application/json" \\
     -d '{"prix": 950}' \\
     "${PROD_BASE}/agences/<AGENCE_ID>/annonces/<ANNONCE_ID>"`,
    candidatures: `curl -H "Authorization: Bearer km_live_xxx..." \\
     "${PROD_BASE}/agences/<AGENCE_ID>/candidatures?since=2026-05-01T00:00:00Z"`,
  },
  node: {
    list: `const res = await fetch(\`${PROD_BASE}/agences/\${AGENCE_ID}/annonces?limit=50\`, {
  headers: { Authorization: \`Bearer \${API_KEY}\` }
})
const { ok, total, annonces } = await res.json()
console.log(\`\${total} annonces récupérées\`)`,
    create: `const res = await fetch(\`${PROD_BASE}/agences/\${AGENCE_ID}/annonces\`, {
  method: "POST",
  headers: {
    "Authorization": \`Bearer \${API_KEY}\`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    external_ref: "APIMO-12345",
    titre: "Studio Paris 11e",
    ville: "Paris",
    prix: 900,
    surface: 22,
    type_bien: "Studio"
  })
})
const { ok, id, action } = await res.json()
// action = "created" ou "updated" si external_ref existait`,
    update: `await fetch(\`${PROD_BASE}/agences/\${AGENCE_ID}/annonces/\${ANNONCE_ID}\`, {
  method: "PUT",
  headers: { Authorization: \`Bearer \${API_KEY}\`, "Content-Type": "application/json" },
  body: JSON.stringify({ prix: 950 })
})`,
    candidatures: `const since = new Date(Date.now() - 24*3600*1000).toISOString()
const res = await fetch(\`${PROD_BASE}/agences/\${AGENCE_ID}/candidatures?since=\${since}\`, {
  headers: { Authorization: \`Bearer \${API_KEY}\` }
})
const { candidatures } = await res.json()`,
  },
  python: {
    list: `import requests
r = requests.get(
    f"${PROD_BASE}/agences/{AGENCE_ID}/annonces",
    headers={"Authorization": f"Bearer {API_KEY}"},
    params={"limit": 50},
)
data = r.json()
print(f"{data['total']} annonces")`,
    create: `r = requests.post(
    f"${PROD_BASE}/agences/{AGENCE_ID}/annonces",
    headers={"Authorization": f"Bearer {API_KEY}"},
    json={
        "external_ref": "APIMO-12345",
        "titre": "Studio Paris 11e",
        "ville": "Paris",
        "prix": 900,
        "surface": 22,
        "type_bien": "Studio",
    },
)
print(r.json())`,
    update: `requests.put(
    f"${PROD_BASE}/agences/{AGENCE_ID}/annonces/{ANNONCE_ID}",
    headers={"Authorization": f"Bearer {API_KEY}"},
    json={"prix": 950},
)`,
    candidatures: `from datetime import datetime, timedelta
since = (datetime.utcnow() - timedelta(days=1)).isoformat() + "Z"
r = requests.get(
    f"${PROD_BASE}/agences/{AGENCE_ID}/candidatures",
    headers={"Authorization": f"Bearer {API_KEY}"},
    params={"since": since},
)
candidatures = r.json()["candidatures"]`,
  },
}

export default function ApiDocsClient() {
  const [lang, setLang] = useState<Lang>("curl")

  return (
    <div style={{ maxWidth: 900, margin: "40px auto", padding: "0 20px 80px" }}>
      {/* Hero */}
      <div style={{ marginBottom: 32 }}>
        <div style={{
          fontSize: 11, textTransform: "uppercase", letterSpacing: 1.2,
          color: "#666", fontWeight: 600, marginBottom: 8,
        }}>
          API publique
        </div>
        <h1 style={{
          fontFamily: "var(--font-fraunces), 'Fraunces', serif",
          fontStyle: "italic", fontWeight: 400, fontSize: 48,
          color: "#111", margin: "0 0 16px", lineHeight: 1.1,
        }}>
          Intégrez KeyMatch à votre logiciel métier
        </h1>
        <p style={{ fontSize: 16, color: "#444", lineHeight: 1.6, marginBottom: 16 }}>
          API REST publique pour pousser vos annonces depuis Apimo, Hektor,
          ou n&apos;importe quel logiciel métier. Récupérez les candidatures
          dans votre CRM agence via webhooks ou polling.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <a
            href="/openapi.yaml"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: "10px 16px", background: "#111", color: "white",
              borderRadius: 10, fontSize: 13, fontWeight: 500, textDecoration: "none",
            }}
          >
            📄 Télécharger OpenAPI YAML
          </a>
          <Link
            href="/agence/dashboard"
            style={{
              padding: "10px 16px", background: "white", color: "#111",
              border: "1px solid #EAE6DF", borderRadius: 10,
              fontSize: 13, fontWeight: 500, textDecoration: "none",
            }}
          >
            🔑 Générer une clé API →
          </Link>
        </div>
      </div>

      {/* Pré-requis */}
      <Section title="Pré-requis">
        <ol style={{ fontSize: 14, color: "#444", lineHeight: 1.8, paddingLeft: 24, margin: 0 }}>
          <li>Compte agence KeyMatch validé (statut = <code>active</code>)</li>
          <li>Clé API générée dans <Link href="/agence/dashboard" style={lkStyle}>/agence/dashboard/[id]/api-keys</Link></li>
          <li>Récupérer l&apos;ID de votre agence (visible dans l&apos;URL <code>/agence/dashboard/[ID]</code>)</li>
        </ol>
      </Section>

      {/* Auth */}
      <Section title="Authentification">
        <p style={pStyle}>
          Toutes les requêtes nécessitent un header <code>Authorization: Bearer km_live_xxx</code>
          (format Stripe). Une clé invalide ou révoquée retourne <code>401 AUTH_INVALID</code>.
        </p>
        <p style={pStyle}>
          <strong>Scopes</strong> : chaque clé a des scopes (<code>annonces:read</code>,
          <code>annonces:write</code>, <code>candidatures:read</code>). Une requête sans le scope
          requis retourne <code>403 SCOPE_FORBIDDEN</code>.
        </p>
      </Section>

      {/* Rate limit */}
      <Section title="Rate limit">
        <p style={pStyle}>
          100 requêtes par minute par clé. Dépassement → <code>429 RATE_LIMITED</code> avec
          header <code>Retry-After</code>. Headers de réponse :
          <code>X-RateLimit-Limit</code>, <code>X-RateLimit-Remaining</code>.
        </p>
      </Section>

      {/* Endpoints + samples */}
      <Section title="Endpoints">
        {/* Selecteur langue */}
        <div style={{ display: "flex", gap: 4, marginBottom: 16, background: "white", padding: 4, borderRadius: 10, border: "1px solid #EAE6DF", width: "fit-content" }}>
          {(["curl", "node", "python"] as Lang[]).map(l => (
            <button
              key={l}
              onClick={() => setLang(l)}
              style={{
                padding: "6px 14px", borderRadius: 6, border: "none",
                background: lang === l ? "#111" : "transparent",
                color: lang === l ? "white" : "#666",
                fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
              }}
            >
              {l === "curl" ? "cURL" : l === "node" ? "Node.js" : "Python"}
            </button>
          ))}
        </div>

        <EndpointBlock method="GET" path="/agences/{id}/annonces" desc="Liste vos annonces" sample={SAMPLES[lang].list} />
        <EndpointBlock method="POST" path="/agences/{id}/annonces" desc="Crée ou met à jour (UPSERT via external_ref)" sample={SAMPLES[lang].create} />
        <EndpointBlock method="PUT" path="/agences/{id}/annonces/{annonceId}" desc="Met à jour partiellement une annonce" sample={SAMPLES[lang].update} />
        <EndpointBlock method="DELETE" path="/agences/{id}/annonces/{annonceId}" desc="Archive (statut=loue_termine)" sample={`curl -X DELETE -H "Authorization: Bearer km_live_xxx..." \\
     "${PROD_BASE}/agences/<AGENCE_ID>/annonces/<ANNONCE_ID>"`} />
        <EndpointBlock method="GET" path="/agences/{id}/candidatures" desc="Polling candidatures reçues (CRM sync)" sample={SAMPLES[lang].candidatures} />
      </Section>

      {/* Erreurs */}
      <Section title="Codes d'erreur">
        <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #EAE6DF", textAlign: "left" }}>
              <th style={{ padding: 8 }}>HTTP</th>
              <th style={{ padding: 8 }}>code</th>
              <th style={{ padding: 8 }}>Cause</th>
            </tr>
          </thead>
          <tbody>
            <tr><td style={tdStyle}>401</td><td style={tdStyle}><code>AUTH_MISSING</code></td><td style={tdStyle}>Header Authorization absent</td></tr>
            <tr><td style={tdStyle}>401</td><td style={tdStyle}><code>AUTH_INVALID</code></td><td style={tdStyle}>Clé invalide ou révoquée</td></tr>
            <tr><td style={tdStyle}>403</td><td style={tdStyle}><code>AUTH_WRONG_AGENCE</code></td><td style={tdStyle}>La clé n&apos;appartient pas à cette agence</td></tr>
            <tr><td style={tdStyle}>403</td><td style={tdStyle}><code>SCOPE_FORBIDDEN</code></td><td style={tdStyle}>Scope insuffisant pour cette action</td></tr>
            <tr><td style={tdStyle}>422</td><td style={tdStyle}><code>VALIDATION</code></td><td style={tdStyle}>Champ invalide (titre &lt; 3 chars, prix &lt;= 0)</td></tr>
            <tr><td style={tdStyle}>429</td><td style={tdStyle}><code>RATE_LIMITED</code></td><td style={tdStyle}>&gt; 100 req/min sur cette clé</td></tr>
            <tr><td style={tdStyle}>500</td><td style={tdStyle}><code>DB_ERROR</code></td><td style={tdStyle}>Erreur serveur (logger côté KeyMatch, contact si répété)</td></tr>
          </tbody>
        </table>
      </Section>

      {/* Idempotence + UPSERT */}
      <Section title="Idempotence (UPSERT par external_ref)">
        <p style={pStyle}>
          Fournissez un <code>external_ref</code> dans votre POST (ex: ID Apimo, ID Hektor) :
          si une annonce avec cette ref existe déjà pour votre agence, elle sera <strong>mise à
          jour</strong> au lieu d&apos;être recréée. Réponse :
        </p>
        <pre style={preStyle}>{`{
  "ok": true,
  "id": 246,
  "action": "updated",  // ou "created" si nouveau
  "external_ref": "APIMO-12345"
}`}</pre>
        <p style={pStyle}>
          Recommandé : faites toujours un POST avec <code>external_ref</code> côté votre logiciel
          métier. Vous pouvez rejouer le même POST sans risque (idempotent).
        </p>
      </Section>

      {/* Pagination */}
      <Section title="Pagination">
        <p style={pStyle}>
          GET <code>?limit=N&offset=M</code>. Max <code>limit=200</code>. Réponse :
        </p>
        <pre style={preStyle}>{`{
  "ok": true,
  "total": 156,
  "limit": 50,
  "offset": 0,
  "annonces": [...]
}`}</pre>
      </Section>

      {/* Roadmap V2 */}
      <Section title="Roadmap V2 (à venir)">
        <ul style={{ fontSize: 14, color: "#444", lineHeight: 1.8, paddingLeft: 20, margin: 0 }}>
          <li><strong>Webhooks</strong> : notifications push HTTPS (candidature.created, visite.confirmee, bail.signed) avec signature HMAC SHA256</li>
          <li><strong>Feed pull automatique</strong> : KeyMatch va lire votre feed Apimo/Hektor toutes les heures (sync delta)</li>
          <li><strong>Connecteurs natifs</strong> : intégrations sur étagère pour Zapier, n8n, Make</li>
          <li><strong>Sandbox</strong> : environnement de test sur <code>api-sandbox.keymatch-immo.fr</code></li>
        </ul>
      </Section>

      {/* Support */}
      <div style={{ marginTop: 48, padding: 20, background: "#F7F4EF", borderRadius: 16, textAlign: "center" }}>
        <p style={{ fontSize: 14, color: "#444", margin: "0 0 12px" }}>
          Une question, un bug, une demande d&apos;intégration custom ?
        </p>
        <a
          href="mailto:contact@keymatch-immo.fr?subject=API%20KeyMatch"
          style={{
            display: "inline-block", padding: "10px 18px", background: "#111",
            color: "white", borderRadius: 10, fontSize: 13, fontWeight: 500,
            textDecoration: "none",
          }}
        >
          contact@keymatch-immo.fr
        </a>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 40 }}>
      <h2 style={{
        fontFamily: "var(--font-fraunces), serif",
        fontStyle: "italic", fontWeight: 400, fontSize: 24,
        color: "#111", margin: "0 0 16px",
      }}>
        {title}
      </h2>
      {children}
    </section>
  )
}

function EndpointBlock({ method, path, desc, sample }: { method: string; path: string; desc: string; sample: string }) {
  const methodColor = method === "GET" ? "#0a4a7c" : method === "POST" ? "#0a7c3e" : method === "PUT" ? "#7a5a00" : "#c5352e"
  return (
    <div style={{ marginBottom: 24, background: "white", border: "1px solid #EAE6DF", borderRadius: 12, overflow: "hidden" }}>
      <div style={{ padding: 14, display: "flex", gap: 10, alignItems: "center", borderBottom: "1px solid #EAE6DF" }}>
        <span style={{ padding: "3px 8px", borderRadius: 6, background: methodColor, color: "white", fontSize: 11, fontWeight: 600 }}>{method}</span>
        <code style={{ fontSize: 13, color: "#111" }}>{path}</code>
        <span style={{ marginLeft: "auto", fontSize: 12, color: "#666" }}>{desc}</span>
      </div>
      <pre style={{ margin: 0, padding: 16, background: "#111", color: "#dcfce7", fontSize: 11.5, lineHeight: 1.6, overflowX: "auto", fontFamily: "ui-monospace, monospace" }}>
        {sample}
      </pre>
    </div>
  )
}

const pStyle: React.CSSProperties = { fontSize: 14, color: "#444", lineHeight: 1.7, marginBottom: 12 }
const lkStyle: React.CSSProperties = { color: "#111", textDecoration: "underline" }
const tdStyle: React.CSSProperties = { padding: 8, borderBottom: "1px solid #F0EDE7", verticalAlign: "top" }
const preStyle: React.CSSProperties = { background: "#111", color: "#dcfce7", padding: 12, borderRadius: 8, fontSize: 12, fontFamily: "ui-monospace, monospace", overflowX: "auto", margin: "8px 0" }
