import type { Metadata, Viewport } from 'next';

import { PwaRegistration } from '../components/PwaRegistration';
import './globals.css';

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
    statusBarStyle: 'default',
    title: 'Rastreio'
  },
  formatDetection: {
    telephone: false
  },
  icons: {
    apple: [{ url: '/logo-laudo.png', sizes: '554x554', type: 'image/png' }],
    icon: [{ url: '/logo-laudo.png', sizes: '554x554', type: 'image/png' }]
  }
};

export const viewport: Viewport = {
  themeColor: '#1f5d43',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <PwaRegistration />
        {children}
      </body>
    </html>
  );
}
