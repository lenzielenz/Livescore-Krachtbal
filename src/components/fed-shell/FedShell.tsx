'use client'

import { Bell, ChevronDown, ChevronRight, Eye, Globe, House, LogOut, Menu, Search, X } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { actiefItem, groepVan, inShell, navVoor, tellersPerItem } from '@/lib/federatie-nav'
import { uitloggen, zetKijkmodus } from '@/lib/sessie-client'
import { FedPalette } from './FedPalette'
import { FedShellProvider } from './context'
import { FedIcon } from './FedIcon'
import { SnelMenu } from './SnelMenu'
import './fed-shell.css'

// Het werkplatform voor de federatie: vaste zijbalk met alle tools in groepen, een topbalk met
// zoeken (Ctrl+K), meldingen en account, en daarnaast de pagina zelf. De pagina's blijven wat ze
// zijn; enkel hun kader verandert. Voor iedereen zonder federatierechten (en voor de clubluiken
// onder /beheer) doet dit niets: zie FedShellGate en inShell().

type Taak = { sleutel: string; href: string; aantal: number; dringend: 'rood' | 'oranje' | 'groen' }
type TakenStand = { taken: Taak[]; totaal: number; aanvragen?: { nieuw: number; bezig: number; wacht: number; open: number } | null }

const TAKEN_KEY = 'kb-fed-taken'
const GROEPEN_KEY = 'kb-fed-groepen'
const TAKEN_VERS_MS = 30_000

const initialen = (naam: string) =>
  naam
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || '?'

export function FedShell({ naam, rolLabel, isAdmin, children }: { naam: string; rolLabel: string; isAdmin: boolean; children: ReactNode }) {
  const pad = usePathname()
  // Een clubluik onder /beheer (coach, club-team): geen zijbalk, de pagina blijft zoals ze was.
  if (!inShell(pad)) return <>{children}</>
  return (
    <FedShellProvider value>
      <ShellBinnen naam={naam} rolLabel={rolLabel} isAdmin={isAdmin} pad={pad}>
        {children}
      </ShellBinnen>
    </FedShellProvider>
  )
}

