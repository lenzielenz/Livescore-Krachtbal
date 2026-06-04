import Link from 'next/link'

import { type Profile } from '@/lib/profiles'

// Toont "de rest" van een profiel als een nette strook knoppen, bovenaan de
// profielpagina. `currentHref` verbergt de tool die naar de huidige pagina
// wijst (geen knop die naar zichzelf linkt).
export function ProfileTools({ profile, currentHref }: { profile: Profile; currentHref?: string }) {
  const tools = profile.tools.filter((t) => t.href !== currentHref)
  if (tools.length === 0) return null

  return (
    <nav className="ptools" aria-label={`${profile.title} — snelkoppelingen`}>
      {tools.map((t) => (
        <Link key={t.href} href={t.href} className="ptools-link">
          {t.label}
        </Link>
      ))}
    </nav>
  )
}
