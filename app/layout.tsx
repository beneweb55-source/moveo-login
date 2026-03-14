import type {Metadata} from 'next';
import { Inter } from 'next/font/google';
import './globals.css'; // Global styles
import StoreProvider from './StoreProvider';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { LanguageProvider } from '@/context/LanguageContext';
import PingTracker from '@/components/PingTracker';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'MOVEO - Streaming',
  description: 'Ultra-modern streaming site for movies and TV shows',
  icons: {
    icon: '/favicon.png',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-[#0A0A0A] text-white antialiased overflow-x-hidden`} suppressHydrationWarning>
        <LanguageProvider>
          <StoreProvider>
            <PingTracker />
            <Header />
            <main className="min-h-screen pt-20 pb-24 lg:pb-0">{children}</main>
            <Footer />
          </StoreProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
