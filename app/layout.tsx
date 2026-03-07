import type {Metadata} from 'next';
import { Inter } from 'next/font/google';
import './globals.css'; // Global styles
import StoreProvider from './StoreProvider';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { LanguageProvider } from '@/context/LanguageContext';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'MOVEO - Streaming',
  description: 'Ultra-modern streaming site for movies and TV shows',
  icons: {
    icon: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 120 40%22 fill=%22none%22><path d=%22M10 35V5L20 15L30 5V35H25V12L20 17L15 12V35H10Z%22 fill=%22%23E50914%22/><circle cx=%2255%22 cy=%2220%22 r=%2218%22 fill=%22%23E50914%22/><path d=%22M50 12V28L63 20L50 12Z%22 fill=%22white%22/><path d=%22M80 5L90 30L100 5H106L93 35H87L74 5H80Z%22 fill=%22white%22/></svg>',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-[#0A0A0A] text-white antialiased overflow-x-hidden`} suppressHydrationWarning>
        <LanguageProvider>
          <StoreProvider>
            <Header />
            <main className="min-h-screen pt-16">{children}</main>
            <Footer />
          </StoreProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
