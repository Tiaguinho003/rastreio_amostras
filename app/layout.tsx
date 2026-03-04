import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Rastreio Interno de Amostras',
  description: 'Fluxo de registro e rastreio de amostras de cafe'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
