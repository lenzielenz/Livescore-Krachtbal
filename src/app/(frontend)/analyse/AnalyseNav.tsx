import Link from 'next/link'

import { getSelectedSeason, listSeasons } from '@/lib/analyse-season'
import { getPayloadClient } from '@/lib/payload-client'
import { nextSeason, seasonFromDate } from '@/lib/seasons'
import { SeizoenGlobalPicker } from './SeizoenGlobalPicker'

// Gedeelde analyse-navigatie: één compacte tabbalk. De vele losse tools zijn gebundeld in twee
// groepen (Ploegen / Spelers) die naar de gegroepeerde secties op de overzichtspagina springen,
// zodat je niet door een lange rij menu's moet.
const TABS = [
  { key: 'overzicht', href: '/analyse', icon: '📈', label: 'Overzicht' },
  { key: 'coach', href: '/analyse/coach', icon: '🧭', label: 'Coach' },
  { key: 'ploegen', href: '/analyse#ploegen', icon: '🛡️', label: 'Ploegen' },
  { key: 'spelers', href: '/analyse#spelers', icon: '🎯', label: 'Spelers' },
  { key: 'beheer', href: '/analyse/beheer', icon: '🗂️', label: 'Mijn data' },
] as const

export type AnalyseTab = (typeof TABS)[number]['key']

export async function AnalyseNav({ active }: { active: AnalyseTab }) {
  const payload = await getPayloadClient()
  const [seasons, current] = await Promise.all([listSeasons(payload), getSelectedSeason()])
  // Nog niet bestaande seizoenen die je kan starten: het huidige (op datum) en het seizoen ná het
  // laatste met data. Zo kan je altijd een vers, leeg seizoen openen — ook als er nog niets is.
  const now = seasonFromDate(new Date())
  const afterLatest = seasons.length ? nextSeason(seasons[0]) : now
  const startable = [...new Set([now, afterLatest])].filter((s) => !seasons.includes(s)).sort()
  const newSeason = startable.length ? startable[startable.length - 1] : null
  return (
    <div className="an-navwrap">
      <nav className="an-nav" aria-label="Analyse">
        {TABS.map((t) => (
          <Link key={t.key} href={t.href} className={`an-nav-tab${t.key === active ? ' on' : ''}`}>
            <span className="an-nav-ico" aria-hidden>{t.icon}</span>
            <span className="an-nav-lbl">{t.label}</span>
          </Link>
        ))}
      </nav>
      <SeizoenGlobalPicker seasons={seasons} startable={startable} newSeason={newSeason} current={current ?? 'all'} />
    </div>
  )
}
