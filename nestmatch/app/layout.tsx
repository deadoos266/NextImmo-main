import type { Metadata } from 'next'
import { DM_Sans } from 'next/font/google'
import './globals.css'
import Providers from './providers'
import AdminBar from './components/AdminBar'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import CookieBanner from './components/CookieBanner'

const BASE_URL = process.env.NEXT_PUBLIC_URL || 'https://nestmatch.fr'

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  display: 'swap',
  variable: '--font-dm-sans',
})

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: 'NestMatch — Location entre particuliers sans agence',
    template: '%s | NestMatch',
  },
  description: 'NestMatch connecte propriétaires et locataires directement. Score de matching, dossier certifié, gestion des loyers. Zéro frais d\'agence.',
  keywords: ['location appartement', 'location particulier', 'sans agence', 'logement', 'louer appartement', 'matching locataire'],
  authors: [{ name: 'NestMatch' }],
  creator: 'NestMatch',
  publisher: 'NestMatch',
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  openGraph: {
    type: 'website',
    locale: 'fr_FR',
    url: BASE_URL,
    siteName: 'NestMatch',
    title: 'NestMatch — Location entre particuliers sans agence',
    description: 'NestMatch connecte propriétaires et locataires directement. Score de matching, dossier certifié, gestion des loyers. Zéro frais d\'agence.',
    images: [{ url: '/og-default.png', width: 1200, height: 630, alt: 'NestMatch — Location entre particuliers' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'NestMatch — Location entre particuliers sans agence',
    description: 'NestMatch connecte propriétaires et locataires directement. Zéro frais d\'agence.',
    images: ['/og-default.png'],
  },
  alternates: {
    canonical: BASE_URL,
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
        </Providers>
      </body>
    </html>
  )
}
