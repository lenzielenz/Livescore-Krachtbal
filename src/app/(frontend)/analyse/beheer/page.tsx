import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { canAnalyse } from '@/lib/access'
import { analyseOwnWhere } from '@/lib/analyse-access'
import { getAuthUser } from '@/lib/auth-user'
import { getPayloadClient } from '@/lib/payload-client'
import { AnalyseNav } from '../AnalyseNav'
import '../analyse.css'
import './beheer.css'

export const dynamic = 'force-dynamic'

// Beheer-hub van de eigen analyse-database: clubs → ploegen → spelers. Volledig losgekoppeld van de
// competitie — je bouwt hier je eigen set op die enkel jij (en de admin) ziet.
export default async function AnalyseBeheerPage() {
  const me = await getAuthUser()
  if (!canAnalyse(me)) {
    return (
      <>
        <SiteHeader active="analyse" />
        <div className="site">
          <h1 className="page-title"><span className="brand">Analyse</span></h1>
          <p className="empty">
            Je hebt geen toegang tot de analyse. Vraag een admin om je toegang te geven.{' '}
            <Link href="/inloggen" style={{ color: 'var(--accent)' }}>Inloggen →</Link>
          </p>
        </div>
      </>
    )
  }

  const payload = await getPayloadClient()
  const scope = analyseOwnWhere(me)
  const [clubs, teams, players] = await Promise.all([
    payload.count({ collection: 'clubs', where: scope }).catch(() => ({ totalDocs: 0 })),
    payload.count({ collection: 'teams', where: scope }).catch(() => ({ totalDocs: 0 })),
    payload.count({ collection: 'players', where: scope }).catch(() => ({ totalDocs: 0 })),
  ])

  const cards = [
    { href: '/analyse/beheer/clubs', icon: '🏛️', title: 'Clubs', desc: 'Je eigen clubs aanmaken en beheren.', count: clubs.totalDocs, unit: 'clubs', tone: 'home' },
    { href: '/analyse/beheer/ploegen', icon: '🛡️', title: 'Ploegen', desc: 'Ploegen per reeks, gekoppeld aan je clubs.', count: teams.totalDocs, unit: 'ploegen', tone: 'away' },
    { href: '/analyse/beheer/spelers', icon: '🎽', title: 'Spelers', desc: 'Spelers met rugnummer en positie, per ploeg.', count: players.totalDocs, unit: 'spelers', tone: 'accent' },
  ] as const

  return (
    <>
      <SiteHeader active="analyse" />
      <div className="site">
        <AnalyseNav active="beheer" />
        <h1 className="page-title"><span className="brand">Mijn analyse-data</span></h1>
        <p className="acc-page-intro">
          Hier bouw je je <strong>eigen database</strong> op: clubs, ploegen en spelers — volledig los van de competitie.
          De spelers en ploegen uit de competitie kan je hier niet kiezen; alles wat je hier aanmaakt is enkel voor
          jouw analyses. Begin bij een <strong>club</strong>, maak daar <strong>ploegen</strong> onder aan, en vul ze met
          <strong> spelers</strong>.
        </p>
        <div className="anb-cards">
          {cards.map((c) => (
            <Link key={c.href} href={c.href} className={`an-tool tone-${c.tone}`}>
              <span className="an-tool-ico" aria-hidden>{c.icon}</span>
              <span className="an-tool-body">
                <span className="an-tool-title">{c.title} <span className="anb-count">{c.count} {c.unit}</span></span>
                <span className="an-tool-desc">{c.desc}</span>
              </span>
              <span className="an-tool-arrow" aria-hidden>→</span>
            </Link>
          ))}
        </div>
      </div>
    </>
  )
}
