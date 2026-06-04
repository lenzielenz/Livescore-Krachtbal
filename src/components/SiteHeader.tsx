'use client'

import Link from 'next/link'
import { useState } from 'react'

import { PACKAGES_ENABLED } from '@/lib/packages'
import './site-header.css'

// Eén gedeelde navigatie voor alle pagina's, uitgelijnd op de vier profielen:
// supporters volgen wedstrijden (primair), de rest staat per profiel onder een
// eigen menu. De `active`-prop markeert de huidige sectie.
export type NavSection = 'wedstrijden' | 'tornooi' | 'clubs' | 'scheidsrechters' | 'federatie' | null

const PRIMARY: { href: string; label: string; key: NavSection }[] = [
  { href: '/', label: 'Wedstrijden', key: 'wedstrijden' },
  { href: '/tornooi', label: 'Tornooi', key: 'tornooi' },
]

type MenuItem = { href: string; label: string; external?: boolean }
type Menu = { key: Exclude<NavSection, null>; label: string; items: MenuItem[] }

const MENUS: Menu[] = [
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

export function SiteHeader({ active = null }: { active?: NavSection }) {
  // Welk rolmenu staat open (één tegelijk).
  const [open, setOpen] = useState<NavSection>(null)

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

          {MENUS.map((menu) => (
            <div key={menu.key} className="sh-more">
              <button
                type="button"
                className={`sh-link sh-more-btn ${active === menu.key ? 'on' : ''}`}
                aria-expanded={open === menu.key ? 'true' : 'false'}
                onClick={() => setOpen((v) => (v === menu.key ? null : menu.key))}
              >
                {menu.label} ▾
              </button>
              {open === menu.key && (
                <>
                  <div className="sh-more-backdrop" onClick={() => setOpen(null)} />
                  <div className="sh-more-menu">
                    {menu.items.map((l) =>
                      l.external ? (
                        <a key={l.href} href={l.href} className="sh-more-item" target="_blank" rel="noreferrer">
                          {l.label}
                        </a>
                      ) : (
                        <Link key={l.href} href={l.href} className="sh-more-item" onClick={() => setOpen(null)}>
                          {l.label}
                        </Link>
                      ),
                    )}
                  </div>
                </>
              )}
            </div>
          ))}
        </nav>
      </div>
    </header>
  )
}
