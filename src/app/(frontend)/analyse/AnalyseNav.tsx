import Link from 'next/link'

import { getSelectedSeason, listSeasons } from '@/lib/analyse-season'
import { getPayloadClient } from '@/lib/payload-client'
import { SeizoenGlobalPicker } from './SeizoenGlobalPicker'

// Gedeelde analyse-navigatie: één compacte tabbalk. De vele losse tools zijn gebundeld in twee
// groepen (Ploegen / Spelers) die naar de gegroepeerde secties op de overzichtspagina springen,
// zodat je niet door een lange rij menu's moet.
const TABS = [
  { key: 'overzicht', href: '/analyse', icon: '📈', label: 'Overzicht' },
  { key: 'ploegen', href: '/analyse#ploegen', icon: '🛡️', label: 'Ploegen' },
  { key: 'spelers', href: '/analyse#spelers', icon: '🎯', label: 'Spelers' },
  { key: 'beheer', href: '/analyse/beheer', icon: '🗂️', label: 'Mijn data' },
] as const

export type AnalyseTab = (typeof TABS)[number]['key']

export async function AnalyseNav({ active }: { active: AnalyseTab }) {
  const payload = await getPayloadClient()
  const [seasons, current] = await Promise.all([listSeasons(payload), getSelectedSeason()])
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
      <SeizoenGlobalPicker seasons={seasons} current={current ?? 'all'} />
    </div>
  )
}
