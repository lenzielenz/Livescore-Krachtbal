import type { MetadataRoute } from 'next'

// PWA-manifest: laat de site als app aan het beginscherm toevoegen (standalone, geen browserbalk).
// Dit manifest is óók de basis van de Android-app in de Play Store: die is een TWA (Trusted Web
// Activity) rond deze webapp, en Bubblewrap leest naam, kleuren en iconen hieruit.
// Zie docs/ANDROID-PLAYSTORE.md.
export default function manifest(): MetadataRoute.Manifest {
  // Staat de app in de Play Store? Dan vermelden we ze, zodat Android-browsers de echte app kunnen
  // voorstellen. `prefer_related_applications` blijft bewust false: installeren als webapp moet
  // mogelijk blijven (iOS, desktop, en Android zonder Play).
  const pkg = process.env.ANDROID_PACKAGE_NAME?.trim()

  return {
    id: '/',
    name: 'Krachtbal Live',
    short_name: 'Krachtbal',
    description: 'Live-score, wedstrijdblad en statistieken voor krachtbal.',
    lang: 'nl-BE',
    dir: 'ltr',
    start_url: '/',
    // Alles binnen het domein hoort bij de app — anders opent de TWA interne links in een browser.
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#06140d',
    theme_color: '#06140d',
    categories: ['sports'],
    icons: [
      // SVG voor browsers die het ondersteunen (scherp op elk formaat) + PNG-varianten voor Android
      // (gewoon én maskable) en iOS, dat geen SVG-beginschermicoon ondersteunt.
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    ...(pkg
      ? {
          prefer_related_applications: false,
          related_applications: [
            { platform: 'play', id: pkg, url: `https://play.google.com/store/apps/details?id=${pkg}` },
          ],
        }
      : {}),
  }
}
