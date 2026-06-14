'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { WeatherWidget } from '@/components/WeatherWidget'
import { canAnalyse as canAnalyseUser } from '@/lib/access'
import { clearNavAuth, readNavAuth, writeNavAuth } from '@/lib/nav-auth-cache'
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

// Algemene ingangen bovenaan het Meer-menu. Het kantinescherm staat hier niet
// (meer): dat is een clubtool en vind je onder "Mijn club".
const GENERAL: { href: string; label: string }[] = [
  { href: '/uitleg', label: '❓ Zo werkt het' },
]

// Wedstrijd-info onder een eigen kopje "Wedstrijden" in het menu.
const WEDSTRIJDEN: { href: string; label: string }[] = [
  { href: '/rangschikking', label: '📊 Stand' },
  { href: '/tornooi', label: '🏆 Bekerwedstrijden' },
  { href: '/superster', label: '⭐ Jeugd-superster' },
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
    // Schilder meteen vanuit de cache (geen flikkering), en haal enkel verse staat op
    // wanneer de cache ontbreekt of verlopen is — dat spaart een netwerkronde per navigatie.
    const cached = readNavAuth()
    if (cached) {
      setLoggedIn(cached.state.loggedIn)
      setCanAnalyse(cached.state.canAnalyse)
      setCanTraining(cached.state.canTraining)
    }
    if (cached?.fresh) return
    fetch('/api/users/me', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const u = (d as { user?: { roles?: unknown; analyseAccess?: unknown; trainingAccess?: unknown } } | null)?.user
        const roles = u?.roles
        const has = (r: string) => Array.isArray(roles) && roles.includes(r)
        const fed = has('admin') || has('federatie')
        const club = has('club-beheerder')
        // Dezelfde regel als canAnalyse in lib/access: admin, eigen analyse-toegang, of iemand
        // die zijn analyses met dit account deelt (anders vindt de gedeelde persoon het menu niet).
        const state = {
          loggedIn: Boolean(u),
          canAnalyse: canAnalyseUser(u),
          canTraining: fed || club || Boolean(u?.trainingAccess),
        }
        setLoggedIn(state.loggedIn)
        setCanAnalyse(state.canAnalyse)
        setCanTraining(state.canTraining)
        writeNavAuth(state)
      })
      .catch(() => {})
  }, [])
  const logout = async () => {
    try {
      await fetch('/api/users/logout', { method: 'POST', credentials: 'include' })
    } catch {
      /* sessie verloopt sowieso server-side */
    }
    clearNavAuth()
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
                    {GENERAL.map((l) => (
                      <Link key={l.href} href={l.href} className="sh-more-item" onClick={() => setOpen(false)}>
                        {l.label}
                      </Link>
                    ))}
                  </div>
                  <div className="sh-more-group">
                    <div className="sh-more-grouphead">Wedstrijden</div>
                    {WEDSTRIJDEN.map((l) => (
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
                  {/* "Aan de slag" (profiel-instappunten) enkel voor ingelogde gebruikers —
                      een uitgelogde bezoeker krijgt deze tools nog niet te zien. */}
                  {loggedIn && (
                    <div className="sh-more-group">
                      <div className="sh-more-grouphead">Aan de slag</div>
                      {PROFILES.map((p) => (
                        <Link key={p.key} href={p.hubHref} className="sh-more-item" onClick={() => setOpen(false)}>
                          {p.badge} {p.hubLabel}
                        </Link>
                      ))}
                    </div>
                  )}
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
