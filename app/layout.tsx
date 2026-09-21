import type {Metadata} from 'next';
import { Inter } from 'next/font/google';
import './globals.css'; // Global styles
import StoreProvider from './StoreProvider';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { LanguageProvider } from '@/context/LanguageContext';
import PingTracker from '@/components/PingTracker';

const inter = Inter({ subsets: ['latin'] });

// Measured before this: every route — /, /films, /movie/550, /search/dune —
// served this same title and description, and no route carried any
// og:/twitter:/canonical tag, so sharing a link produced a bare URL with no
// preview card. These are the site-wide defaults; per-title metadata needs the
// detail routes to expose generateMetadata, which they cannot do while they are
// client components. That refactor is tracked separately rather than attempted
// here, because it means moving the data fetch for movie/tv/person out of the
// component that also drives the player.
export const metadata: Metadata = {
  metadataBase: new URL('https://www.moveo.blog'),
  title: {
    default: 'MOVEO - Streaming',
    template: '%s | MOVEO',
  },
  description: 'Ultra-modern streaming site for movies and TV shows',
  icons: {
    icon: '/favicon.png',
  },
  openGraph: {
    type: 'website',
    siteName: 'MOVEO',
    title: 'MOVEO - Streaming',
    description: 'Ultra-modern streaming site for movies and TV shows',
    url: 'https://www.moveo.blog',
    images: [{ url: '/logo.png' }],
  },
  twitter: {
    card: 'summary',
    title: 'MOVEO - Streaming',
    description: 'Ultra-modern streaming site for movies and TV shows',
    images: ['/logo.png'],
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  // `lang="fr"`, not `en`: LanguageProvider's initial state — and therefore the
  // markup the server actually sends — is French, so the document was
  // announcing a language it was not written in. Screen readers applied English
  // pronunciation to French labels and crawlers filed the page as English.
  // LanguageProvider then keeps the attribute in sync with the resolved
  // language, including after the toggle.
  return (
    <html lang="fr" className="dark">
      <body className={`${inter.className} bg-black text-white antialiased overflow-x-hidden`} suppressHydrationWarning>
        <LanguageProvider>
          <StoreProvider>
            <PingTracker />
            <Header />
            <main className="min-h-screen pt-0 lg:pt-20 pb-24 lg:pb-0">{children}</main>
            <Footer />
          </StoreProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
