'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { PROFILES } from '@/lib/profiles'
import './site-header.css'

// Eén gedeelde navigatie. Supporters volgen wedstrijden (primair). Al de rest zit
// onder één opgekuist "Meer"-menu: ontdekken (tornooi, demo) en de drie
// profiel-instappunten. Klik je een profiel, dan vind je dáár de bijhorende tools.
// De `active`-prop markeert de huidige sectie.
export type NavSection = 'wedstrijden' | 'stand' | 'demo' | 'analyse' | 'tornooi' | 'clubs' | 'scheidsrechters' | 'federatie' | null

const PRIMARY: { href: string; label: string; key: NavSection }[] = [
  { href: '/', label: 'Wedstrijden', key: 'wedstrijden' },
  { href: '/demo', label: '🎓 Demo', key: 'demo' },
]

// Algemene ingangen bovenaan het Meer-menu.
const GENERAL = [
  { href: '/rangschikking', label: '📊 Stand' },
  { href: '/tornooi', label: '🏆 Tornooi' },
]

// Het Meer-menu licht op zodra je op een van deze secties zit. ('analyse' staat nu als eigen
// knop in de balk — de analyse-hub bevat zelf al alle tools, dus geen apart submenu meer.)
const MENU_SECTIONS: NavSection[] = ['stand', 'tornooi', 'clubs', 'scheidsrechters', 'federatie']

export function SiteHeader({ active = null }: { active?: NavSection }) {
  const [open, setOpen] = useState(false)
  // Admin (of een account met analyse-toegang) krijgt de 'Analyse'-knop in de balk.
  const [canAnalyse, setCanAnalyse] = useState(false)
  const [loggedIn, setLoggedIn] = useState(false)
  useEffect(() => {
    fetch('/api/users/me', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const u = (d as { user?: { roles?: unknown; analyseAccess?: unknown } } | null)?.user
        const roles = u?.roles
        const admin = Array.isArray(roles) && roles.includes('admin')
        setLoggedIn(Boolean(u))
        setCanAnalyse(admin || Boolean(u?.analyseAccess))
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

        <nav className="sh-nav">
          {PRIMARY.map((l) => (
            <Link key={l.href} href={l.href} className={`sh-link ${active === l.key ? 'on' : ''}`}>
              {l.label}
            </Link>
          ))}
          {canAnalyse && (
            <Link href="/analyse" className={`sh-link ${active === 'analyse' ? 'on' : ''}`}>
              📈 Analyse
            </Link>
          )}

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
    </header>
  )
}
