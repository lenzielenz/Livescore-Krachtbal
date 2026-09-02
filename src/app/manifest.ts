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
    // Bewust NIET op 'portrait' vastgezet: in de Android-app (TWA) wordt dit de schermstand van de
    // hele activiteit, en dan kan je een wedstrijdvideo niet liggend bekijken. De schermen zijn
    // responsief, dus we volgen het toestel.
    orientation: 'any',
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
    // Snelkoppelingen: lang drukken op het app-icoon springt meteen naar het scherm dat je op een
    // wedstrijddag nodig hebt, zonder eerst door de app te navigeren. Android en desktop tonen
    // deze lijst; iOS negeert ze (daar kost het niets).
    shortcuts: [
      {
        name: 'Live-scores',
        short_name: 'Live',
        description: 'De wedstrijden van vandaag, live.',
        url: '/live',
        icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
      },
      {
        name: 'Rangschikking',
        short_name: 'Stand',
        description: 'De stand in alle reeksen.',
        url: '/rangschikking',
        icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
      },
      {
        name: 'Pronostiek',
        short_name: 'Pronostiek',
        description: 'Voorspel de uitslagen van de komende speeldag.',
        url: '/pronostiek',
        icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
      },
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
