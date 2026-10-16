import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { userClubId } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { formatDateBE } from '@/lib/datetime'
import { getPayloadClient } from '@/lib/payload-client'
import { FRAGMENTEN } from '@/lib/virtueel'
import { aanwezig } from '@/lib/virtueel-aanwezig'
import { BinnenTeller } from './BinnenTeller'
import './virtueel.css'

export const metadata = { title: 'Virtueel krachtbal — Krachtbal Live' }
// Persoonlijk: wie ingelogd is met een club, krijgt "zijn" stadion te zien.
export const dynamic = 'force-dynamic'

// Wat het virtuele stadion een supporter biedt. Bewust niet over één wedstrijd: het fragment op het
// veld is maar één onderdeel van de beleving.
const TROEVEN = [
  { icoon: '🏟️', titel: 'Jouw kleuren', tekst: 'Tot het laatste stoeltje.' },
  { icoon: '🏆', titel: 'Hall of Fame', tekst: 'Je erelijst, achter glas.' },
  { icoon: '⚡', titel: 'Dit weekend', tekst: 'Uitslagen, live mee.' },
  { icoon: '📸', titel: 'Fotogalerij', tekst: 'Elke dag anders.' },
  { icoon: '🎆', titel: 'Lichtshow', tekst: 'Om de 30 seconden.' },
  { icoon: '🧭', titel: 'Vrij rondlopen', tekst: 'Zweef, wandel, vlieg.' },
]

export default async function VirtueelPage() {
  let clubNaam: string | null = null
  let ikId: string | null = null
  let binnen: string[] = []
  try {
    const me = await getAuthUser()
    const clubId = userClubId(me)
    if (clubId != null) {
      const payload = await getPayloadClient()
      const club = await payload.findByID({ collection: 'clubs', id: Number(clubId), depth: 0 }).catch(() => null)
      clubNaam = club ? String(club.name) : null
      ikId = me ? String(me.id) : null
      // Wie van je club er nu al rondloopt (meteen in de pagina; daarna live via de stroom).
      binnen = aanwezig(String(clubId))
        .filter((a) => a.id !== ikId)
        .map((a) => a.naam)
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
        <p className="page-sub vk-belofte">Jouw stadion. Altijd open.</p>

        <div className="vk-uitnodiging">
          {clubNaam ? (
            <>
              <span className="vk-uitnodiging-tekst">
                <b>Het stadion van {clubNaam}</b>
                {ikId && <BinnenTeller clubNaam={clubNaam} ikId={ikId} begin={binnen} />}
              </span>
              {eerste && (
                <Link href={`/virtueel/${eerste.slug}`} className="btn btn-primary">
                  Stap binnen →
                </Link>
              )}
            </>
          ) : (
            <>
              <b>Log in en kies je club.</b>
              <div className="vk-uitnodiging-knoppen">
                <Link href="/inloggen" className="btn btn-primary">
                  Inloggen
                </Link>
                {eerste && (
                  <Link href={`/virtueel/${eerste.slug}`} className="btn btn-ghost">
                    Rondkijken →
                  </Link>
                )}
              </div>
            </>
          )}
        </div>

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
        <p className="vk-terugkomen">Elke week anders: nieuwe uitslagen, nieuwe foto&apos;s.</p>

        <h2 className="vk-kop">Op het veld</h2>
        <div className="vk-lijst">
          {FRAGMENTEN.map((f) => (
            <Link key={f.slug} href={`/virtueel/${f.slug}`} className="vk-kaart">
              <span className="vk-kaart-beeld" aria-hidden>
                <span className="vk-kaart-veld" />
                <span className="vk-kaart-play">▶</span>
              </span>
              <span className="vk-kaart-tekst">
                <span className="vk-kaart-meta">{formatDateBE(f.datum, { weekday: 'short', day: 'numeric', month: 'long' })} · {f.plaats}</span>
                <b>{f.titel}</b>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </>
  )
}
