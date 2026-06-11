import type { MetadataRoute } from 'next'

// PWA-manifest: laat de site als app aan het beginscherm toevoegen (standalone, geen browserbalk).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Krachtbal Live',
    short_name: 'Krachtbal',
    description: 'Live-score, wedstrijdblad en statistieken voor krachtbal.',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#06140d',
    theme_color: '#06140d',
    icons: [
      // SVG voor browsers die het ondersteunen (scherp op elk formaat) + PNG-varianten voor Android
      // (gewoon én maskable) en iOS, dat geen SVG-beginschermicoon ondersteunt.
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
