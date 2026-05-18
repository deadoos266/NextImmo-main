/**
 * V97.39.34 — /api-docs — Documentation API publique KeyMatch
 *
 * Page publique avec :
 *   - Section intro
 *   - Quickstart curl / fetch / Python
 *   - Swagger UI interactif (chargé client-side pour réduire bundle SSR)
 *   - Lien OpenAPI YAML téléchargeable
 */

import ApiDocsClient from "./ApiDocsClient"

export const metadata = {
  title: "Documentation API — KeyMatch",
  description: "API REST publique KeyMatch pour intégrer votre logiciel métier (Apimo, Hektor, n8n, Zapier). CRUD annonces + polling candidatures.",
  alternates: { canonical: "/api-docs" },
  openGraph: {
    title: "API KeyMatch — Intégrez votre logiciel métier",
    description: "API REST publique pour pousser vos annonces et récupérer vos candidatures depuis votre CRM agence.",
  },
}

export default function ApiDocsPage() {
  return <ApiDocsClient />
}
