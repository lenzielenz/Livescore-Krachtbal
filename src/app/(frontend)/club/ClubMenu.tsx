import Link from 'next/link'

import { verborgenInDemo } from '@/lib/omgeving'

// Het menu van "Mijn club": alles wat een club doet, als kleine tegels in één raster (twee per rij
// op gsm). Bewust geen losse pillen, linkjes en grote kaarten door elkaar: een clubbeheerder moet
// in één oogopslag zien waar hij moet tikken. Wat enkel de clubstaf aangaat, ziet een coach niet.
type Tegel = { href: string; icoon: string; label: string; staf?: boolean; beheerder?: boolean }

const GROEPEN: { titel: string; tegels: Tegel[] }[] = [
  {
    titel: 'Leden',
    tegels: [
      { href: '/club/leden', icoon: '🪪', label: 'Leden & registratie', staf: true },
      { href: '/beheer/spelers', icoon: '➕', label: 'Speler toevoegen', staf: true },
      { href: '/ongevallen', icoon: '🚑', label: 'Blessures', staf: true },
      { href: '/beheer/club-team', icoon: '👥', label: 'Clubteam & rollen', beheerder: true },
      { href: '/beheer/training/aanwezigheid', icoon: '✅', label: 'Aanwezigheid' },
    ],
  },
  {
    titel: 'Federatie',
    tegels: [
      { href: '/club/boetes', icoon: '💶', label: 'Boetes & kosten', staf: true },
      { href: '/club/inschrijving', icoon: '📝', label: 'Inschrijving seizoen', staf: true },
      { href: '/referendum', icoon: '🏅', label: 'Referendum' },
    ],
  },
  {
    titel: 'Schermen & supporters',
    tegels: [
      { href: '/club/veldscherm', icoon: '🏟️', label: 'Veldscherm' },
      { href: '/kantine', icoon: '🍻', label: 'Kantinescherm' },
      { href: '/cast', icoon: '📺', label: 'Naar tv' },
      { href: '/club/voorspel', icoon: '🔮', label: 'Pronostiek' },
    ],
  },
]

export function ClubMenu({ staf, beheerder }: { staf: boolean; beheerder: boolean }) {
  const groepen = GROEPEN.map((g) => ({
    ...g,
    tegels: g.tegels.filter((t) => (!t.staf || staf) && (!t.beheerder || beheerder) && !verborgenInDemo(t.href)),
  })).filter((g) => g.tegels.length > 0)
  return (
    <nav className="cmenu" aria-label="Menu van je club">
      {groepen.map((g) => (
        <section key={g.titel} className="cmenu-groep">
          <h2 className="cmenu-titel">{g.titel}</h2>
          <div className="cmenu-raster">
            {g.tegels.map((t) => (
              <Link key={t.href} href={t.href} className="cmenu-tegel">
                <span className="cmenu-icoon" aria-hidden>{t.icoon}</span>
                <span className="cmenu-label">{t.label}</span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </nav>
  )
}
