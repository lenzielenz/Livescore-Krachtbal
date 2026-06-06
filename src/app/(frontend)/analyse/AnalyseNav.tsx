import Link from 'next/link'

import { getSelectedSeason, listSeasons } from '@/lib/analyse-season'
import { getPayloadClient } from '@/lib/payload-client'
import { SeizoenGlobalPicker } from './SeizoenGlobalPicker'

// Gedeelde analyse-navigatie: één samenhangende tabbalk bovenaan elke analyse-pagina, met rechts
// de globale seizoenkeuze (die voor de hele analyse geldt).
const TABS = [
  { key: 'overzicht', href: '/analyse', icon: '📈', label: 'Overzicht' },
  { key: 'seizoen', href: '/analyse/seizoen', icon: '📊', label: 'Seizoen' },
  { key: 'spelers', href: '/analyse/spelers', icon: '🎯', label: 'Spelers' },
  { key: 'panini', href: '/analyse/panini', icon: '🃏', label: 'Panini' },
  { key: 'verwacht', href: '/analyse/verwacht', icon: '📐', label: 'Verwacht' },
  { key: 'ploeg', href: '/analyse/ploeg', icon: '🛡️', label: 'Ploeg' },
  { key: 'ploegen', href: '/analyse/ploegen', icon: '🆚', label: 'Vergelijk' },
  { key: 'gevaar', href: '/analyse/gevaar', icon: '🔥', label: 'Gevaar' },
  { key: 'training', href: '/beheer/training', icon: '🏋️', label: 'Training' },
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