function ShellBinnen({ naam, rolLabel, isAdmin, pad, children }: { naam: string; rolLabel: string; isAdmin: boolean; pad: string; children: ReactNode }) {
  const groepen = useMemo(() => navVoor({ isAdmin }), [isAdmin])
  const actief = useMemo(() => actiefItem(groepen, pad), [groepen, pad])
  const actieveGroep = groepVan(groepen, actief)

  const [menuOpen, setMenuOpen] = useState(false)
  const [paletOpen, setPaletOpen] = useState(false)
  const [stand, setStand] = useState<TakenStand | null>(null)
  const [ongelezen, setOngelezen] = useState(0)
  // Door de gebruiker (in)geklapte groepen; ontbreekt een groep, dan beslist `standaardOpen`.
  const [klap, setKlap] = useState<Record<string, boolean>>({})
  const gebruikersmenu = useRef<HTMLDetailsElement>(null)

  // Het bord krijgt als teller wat er NIEUW binnenkwam (nog niemand mee bezig): dat is wat aandacht vraagt.
  const tellers = useMemo(() => {
    if (!stand) return {}
    const t = tellersPerItem(groepen, stand.taken)
    if (stand.aanvragen?.nieuw) t.aanvragen = stand.aanvragen.nieuw
    return t
  }, [groepen, stand])
  const standaardOpen = (key: string, heeftTeller: boolean) => key === 'overzicht' || actieveGroep?.key === key || heeftTeller
  const isOpen = (g: { key: string; items: { key: string }[] }) => klap[g.key] ?? standaardOpen(g.key, g.items.some((i) => tellers[i.key]))

  // Eerder ingeklapte/uitgeklapte groepen terughalen (pas na het mounten: geen hydration-verschil).
  useEffect(() => {
    try {
      const bewaard = JSON.parse(localStorage.getItem(GROEPEN_KEY) ?? 'null') as Record<string, boolean> | null
      if (bewaard && typeof bewaard === 'object') setKlap(bewaard)
    } catch {
      /* geen opslag — gewoon de standaard */
    }
  }, [])
  const wissel = (key: string, nu: boolean) => {
    const volgende = { ...klap, [key]: !nu }
    setKlap(volgende)
    try {
      localStorage.setItem(GROEPEN_KEY, JSON.stringify(volgende))
    } catch {
      /* idem */
    }
  }

  // Open taken voor de tellers. Hoogstens om de 30 s opvragen: navigeren tussen tools hoeft de
  // databank niet telkens te raken, en de tellers zijn een wegwijzer, geen live bord.
  const laadTaken = useCallback((geforceerd = false) => {
    try {
      const c = JSON.parse(sessionStorage.getItem(TAKEN_KEY) ?? 'null') as { s: TakenStand; t: number } | null
      if (c && !geforceerd) {
        setStand(c.s)
        if (Date.now() - c.t < TAKEN_VERS_MS) return
      }
    } catch {
      /* geen opslag — gewoon opvragen */
    }
    fetch('/api/federatie/taken', { credentials: 'include' })
      .then((r) => (r.ok ? (r.json() as Promise<TakenStand>) : null))
      .then((s) => {
        if (!s) return
        setStand(s)
        try {
          sessionStorage.setItem(TAKEN_KEY, JSON.stringify({ s, t: Date.now() }))
        } catch {
          /* idem */
        }
      })
      .catch(() => {})
  }, [])
  useEffect(() => laadTaken(), [pad, laadTaken])

  // 🔔 Ongelezen meldingen: dezelfde teller (en dezelfde minuut-cache) als de gewone header.
  useEffect(() => {
    const KEY = 'kb-meldingen-telling'
    try {
      const c = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as { n: number; t: number } | null
      if (c && Date.now() - c.t < 60_000) {
        setOngelezen(c.n)
        return
      }
    } catch {
      /* geen opslag */
    }
    fetch('/api/meldingen?telling=1', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { ongelezen?: number } | null) => {
        const n = d?.ongelezen ?? 0
        setOngelezen(n)
        try {
          sessionStorage.setItem(KEY, JSON.stringify({ n, t: Date.now() }))
        } catch {
          /* idem */
        }
      })
      .catch(() => {})
  }, [])

  // Mobiel menu en gebruikersmenu sluiten bij navigatie.
  useEffect(() => {
    setMenuOpen(false)
    if (gebruikersmenu.current) gebruikersmenu.current.open = false
  }, [pad])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletOpen(true)
      } else if (e.key === 'Escape') {
        setMenuOpen(false)
      }
    }
    const buiten = (e: MouseEvent) => {
      const m = gebruikersmenu.current
      if (m?.open && !m.contains(e.target as Node)) m.open = false
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', buiten)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', buiten)
    }
  }, [])

  const totaal = stand?.totaal ?? 0

  return (
    <div className="fs">
      {menuOpen && <div className="fs-scrim" onClick={() => setMenuOpen(false)} aria-hidden />}
      <aside className={`fs-side ${menuOpen ? 'open' : ''}`} aria-label="Federatienavigatie">
        <div className="fs-side-kop">
          <Link href="/federatie" className="fs-merk" aria-label="Federatie — naar het dashboard">
            <span className="fs-merk-naam">
              Krachtbal <span className="brand">Live</span>
            </span>
            <span className="fs-merk-sub">Federatie</span>
          </Link>
          <button type="button" className="fs-icoonknop fs-alleen-mobiel" onClick={() => setMenuOpen(false)} aria-label="Menu sluiten">
            <X className="fs-icon" aria-hidden />
          </button>
        </div>

        <nav className="fs-nav">
          {groepen.map((g) => {
            const open = isOpen(g)
            const groepTeller = g.items.reduce((n, i) => n + (tellers[i.key] ?? 0), 0)
            // De kop van "Overzicht" (één item) is overbodig: het dashboard staat gewoon bovenaan.
            if (g.key === 'overzicht') {
              return (
                <ul key={g.key} className="fs-lijst fs-lijst-top">
                  {g.items.map((i) => (
                    <NavLink key={i.key} item={i} actief={actief?.key === i.key} teller={tellers[i.key]} />
                  ))}
                </ul>
              )
            }
            return (
              <section key={g.key} className="fs-groep">
                <button type="button" className="fs-groep-kop" aria-expanded={open} onClick={() => wissel(g.key, open)}>
                  {open ? <ChevronDown className="fs-chev" aria-hidden /> : <ChevronRight className="fs-chev" aria-hidden />}
                  <span>{g.titel}</span>
                  {!open && groepTeller > 0 && <span className="fs-teller fs-teller-klein">{groepTeller}</span>}
                </button>
                {open && (
                  <ul className="fs-lijst">
                    {g.items.map((i) => (
                      <NavLink key={i.key} item={i} actief={actief?.key === i.key} teller={tellers[i.key]} />
                    ))}
                  </ul>
                )}
              </section>
            )
          })}
        </nav>

        <div className="fs-side-voet">
          <span className="fs-avatar" aria-hidden>
            {initialen(naam)}
          </span>
          <span className="fs-wie">
            <strong>{naam}</strong>
            <small>{rolLabel}</small>
          </span>
        </div>
      </aside>

      <div className="fs-kolom">
        <header className="fs-top">
          <button type="button" className="fs-icoonknop fs-alleen-mobiel" onClick={() => setMenuOpen(true)} aria-label="Menu openen">
            <Menu className="fs-icon" aria-hidden />
          </button>

          <nav className="fs-kruimel" aria-label="Je bent hier">
            {actief && actieveGroep && actieveGroep.key !== 'overzicht' && (
              <>
                <span className="fs-kruimel-groep">{actieveGroep.titel}</span>
                <ChevronRight className="fs-chev" aria-hidden />
              </>
            )}
            <strong>{actief?.label ?? 'Federatie'}</strong>
          </nav>

          <button type="button" className="fs-zoek" onClick={() => setPaletOpen(true)} aria-label="Zoek een scherm (Ctrl+K)">
            <Search className="fs-icon" aria-hidden />
            <span>Zoek een scherm…</span>
            <span className="fs-sneltoets" aria-hidden>
              <kbd>Ctrl</kbd>
              <kbd>K</kbd>
            </span>
          </button>

          <div className="fs-top-rechts">
            <SnelMenu />
            {totaal > 0 && (
              <Link href="/federatie" className="fs-open-taken" title="Open taken op het dashboard">
                <span className="fs-teller">{totaal}</span>
                <span className="fs-open-taken-tekst">open</span>
              </Link>
            )}
            <Link href="/meldingen" className="fs-icoonknop fs-bel" aria-label={ongelezen ? `${ongelezen} nieuwe meldingen` : 'Meldingen'} title="Meldingen">
              <Bell className="fs-icon" aria-hidden />
              {ongelezen > 0 && <span className="fs-bel-n">{ongelezen > 9 ? '9+' : ongelezen}</span>}
            </Link>

            <details ref={gebruikersmenu} className="fs-gebruiker">
              <summary>
                <span className="fs-avatar" aria-hidden>
                  {initialen(naam)}
                </span>
                <span className="fs-wie fs-alleen-breed">
                  <strong>{naam}</strong>
                  <small>{rolLabel}</small>
                </span>
                <ChevronDown className="fs-chev fs-alleen-breed" aria-hidden />
              </summary>
              <div className="fs-gebruiker-menu">
                <Link href="/hub">
                  <House className="fs-icon" aria-hidden /> Mijn Krachtbal
                </Link>
                <Link href="/">
                  <Globe className="fs-icon" aria-hidden /> Naar de publieke site
                </Link>
                <button type="button" onClick={() => zetKijkmodus(true)}>
                  <Eye className="fs-icon" aria-hidden /> Bekijk als supporter
                </button>
                <button type="button" onClick={() => void uitloggen()}>
                  <LogOut className="fs-icon" aria-hidden /> Uitloggen
                </button>
              </div>
            </details>
          </div>
        </header>

        <div className="fs-main" id="fed-inhoud">
          {children}
        </div>
      </div>

      <FedPalette open={paletOpen} onClose={() => setPaletOpen(false)} groepen={groepen} />
    </div>
  )
}

function NavLink({ item, actief, teller }: { item: { key: string; label: string; hint: string; href: string; icon: Parameters<typeof FedIcon>[0]['naam'] }; actief: boolean; teller?: number }) {
  return (
    <li>
      <Link href={item.href} title={item.hint} aria-current={actief ? 'page' : undefined} className={`fs-link ${actief ? 'on' : ''}`}>
        <FedIcon naam={item.icon} />
        <span className="fs-link-tekst">{item.label}</span>
        {teller ? (
          <span className="fs-teller" aria-label={`${teller} open`}>
            {teller}
          </span>
        ) : null}
      </Link>
    </li>
  )
}
