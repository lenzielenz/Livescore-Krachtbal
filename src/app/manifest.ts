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
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
    ],
  }
}
