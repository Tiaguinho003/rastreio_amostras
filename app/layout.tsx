import type { Metadata, Viewport } from 'next';
import { Poppins } from 'next/font/google';

import { PageTransition } from '../components/PageTransition';
import { PwaRegistration } from '../components/PwaRegistration';
import { SplashScreen } from '../components/SplashScreen';
import './globals.css';

const poppins = Poppins({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-sans',
  fallback: ['system-ui', '-apple-system', 'Segoe UI', 'Noto Sans', 'sans-serif']
});

const metadataBase =
  typeof process.env.APP_BASE_URL === 'string' && process.env.APP_BASE_URL.trim().length > 0
    ? new URL(process.env.APP_BASE_URL)
    : new URL('https://app.exemplo.local');

export const metadata: Metadata = {
  metadataBase,
  applicationName: 'Rastreio Interno de Amostras',
  title: 'Rastreio Interno de Amostras',
  description: 'Fluxo de registro, classificacao e rastreio de amostras de cafe.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Rastreio'
  },
  formatDetection: {
    telephone: false
  },
  icons: {
    apple: [{ url: '/icon-safras.png', sizes: '224x224', type: 'image/png' }],
    icon: [{ url: '/icon-safras.png', sizes: '224x224', type: 'image/png' }]
  }
};

export const viewport: Viewport = {
  themeColor: '#1f5d43',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={poppins.variable}>
      <body>
        <PwaRegistration />
        <SplashScreen />
        <PageTransition>
          {children}
        </PageTransition>
      </body>
    </html>
  );
}
