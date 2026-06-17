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
]

// Algemene ingangen bovenaan het Meer-menu (de twee meest gebruikte). Het kantinescherm staat
// hier niet (meer): dat is een clubtool en vind je onder "Mijn club".
// `auth: true` → enkel tonen wanneer je ingelogd bent ("Mijn Krachtbal" is je persoonlijke hub).
// "Zo werkt het" (de infohub /uitleg) bundelt uitleg + demo + prijzen en staat hier publiek,
// zodat de bovenbalk strak blijft (titel · weer · Meer) i.p.v. af te breken op smalle schermen.
const GENERAL: { href: string; label: string; auth?: boolean }[] = [
  { href: '/hub', label: '🏠 Mijn Krachtbal', auth: true },
  { href: '/nieuws', label: '📰 Nieuws' },
  { href: '/uitleg', label: '🎓 Zo werkt het' },
]

// Wedstrijd-info onder een eigen kopje "Wedstrijden" in het menu. Bewust kort gehouden: de overige
// supporter-tools (jeugd-superster, supportersklassement) staan als tegels op de hub.
const WEDSTRIJDEN: { href: string; label: string }[] = [
  { href: '/rangschikking', label: '📊 Stand' },
  { href: '/pronostiek', label: '🔮 Pronostiekstand' },
  { href: '/tornooi', label: '🏆 Bekerwedstrijden' },
]

// Welke rol een profiel-ingang mag zien. Federatie/admin zien alles.
const PROFILE_VISIBLE: Record<string, (a: { isClub: boolean; isReferee: boolean; isFed: boolean }) => boolean> = {
  clubs: (a) => a.isClub || a.isFed,
  scheidsrechters: (a) => a.isReferee || a.isFed,
  federatie: (a) => a.isFed,
}

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
  const [roleFlags, setRoleFlags] = useState({ isClub: false, isReferee: false, isFed: false })
  useEffect(() => {
    // Schilder meteen vanuit de cache (geen flikkering), en haal enkel verse staat op
    // wanneer de cache ontbreekt of verlopen is — dat spaart een netwerkronde per navigatie.
    const cached = readNavAuth()
    if (cached) {
      setLoggedIn(cached.state.loggedIn)
      setCanAnalyse(cached.state.canAnalyse)
      setCanTraining(cached.state.canTraining)
      setRoleFlags({ isClub: Boolean(cached.state.isClub), isReferee: Boolean(cached.state.isReferee), isFed: Boolean(cached.state.isFed) })
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
        const referee = has('scheidsrechter')
        // Dezelfde regel als canAnalyse in lib/access: admin, eigen analyse-toegang, of iemand
        // die zijn analyses met dit account deelt (anders vindt de gedeelde persoon het menu niet).
        const state = {
          loggedIn: Boolean(u),
          canAnalyse: canAnalyseUser(u),
          canTraining: fed || club || Boolean(u?.trainingAccess),
          isClub: club,
          isReferee: referee,
          isFed: fed,
        }
        setLoggedIn(state.loggedIn)
        setCanAnalyse(state.canAnalyse)
        setCanTraining(state.canTraining)
        setRoleFlags({ isClub: state.isClub, isReferee: state.isReferee, isFed: state.isFed })
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
  // Toon enkel de profiel-ingangen die bij je rol horen (supporter ziet er geen).
  const visibleProfiles = PROFILES.filter((p) => PROFILE_VISIBLE[p.key]?.(roleFlags))

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
                  {/* "Aan de slag" (profiel-instappunten) enkel voor wie de bijhorende rol heeft —
                      een supporter (of uitgelogde bezoeker) krijgt deze tools niet te zien. */}
                  {loggedIn && visibleProfiles.length > 0 && (
                    <div className="sh-more-group">
                      <div className="sh-more-grouphead">Aan de slag</div>
                      {visibleProfiles.map((p) => (
                        <Link key={p.key} href={p.hubHref} className="sh-more-item" onClick={() => setOpen(false)}>
                          {p.badge} {p.hubLabel}
                        </Link>
                      ))}
                    </div>
                  )}
                  <div className="sh-more-group">
                    <div className="sh-more-grouphead">Account</div>
                    {loggedIn ? (
                      <>
                        <button type="button" className="sh-more-item" onClick={() => { setOpen(false); void logout() }}>
                          🚪 Uitloggen
                        </button>
                      </>
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
