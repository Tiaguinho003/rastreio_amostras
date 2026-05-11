import type { Metadata, Viewport } from 'next';
import { Poppins } from 'next/font/google';

import { PageTransition } from '../components/PageTransition';
import { PwaRegistration } from '../components/PwaRegistration';
import { ViewportDebugOverlay } from '../components/ViewportDebugOverlay';
import { ViewportSync } from '../components/ViewportSync';
import { SplashScreen } from '../components/SplashScreen';
import { DirtyStateProvider } from '../lib/dirty-state/DirtyStateProvider';
import { ScannerBridge } from '../lib/scanner/ScannerBridge';
import { ToastProvider } from '../lib/toast/ToastProvider';
import './globals.css';

const poppins = Poppins({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-sans',
  fallback: ['system-ui', '-apple-system', 'Segoe UI', 'Noto Sans', 'sans-serif'],
});

const metadataBase =
  typeof process.env.APP_BASE_URL === 'string' && process.env.APP_BASE_URL.trim().length > 0
    ? new URL(process.env.APP_BASE_URL)
    : new URL('https://app.exemplo.local');

export const metadata: Metadata = {
  metadataBase,
  applicationName: 'Amostras Safras',
  title: 'Amostras Safras',
  description: 'Fluxo de registro, classificacao e rastreio de amostras de cafe.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Amostras Safras',
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    apple: [{ url: '/icon-safras.png', sizes: '224x224', type: 'image/png' }],
    icon: [{ url: '/icon-safras.png', sizes: '224x224', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#1f5d43',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  // interactiveWidget=resizes-content: ATIVO apenas em Chromium 108+ (Chrome
  // Android, Edge, etc). iOS Safari (ate iOS 26) IGNORA essa diretiva — em
  // iOS, o workaround real pro bug "viewport nao reseta apos keyboard close"
  // (WebKit Bug 297779) vive em lib/use-viewport-sync.ts (scrollBy kick +
  // dvh-evading svh no shell). Mantido aqui pra que clients Android se
  // beneficiem; nao causa regressao em iOS.
  interactiveWidget: 'resizes-content',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={poppins.variable}>
      <body>
        <PwaRegistration />
        <ViewportSync />
        <ViewportDebugOverlay />
        <SplashScreen />
        <ToastProvider>
          <DirtyStateProvider>
            <ScannerBridge>
              <PageTransition>{children}</PageTransition>
            </ScannerBridge>
          </DirtyStateProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
