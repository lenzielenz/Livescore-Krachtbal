'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { WeatherWidget } from '@/components/WeatherWidget'
import { canAnalyse as canAnalyseUser } from '@/lib/access'
import { PROFILES } from '@/lib/profiles'
import './site-header.css'

// Eén gedeelde navigatie. Supporters volgen wedstrijden (primair). Al de rest zit
// onder één opgekuist "Meer"-menu: ontdekken (tornooi, demo) en de drie
// profiel-instappunten. Klik je een profiel, dan vind je dáár de bijhorende tools.
// De `active`-prop markeert de huidige sectie.
export type NavSection = 'wedstrijden' | 'stand' | 'demo' | 'analyse' | 'training' | 'tornooi' | 'clubs' | 'scheidsrechters' | 'federatie' | null

const PRIMARY: { href: string; label: string; key: NavSection }[] = [
  { href: '/', label: 'Wedstrijden', key: 'wedstrijden' },
  { href: '/demo', label: '🎓 Demo', key: 'demo' },
]

// Algemene ingangen bovenaan het Meer-menu.
const GENERAL: { href: string; label: string; auth?: boolean }[] = [
  { href: '/uitleg', label: '❓ Zo werkt het' },
  { href: '/rangschikking', label: '📊 Stand' },
  { href: '/superster', label: '⭐ Jeugd-superster' },
  { href: '/tornooi', label: '🏆 Bekerwedstrijden' },
  // Kantinescherm enkel voor ingelogde gebruikers (zo kan je het personaliseren).
  { href: '/kantine', label: '🍺 Kantinescherm', auth: true },
]

// Het Meer-menu licht op zodra je op een van deze secties zit. Analyse en Training zijn twee
// aparte menu-items (de analyse-hub bevat zelf al z'n tools; training is een eigen luik).
const MENU_SECTIONS: NavSection[] = ['stand', 'analyse', 'training', 'tornooi', 'clubs', 'scheidsrechters', 'federatie']

export function SiteHeader({ active = null }: { active?: NavSection }) {
  const [open, setOpen] = useState(false)
  // Analyse-toegang (admin/analyse) en training-toegang (analyse of club-beheerder) bepalen
  // welke menu-items verschijnen.
  const [canAnalyse, setCanAnalyse] = useState(false)
  const [canTraining, setCanTraining] = useState(false)
  const [loggedIn, setLoggedIn] = useState(false)
  useEffect(() => {
    fetch('/api/users/me', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const u = (d as { user?: { roles?: unknown; analyseAccess?: unknown; trainingAccess?: unknown } } | null)?.user
        const roles = u?.roles
        const has = (r: string) => Array.isArray(roles) && roles.includes(r)
        const fed = has('admin') || has('federatie')
        const club = has('club-beheerder')
        setLoggedIn(Boolean(u))
        // Dezelfde regel als canAnalyse in lib/access: admin, eigen analyse-toegang, of iemand
        // die zijn analyses met dit account deelt (anders vindt de gedeelde persoon het menu niet).
        setCanAnalyse(canAnalyseUser(u))
        setCanTraining(fed || club || Boolean(u?.trainingAccess))
      })
      .catch(() => {})
  }, [])
  const logout = async () => {
    try {
      await fetch('/api/users/logout', { method: 'POST', credentials: 'include' })
    } catch {
      /* sessie verloopt sowieso server-side */
    }
    window.location.href = '/'
  }
  const menuActive = active !== null && MENU_SECTIONS.includes(active)

  return (
    <header className="sh">
      <div className="sh-inner">
        <Link href="/" className="sh-brand" title="Naar de wedstrijden">
          Krachtbal <span className="brand">Live</span>
        </Link>

        {/* Weer + navigatie vormen één rechtercluster: zo wikkelen ze samen netjes onder de titel
            op smalle schermen i.p.v. dat het weer apart blijft hangen. */}
        <div className="sh-right">
          <WeatherWidget variant="compact" />

          <nav className="sh-nav">
          {PRIMARY.map((l) => (
            <Link key={l.href} href={l.href} className={`sh-link sh-link-${l.key} ${active === l.key ? 'on' : ''}`}>
              {l.label}
            </Link>
          ))}

          <div className="sh-more">
            <button
              type="button"
              className={`sh-link sh-more-btn ${menuActive ? 'on' : ''}`}
              aria-expanded={open ? 'true' : 'false'}
              onClick={() => setOpen((v) => !v)}
            >
              Meer ▾
            </button>
            {open && (
              <>
                <div className="sh-more-backdrop" onClick={() => setOpen(false)} />
                <div className="sh-more-menu">
                  <div className="sh-more-group">
                    {GENERAL.filter((l) => !l.auth || loggedIn).map((l) => (
                      <Link key={l.href} href={l.href} className="sh-more-item" onClick={() => setOpen(false)}>
                        {l.label}
                      </Link>
                    ))}
                  </div>
                  {/* Analyse en training staan apart als eigen "Coach"-luik. */}
                  {(canAnalyse || canTraining) && (
                    <div className="sh-more-group">
                      <div className="sh-more-grouphead">Coach</div>
                      {canAnalyse && (
                        <Link href="/analyse" className="sh-more-item" onClick={() => setOpen(false)}>
                          📈 Analyse
                        </Link>
                      )}
                      {canTraining && (
                        <Link href="/beheer/training" className="sh-more-item" onClick={() => setOpen(false)}>
                          🏋️ Training
                        </Link>
                      )}
                    </div>
                  )}
                  <div className="sh-more-group">
                    <div className="sh-more-grouphead">Aan de slag</div>
                    {PROFILES.map((p) => (
                      <Link key={p.key} href={p.hubHref} className="sh-more-item" onClick={() => setOpen(false)}>
                        {p.badge} {p.hubLabel}
                      </Link>
                    ))}
                  </div>
                  <div className="sh-more-group">
                    <div className="sh-more-grouphead">Account</div>
                    {loggedIn ? (
                      <button type="button" className="sh-more-item" onClick={() => { setOpen(false); void logout() }}>
                        🚪 Uitloggen
                      </button>
                    ) : (
                      <>
                        <Link href="/registreren" className="sh-more-item" onClick={() => setOpen(false)}>
                          📝 Registreren
                        </Link>
                        <Link href="/inloggen" className="sh-more-item" onClick={() => setOpen(false)}>
                          🔐 Inloggen
                        </Link>
                      </>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </nav>
        </div>
      </div>
    </header>
  )
}
