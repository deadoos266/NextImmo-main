import type { Metadata } from 'next'
import { DM_Sans } from 'next/font/google'
import './globals.css'
import Providers from './providers'
import AdminBar from './components/AdminBar'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import CookieBanner from './components/CookieBanner'
import ToastStack from './components/ToastStack'
import ServiceWorkerRegister from './components/ServiceWorkerRegister'
import BetaBanner from './components/BetaBanner'
import MountedOnly from './components/MountedOnly'
import ThemeApplier from './components/ThemeApplier'
import { BRAND } from '../lib/brand'

const BASE_URL = process.env.NEXT_PUBLIC_URL || BRAND.url

// adjustFontFallback: false → désactive l'injection d'un <meta name="next-size-adjust">
// qui causait le React #418 en prod Vercel. Float React 19 déplaçait ce meta du
// body vers head au SSR, créant un mismatch à l'hydration. Le tradeoff (léger CLS
// au swap swap→DM Sans) est acceptable vs. un Sentry qui crie sur toutes les pages.
const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-dm-sans',
  adjustFontFallback: false,
})

const DEFAULT_TITLE = `${BRAND.name} — Location entre particuliers sans agence`
const DEFAULT_DESC = `${BRAND.name} connecte propriétaires et locataires directement. Score de matching, gestion du dossier, des visites et des loyers. Zéro frais d'agence.`

// Mode bêta : bloque l'indexation moteurs de recherche (activé via
// NEXT_PUBLIC_NOINDEX=true dans Vercel env vars). À retirer au lancement.
const NO_INDEX = process.env.NEXT_PUBLIC_NOINDEX === "true"

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: DEFAULT_TITLE,
    template: `%s | ${BRAND.name}`,
  },
  description: DEFAULT_DESC,
  keywords: ['location appartement', 'location particulier', 'sans agence', 'logement', 'louer appartement', 'matching locataire'],
  authors: [{ name: BRAND.name }],
  creator: BRAND.name,
  publisher: BRAND.name,
  robots: NO_INDEX
    ? {
        index: false,
        follow: false,
        googleBot: { index: false, follow: false, noimageindex: true },
      }
    : {
        index: true,
        follow: true,
        googleBot: { index: true, follow: true },
      },
  openGraph: {
    type: 'website',
    locale: 'fr_FR',
    url: BASE_URL,
    siteName: BRAND.name,
    title: DEFAULT_TITLE,
    description: DEFAULT_DESC,
    images: [{ url: '/og-default.png', width: 1200, height: 630, alt: `${BRAND.name} — Location entre particuliers` }],
  },
  twitter: {
    card: 'summary_large_image',
    title: DEFAULT_TITLE,
    description: DEFAULT_DESC,
    images: ['/og-default.png'],
  },
  alternates: {
    canonical: BASE_URL,
  },
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/logo-mark.svg', type: 'image/svg+xml', sizes: 'any' },
      { url: '/logo-mark-192.png', type: 'image/png', sizes: '192x192' },
      { url: '/logo-mark-512.png', type: 'image/png', sizes: '512x512' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: BRAND.name,
  },
  applicationName: BRAND.name,
  other: {
    'mobile-web-app-capable': 'yes',
    'theme-color': '#FF4A1C',
  },
}

// Organization + WebSite schema (global, injecté une seule fois). Aide
// Google à construire son knowledge graph et à afficher un search box
// directement dans les SERP.
const ORG_JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${BASE_URL}/#organization`,
      name: BRAND.name,
      url: BASE_URL,
      description: BRAND.tagline,
      logo: {
        "@type": "ImageObject",
        url: `${BASE_URL}/logo-mark-512.png`,
        width: 512,
        height: 512,
      },
      email: BRAND.email,
      sameAs: [],
    },
    {
      "@type": "WebSite",
      "@id": `${BASE_URL}/#website`,
      url: BASE_URL,
      name: BRAND.name,
      description: BRAND.tagline,
      publisher: { "@id": `${BASE_URL}/#organization` },
      inLanguage: "fr-FR",
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: `${BASE_URL}/annonces?ville={search_term_string}`,
        },
        "query-input": "required name=search_term_string",
      },
    },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={dmSans.variable} suppressHydrationWarning>
      <head>
        {/* theme-init.js RETIRÉ (cause confirmée de React #418 args HTML) :
            il faisait documentElement.setAttribute('data-theme', ...) AVANT
            hydration, ce que React 19 voit comme un mismatch structural sur
            <html> malgré suppressHydrationWarning. Thème appliqué maintenant
            post-mount par ThemeApplier. Tradeoff : brève flash light→dark au
            premier render pour les utilisateurs en mode sombre. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(ORG_JSON_LD).replace(/</g, "\\u003c"),
          }}
        />
      </head>
      <body style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif" }} suppressHydrationWarning>
        <Providers>
          <ThemeApplier />
          <BetaBanner />
          <AdminBar />
          {/* Navbar/Footer wrappés dans MountedOnly pour éliminer toute
              possibilité de hydration mismatch (React #418) causée par
              leurs dépendances client (useSession, useRole, useResponsive).
              Le fallback préserve la hauteur pour éviter le CLS au mount.
              Voir investigation /annonces?ville=Paris 2026-04-21. */}
          <MountedOnly fallback={<div style={{ height: 72, background: "white", borderBottom: "1px solid #e5e7eb" }} aria-hidden />}>
            <Navbar />
          </MountedOnly>
          {children}
          <MountedOnly>
            <Footer />
          </MountedOnly>
          <CookieBanner />
          <ToastStack />
          <ServiceWorkerRegister />
        </Providers>
      </body>
    </html>
  )
}
