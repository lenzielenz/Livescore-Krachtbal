import Link from 'next/link'

import { verborgenInDemo } from '@/lib/omgeving'

// Het menu van "Mijn club": alles wat een club doet, als kleine tegels in één raster (twee per rij
// op gsm). Bewust geen losse pillen, linkjes en grote kaarten door elkaar: een clubbeheerder moet
// in één oogopslag zien waar hij moet tikken. Wat enkel de clubstaf aangaat, ziet een coach niet.
type Tegel = { href: string; icoon: string; label: string; staf?: boolean; beheerder?: boolean }

// Eerst wat nodig is om wedstrijden te spelen en te regelen: wie mag spelen, nieuwe spelers,
// blessures, wie wat mag in de club, boetes en de inschrijving. De rest (schermen, pronostiek,
// referendum, aanwezigheid) staat ingeklapt onder "Meer".
const NODIG: Tegel[] = [
  { href: '/club/leden', icoon: '🪪', label: 'Leden — wie mag spelen', staf: true },
  { href: '/beheer/spelers', icoon: '➕', label: 'Speler toevoegen', staf: true },
  { href: '/ongevallen', icoon: '🚑', label: 'Blessures', staf: true },
  { href: '/beheer/club-team', icoon: '👥', label: 'Coaches & tafel', beheerder: true },
  { href: '/club/boetes', icoon: '💶', label: 'Boetes & kosten', staf: true },
  { href: '/club/inschrijving', icoon: '📝', label: 'Inschrijving seizoen', staf: true },
]
const MEER: Tegel[] = [
  { href: '/club/veldscherm', icoon: '🏟️', label: 'Veldscherm' },
  { href: '/kantine', icoon: '🍻', label: 'Kantinescherm' },
  { href: '/cast', icoon: '📺', label: 'Naar tv' },
  { href: '/club/voorspel', icoon: '🔮', label: 'Pronostiek' },
  { href: '/referendum', icoon: '🏅', label: 'Referendum' },
  { href: '/beheer/training/aanwezigheid', icoon: '✅', label: 'Aanwezigheid' },
]

function Raster({ tegels }: { tegels: Tegel[] }) {
  return (
    <div className="cmenu-raster">
      {tegels.map((t) => (
        <Link key={t.href} href={t.href} className="cmenu-tegel">
          <span className="cmenu-icoon" aria-hidden>{t.icoon}</span>
          <span className="cmenu-label">{t.label}</span>
        </Link>
      ))}
    </div>
  )
}

export function ClubMenu({ staf, beheerder }: { staf: boolean; beheerder: boolean }) {
  const mag = (t: Tegel) => (!t.staf || staf) && (!t.beheerder || beheerder) && !verborgenInDemo(t.href)
  const nodig = NODIG.filter(mag)
  const meer = MEER.filter(mag)
  return (
    <nav className="cmenu" aria-label="Menu van je club">
      {nodig.length > 0 && (
        <section className="cmenu-groep">
          <h2 className="cmenu-titel">Wedstrijden spelen &amp; regelen</h2>
          <Raster tegels={nodig} />
        </section>
      )}
      {meer.length > 0 && (
        <details className="cmenu-meer">
          <summary>Meer: schermen, pronostiek, referendum</summary>
          <Raster tegels={meer} />
        </details>
      )}
    </nav>
  )
}
