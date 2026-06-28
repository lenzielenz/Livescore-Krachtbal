import Link from 'next/link'

// Subnav voor het trainingsluik. Groeit mee als training verder uitgebreid wordt.
const TABS = [
  { key: 'start', href: '/beheer/training', icon: '🏋️', label: 'Start' },
  { key: 'kalender', href: '/beheer/training/kalender', icon: '📅', label: 'Kalender' },
  { key: 'plan', href: '/beheer/training/plan', icon: '🧠', label: 'Trainingsplan' },
  { key: 'progressie', href: '/beheer/training/progressie', icon: '📈', label: 'Progressie' },
  { key: 'aanwezigheid', href: '/beheer/training/aanwezigheid', icon: '✅', label: 'Aanwezigheid' },
  { key: 'voeding', href: '/beheer/training/voeding', icon: '🥗', label: 'Voeding' },
] as const

export type TrainingTab = (typeof TABS)[number]['key']

export function TrainingNav({ active }: { active: TrainingTab }) {
  return (
    <nav className="tr-nav" aria-label="Training">
      {TABS.map((t) => (
        <Link key={t.key} href={t.href} className={`tr-nav-tab${t.key === active ? ' on' : ''}`}>
          <span aria-hidden>{t.icon}</span> {t.label}
        </Link>
      ))}
    </nav>
  )
}
