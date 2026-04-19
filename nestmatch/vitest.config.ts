import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    // Env dummies pour les imports qui vérifient la présence de vars Supabase
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
      NEXTAUTH_SECRET: "test-secret-32-chars-at-least-xxx",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      include: ["lib/**/*.ts"],
      exclude: [
        "lib/**/*.test.ts",
        "lib/agents/**",           // appels LLM
        "lib/agentMemory.ts",      // Supabase I/O
        "lib/auth.ts",             // NextAuth config, testé via E2E
        "lib/supabase.ts",
        "lib/supabase-server.ts",
        "lib/theme.ts",            // client localStorage + DOM
        "lib/favoris.ts",          // client localStorage
        "lib/geocoding.ts",        // fetch externe Nominatim
        "lib/fileValidation.ts",   // dépend File API browser
        "lib/marketRent.ts",       // data-heavy, testable mais pas prioritaire
        "lib/signalements.ts",     // helpers UI
        "lib/dossierPDF.ts",       // jsPDF + sharp, tests e2e PDF
        "lib/zIndex.ts",           // constantes
        "lib/cardGradients.ts",    // constantes
        "lib/contacts.ts",         // constantes + helpers triviaux
        "lib/brand.ts",            // constantes
        "lib/brandPDF.ts",         // jsPDF side-effects
        "lib/messagePrefixes.ts",  // à venir, constantes
      ],
      // Seuils appliqués aux libs critiques couvertes (logique métier).
      // Score global plus bas vu les I/O non testés unitairement.
      thresholds: {
        lines: 50,
        functions: 50,
        branches: 50,
        statements: 50,
      },
    },
    include: ["lib/**/*.test.ts", "lib/**/__tests__/*.test.ts"],
  },
})
