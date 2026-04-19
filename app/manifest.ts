import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Amostras Safras',
    short_name: 'Amostras Safras',
    description: 'Fluxo de registro, classificacao e rastreio de amostras de cafe.',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    background_color: '#1f5d43',
    theme_color: '#1f5d43',
    lang: 'pt-BR',
    orientation: 'any',
    icons: [
      {
        src: '/icon-safras.png',
        sizes: '224x224',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-safras.png',
        sizes: '224x224',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
