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

// Alles wat de analysemodule aanbiedt — zichtbaar voor admin/analyse-toegang.
// "Wedstrijd invullen" hoort hier ook bij: de opname voedt de analyse.
const ANALYSE_LINKS = [
  { href: '/analyse', label: '📈 Analyse-overzicht' },
  { href: '/scorekeeper', label: '📝 Wedstrijd invullen' },
  { href: '/analyse/seizoen', label: '📊 Seizoensanalyse' },
  { href: '/analyse/spelers', label: '🎯 Spelersradar' },
  { href: '/analyse/panini', label: '🃏 Panini-kaart' },
  { href: '/analyse/verwacht', label: '🎯 Verwachte punten (xP)' },
  { href: '/analyse/ploeg', label: '🛡️ Ploegrapport & export' },
  { href: '/analyse/ploegen', label: '🆚 Ploegvergelijking' },
  { href: '/analyse/gevaar', label: '🔥 Gevaarzone per speler' },
]

// Het Meer-menu licht op zodra je op een van deze secties zit.
const MENU_SECTIONS: NavSection[] = ['stand', 'analyse', 'tornooi', 'clubs', 'scheidsrechters', 'federatie']

export function SiteHeader({ active = null }: { active?: NavSection }) {
  const [open, setOpen] = useState(false)
  // Admin (of een account met analyse-toegang) krijgt er een 'Analyse'-menu bij.
  const [canAnalyse, setCanAnalyse] = useState(false)
  // Enkel een admin krijgt 'Demo expert' (volledige scoreopnemer i.p.v. de basisdemo).
  const [isAdmin, setIsAdmin] = useState(false)
  const [loggedIn, setLoggedIn] = useState(false)
  useEffect(() => {
    fetch('/api/users/me', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const u = (d as { user?: { roles?: unknown; analyseAccess?: unknown } } | null)?.user
        const roles = u?.roles
        const admin = Array.isArray(roles) && roles.includes('admin')
        setLoggedIn(Boolean(u))
        setIsAdmin(admin)
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
                  {canAnalyse && (
                    <div className="sh-more-group">
                      <div className="sh-more-grouphead">Analyse</div>
                      {ANALYSE_LINKS.map((l) => (
                        <Link key={l.href} href={l.href} className="sh-more-item" onClick={() => setOpen(false)}>
                          {l.label}
                        </Link>
                      ))}
                      {isAdmin && (
                        <Link href="/demo/expert" className="sh-more-item" onClick={() => setOpen(false)}>
                          🧪 Demo expert
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
    </header>
  )
}
