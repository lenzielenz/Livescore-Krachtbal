import Link from 'next/link'

// Gedeelde analyse-navigatie: één samenhangende tabbalk bovenaan elke analyse-pagina.
const TABS = [
  { key: 'overzicht', href: '/analyse', icon: '📈', label: 'Overzicht' },
  { key: 'seizoen', href: '/analyse/seizoen', icon: '📊', label: 'Seizoen' },
  { key: 'spelers', href: '/analyse/spelers', icon: '🎯', label: 'Spelers' },
  { key: 'verwacht', href: '/analyse/verwacht', icon: '📐', label: 'Verwacht' },
  { key: 'ploeg', href: '/analyse/ploeg', icon: '🛡️', label: 'Ploeg' },
  { key: 'ploegen', href: '/analyse/ploegen', icon: '🆚', label: 'Vergelijk' },
  { key: 'gevaar', href: '/analyse/gevaar', icon: '🔥', label: 'Gevaar' },
] as const

export type AnalyseTab = (typeof TABS)[number]['key']

export function AnalyseNav({ active }: { active: AnalyseTab }) {
  return (
    <nav className="an-nav" aria-label="Analyse">
      {TABS.map((t) => (
        <Link key={t.key} href={t.href} className={`an-nav-tab${t.key === active ? ' on' : ''}`}>
          <span className="an-nav-ico" aria-hidden>{t.icon}</span>
          <span className="an-nav-lbl">{t.label}</span>
        </Link>
      ))}
    </nav>
  )
}
