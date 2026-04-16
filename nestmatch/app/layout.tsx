import type { Metadata } from 'next'
import './globals.css'
import Providers from './providers'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import CookieBanner from './components/CookieBanner'

const BASE_URL = process.env.NEXT_PUBLIC_URL || 'https://nestmatch.fr'

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>
        <Providers>
          <Navbar />
          {children}
          <Footer />
          <CookieBanner />
        </Providers>
      </body>
    </html>
  )
}