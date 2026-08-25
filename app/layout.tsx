import type {Metadata} from 'next';
import { Manrope, Playfair_Display } from 'next/font/google';
import './globals.css'; // Global styles
import StoreProvider from './StoreProvider';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { LanguageProvider } from '@/context/LanguageContext';
import PingTracker from '@/components/PingTracker';

const manrope = Manrope({ 
  subsets: ['latin'],
  variable: '--font-sans',
});

const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-serif',
});

export const metadata: Metadata = {
  title: 'MOVEO - Streaming',
  description: 'Ultra-modern streaming site for movies and TV shows',
  icons: {
    icon: '/favicon.png',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" className="dark scroll-smooth">
      <body className={`${manrope.variable} ${playfair.variable} bg-moveo-bg text-moveo-text font-sans antialiased overflow-x-hidden selection:bg-white/20`} suppressHydrationWarning>
        <LanguageProvider>
          <StoreProvider>
            <PingTracker />
            <Header />
            <main className="min-h-screen pt-0 lg:pt-0 pb-24 lg:pb-0">{children}</main>
            <Footer />
          </StoreProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
