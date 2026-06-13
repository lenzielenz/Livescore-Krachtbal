import Link from 'next/link'

// Vaste volgorde van de wedstrijddag-stappen, zodat duidelijk is wat na wat komt.
// Gebruikt op de scout-/opstelling-/scheidsrechter-/aftekenen-pagina's; markeert de huidige stap.
export type MatchDayStep = 'scout' | 'opstelling' | 'scheidsrechter' | 'aantekenen' | 'aftekenen'

const STEPS: { key: MatchDayStep; label: string; href: (id: string | number) => string }[] = [
  { key: 'scout', label: 'Scout', href: (id) => `/scout/${id}` },
  { key: 'opstelling', label: 'Opstelling', href: (id) => `/opstelling/${id}` },
  { key: 'scheidsrechter', label: 'Scheidsrechter', href: (id) => `/scheidsrechter/${id}` },
  { key: 'aantekenen', label: 'Aantekenen', href: (id) => `/scorekeeper/${id}` },
  { key: 'aftekenen', label: 'Aftekenen', href: (id) => `/aftekenen/${id}` },
]

// De Scout-stap (tegenstander-analyse) is privé: enkel zichtbaar voor wie analyse-toegang heeft
// (canScout). Andere clubs/supporters zien hem niet. De nummering blijft doorlopen.
export function MatchDayNav({
  matchId,
  current,
  canScout = false,
}: {
  matchId: string | number
  current: MatchDayStep
  canScout?: boolean
}) {
  const steps = STEPS.filter((s) => s.key !== 'scout' || canScout)
  return (
    <nav className="mdn" aria-label="Wedstrijddag-stappen">
      {steps.map((s, i) => (
        <Link key={s.key} href={s.href(matchId)} className={`mdn-step ${s.key === current ? 'on' : ''}`}>
          <span className="mdn-num">{i + 1}</span>
          {s.label}
        </Link>
      ))}
    </nav>
  )
}
