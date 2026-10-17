import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { userClubId } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { getPayloadClient } from '@/lib/payload-client'
import { FRAGMENTEN } from '@/lib/virtueel'
import { aanwezig } from '@/lib/virtueel-aanwezig'
import { BinnenTeller } from './BinnenTeller'
import './virtueel.css'

export const metadata = { title: 'Virtueel krachtbal — Krachtbal Live' }
// Persoonlijk: wie ingelogd is met een club, krijgt "zijn" stadion te zien.
export const dynamic = 'force-dynamic'

// Wat het virtuele stadion een supporter biedt: een spel in je eigen stadion, samen met je club.
// Geen wedstrijd die je komt bekijken, wel een plek om naartoe te gaan.
const TROEVEN = [
  { icoon: '🟡', titel: 'Opdrachten', tekst: 'Vind de 25 gouden ballen.' },
  { icoon: '👥', titel: 'Samen', tekst: 'Met je clubgenoten.' },
  { icoon: '🏟️', titel: 'Jouw kleuren', tekst: 'Tot het laatste stoeltje.' },
  { icoon: '🎡', titel: 'Fandorp', tekst: 'Ritten en kermisspelletjes.' },
  { icoon: '🏆', titel: 'Hall of Fame', tekst: 'Je erelijst, achter glas.' },
  { icoon: '🎆', titel: 'Vuurwerk', tekst: 'Druk op de rode knop.' },
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
        <p className="vk-terugkomen">Kom naar jullie stadion, vervolledig de opdrachten en breng je clubgenoten mee.</p>

      </div>
    </>
  )
}
