'use client'

import Link from 'next/link'
import { useState } from 'react'

import { PACKAGES_ENABLED } from '@/lib/packages'
import './site-header.css'

// Eén gedeelde navigatie voor alle pagina's, uitgelijnd op de vier profielen:
// supporters volgen wedstrijden (primair); de tools voor clubs, scheidsrechters
// en federatie staan samen onder één "Meer"-menu, daar netjes per profiel
// gegroepeerd. De `active`-prop markeert de huidige sectie.
export type NavSection = 'wedstrijden' | 'tornooi' | 'clubs' | 'scheidsrechters' | 'federatie' | null

const PRIMARY: { href: string; label: string; key: NavSection }[] = [
  { href: '/', label: 'Wedstrijden', key: 'wedstrijden' },
  { href: '/tornooi', label: 'Tornooi', key: 'tornooi' },
]

type MenuItem = { href: string; label: string; external?: boolean }
type MenuGroup = { key: Exclude<NavSection, 'wedstrijden' | 'tornooi' | null>; label: string; items: MenuItem[] }

const GROUPS: MenuGroup[] = [
  {
    key: 'clubs',
    label: 'Voor clubs',
    items: [
      { href: '/scorekeeper', label: '📝 Aantekenen' },
      { href: '/club', label: '👥 Mijn club' },
      { href: '/kantine', label: '🍻 Kantinescherm' },
      { href: '/cast', label: '📺 Schermen naar tv' },
      { href: '/beheer/spelers', label: 'Spelers toevoegen' },
      { href: '/demo', label: '🎓 Demo spelen' },
    ],
  },
  {
    key: 'scheidsrechters',
    label: 'Scheidsrechters',
    items: [
      { href: '/scheidsrechter/portaal', label: '🟨 Mijn QR-portaal' },
      { href: '/vergoedingen', label: '💶 Vergoedingen' },
    ],
  },
  {
    key: 'federatie',
    label: 'Federatie',
    items: [
      { href: '/admin', label: 'Beheer (admin)' },
      { href: '/beheer/planning', label: '📅 Seizoensplanning' },
      { href: '/reglement', label: 'Reglement' },
      { href: '/knipjes', label: 'Knipjes' },
      { href: '/bekerfinale', label: 'Bekerfinale' },
      // Prijspakketten alleen tonen wanneer de pakket-feature actief is.
      ...(PACKAGES_ENABLED ? [{ href: '/pakketten', label: '💎 Pakketten' }] : []),
    ],
  },
]

const MENU_KEYS = GROUPS.map((g) => g.key)

export function SiteHeader({ active = null }: { active?: NavSection }) {
  const [open, setOpen] = useState(false)
  const menuActive = active !== null && (MENU_KEYS as NavSection[]).includes(active)

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
                  {GROUPS.map((group) => (
                    <div key={group.key} className="sh-more-group">
                      <div className="sh-more-grouphead">{group.label}</div>
                      {group.items.map((l) =>
                        l.external ? (
                          <a key={l.href} href={l.href} className="sh-more-item" target="_blank" rel="noreferrer">
                            {l.label}
                          </a>
                        ) : (
                          <Link key={l.href} href={l.href} className="sh-more-item" onClick={() => setOpen(false)}>
                            {l.label}
                          </Link>
                        ),
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </nav>
      </div>
    </header>
  )
}
