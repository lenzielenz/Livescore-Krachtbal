'use client'

import Link from 'next/link'
import { useState } from 'react'

import './site-header.css'

// Eén gedeelde navigatie voor alle inhoud-pagina's. Hoofdsecties altijd zichtbaar,
// de rest onder "Meer". De `active`-prop markeert de huidige sectie.
export type NavSection = 'live' | 'tornooi' | 'kantine' | 'aantekenen' | 'meer' | null

const PRIMARY: { href: string; label: string; key: NavSection }[] = [
  { href: '/live', label: 'Live', key: 'live' },
  { href: '/tornooi', label: 'Tornooi', key: 'tornooi' },
  { href: '/kantine', label: 'Kantine', key: 'kantine' },
  { href: '/scorekeeper', label: 'Aantekenen', key: 'aantekenen' },
]

const MORE: { href: string; label: string; external?: boolean }[] = [
  { href: '/demo', label: '🎓 Demo spelen' },
  { href: '/reglement', label: 'Reglement' },
  { href: '/knipjes', label: 'Knipjes' },
  { href: '/vergoedingen', label: 'Vergoedingen' },
  { href: '/bekerfinale', label: 'Bekerfinale' },
  { href: '/beheer/spelers', label: 'Spelers toevoegen' },
  { href: '/admin', label: 'Beheer (admin)' },
]

export function SiteHeader({ active = null }: { active?: NavSection }) {
  const [open, setOpen] = useState(false)

  return (
    <header className="sh">
      <div className="sh-inner">
        <Link href="/" className="sh-brand" title="Naar het overzicht">
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
              className={`sh-link sh-more-btn ${active === 'meer' ? 'on' : ''}`}
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
            >
              Meer ▾
            </button>
            {open && (
              <>
                <div className="sh-more-backdrop" onClick={() => setOpen(false)} />
                <div className="sh-more-menu">
                  {MORE.map((l) =>
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
              </>
            )}
          </div>
        </nav>
      </div>
    </header>
  )
}
