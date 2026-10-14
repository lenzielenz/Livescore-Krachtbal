import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { userClubId } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { formatDateBE } from '@/lib/datetime'
import { getPayloadClient } from '@/lib/payload-client'
import { FRAGMENTEN } from '@/lib/virtueel'
import './virtueel.css'

export const metadata = { title: 'Virtueel krachtbal — Krachtbal Live' }
// Persoonlijk: wie ingelogd is met een club, krijgt "zijn" stadion te zien.
export const dynamic = 'force-dynamic'

// Wat het virtuele stadion een supporter biedt. Bewust niet over één wedstrijd: het fragment op het
// veld is maar één onderdeel van de beleving.
const TROEVEN = [
  {
    icoon: '🏟️',
    titel: 'In je clubkleuren',
    tekst: 'Tribunes, reclameborden, het scorebord en het grote ledscherm met je clublogo. Supporters met vlaggen en sjaals, en een tifo achter de goal.',
  },
  {
    icoon: '🏆',
    titel: 'Hall of Fame',
    tekst: 'Je erelijst hangt in de gangen: elke titel en beker op een eigen plaquette, persoonlijke prijzen op een erebord, en de mooiste bekers in vitrines waar je omheen wandelt.',
  },
  {
    icoon: '⚡',
    titel: 'Dit weekend',
    tekst: 'Een muur vol scoreborden met de wedstrijden van het komende weekend. Wat gespeeld is staat er met de uitslag, wat bezig is volgt live mee.',
  },
  {
    icoon: '📸',
    titel: 'Fotogalerij',
    tekst: "Foto's die supporters tijdens live wedstrijden van je club namen, als collages aan de muur. Elke dag anders geschikt.",
  },
  {
    icoon: '🧭',
    titel: 'Vrij rondlopen',
    tekst: 'Zweef boven het stadion, wandel door de gangen of maak een rondvlucht. Wegwijzers tonen de weg, en aan het veld kijk je mee vanop de tribune of door de ogen van een speler.',
  },
  {
    icoon: '🎆',
    titel: 'Wedstrijdsfeer',
    tekst: 'Een welkomstboog, foodtrucks en de fanshop, zingende supporters, zoeklichten en vuurwerk. Op je gsm of in volledig scherm.',
  },
]

export default async function VirtueelPage() {
  let clubNaam: string | null = null
  try {
    const clubId = userClubId(await getAuthUser())
    if (clubId != null) {
      const payload = await getPayloadClient()
      const club = await payload.findByID({ collection: 'clubs', id: Number(clubId), depth: 0 }).catch(() => null)
      clubNaam = club ? String(club.name) : null
    }
  } catch {
    // Geen databank of niet ingelogd: de algemene uitnodiging volstaat.
  }
  const eerste = FRAGMENTEN[0]

  return (
    <>
      <SiteHeader />
      <div className="site vk-pagina">
        <h1 className="page-title">🥽 <span className="brand">Virtueel krachtbal</span></h1>
        <p className="page-sub">
          Je eigen stadion, altijd open. Wandel binnen in een virtueel stadion in de kleuren van je club, met je erelijst aan
          de muur, de wedstrijden van dit weekend, foto&apos;s van de supporters en een wedstrijd die op het veld gespeeld wordt.
        </p>

        <div className="vk-uitnodiging">
          {clubNaam ? (
            <>
              <div>
                <b>Het stadion van {clubNaam} staat klaar.</b>
                <span>Alles kleurt mee: van de tribunes tot de erelijst in de gangen.</span>
              </div>
              {eerste && (
                <Link href={`/virtueel/${eerste.slug}`} className="btn btn-primary">
                  Stap binnen →
                </Link>
              )}
            </>
          ) : (
            <>
              <div>
                <b>Log in en kies je club.</b>
                <span>Dan kleurt het hele stadion mee, en hangen jullie prijzen, wedstrijden en foto&apos;s in de gangen.</span>
              </div>
              <div className="vk-uitnodiging-knoppen">
                <Link href="/inloggen" className="btn btn-primary">
                  Inloggen
                </Link>
                {eerste && (
                  <Link href={`/virtueel/${eerste.slug}`} className="btn btn-ghost">
                    Eerst rondkijken →
                  </Link>
                )}
              </div>
            </>
          )}
        </div>

        <h2 className="vk-kop">Wat je er vindt</h2>
        <div className="vk-troeven">
          {TROEVEN.map((t) => (
            <div key={t.titel} className="vk-troef">
              <span className="vk-troef-icoon" aria-hidden>
                {t.icoon}
              </span>
              <b>{t.titel}</b>
              <span>{t.tekst}</span>
            </div>
          ))}
        </div>

        <h2 className="vk-kop">Op het veld</h2>
        <p className="vk-kop-sub">
          Het spel op het veld is gereconstrueerd uit echte wedstrijdbeelden en speelt in een lus terwijl je rondkijkt. Kies
          een fragment om het stadion binnen te stappen.
        </p>
        <div className="vk-lijst">
          {FRAGMENTEN.map((f) => (
            <Link key={f.slug} href={`/virtueel/${f.slug}`} className="vk-kaart">
              <span className="vk-kaart-beeld" aria-hidden>
                <span className="vk-kaart-veld" />
                <span className="vk-kaart-play">▶</span>
              </span>
              <span className="vk-kaart-tekst">
                <span className="vk-kaart-meta">{formatDateBE(f.datum, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })} · {f.plaats}</span>
                <b>{f.titel}</b>
                <span>{f.beschrijving}</span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </>
  )
}
