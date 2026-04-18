import type { Metadata } from 'next'
import { DM_Sans } from 'next/font/google'
import './globals.css'
import Providers from './providers'
import AdminBar from './components/AdminBar'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import CookieBanner from './components/CookieBanner'
import ToastStack from './components/ToastStack'
import { BRAND } from '../lib/brand'

const BASE_URL = process.env.NEXT_PUBLIC_URL || BRAND.url

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  display: 'swap',
  variable: '--font-dm-sans',
})

const DEFAULT_TITLE = `${BRAND.name} — Location entre particuliers sans agence`
const DEFAULT_DESC = `${BRAND.name} connecte propriétaires et locataires directement. Score de matching, gestion du dossier, des visites et des loyers. Zéro frais d'agence.`

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
  robots: {
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
    ],
    apple: '/logo-mark.svg',
  },
}

// Script anti-flash : applique le thème stocké AVANT le premier paint pour
// éviter un flash blanc -> sombre au chargement. Lit `nestmatch-theme` en
// localStorage (valeurs "light" | "dark" | "system") et pose data-theme
// sur <html> en conséquence.
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('nestmatch-theme')||'system';var e=t;if(t==='system'){e=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.setAttribute('data-theme',e);}catch(_){}})();`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={dmSans.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body style={{ fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif" }}>
        <Providers>
          <AdminBar />
          <Navbar />
          {children}
          <Footer />
          <CookieBanner />
          <ToastStack />
        </Providers>
      </body>
    </html>
  )
}
