'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { WeatherWidget } from '@/components/WeatherWidget'
import { canAnalyse as canAnalyseUser } from '@/lib/access'
import { KIJKMODUS_COOKIE } from '@/lib/kijkmodus'
import { clearNavAuth, readNavAuth, writeNavAuth } from '@/lib/nav-auth-cache'
import { PROFILES } from '@/lib/profiles'
import './site-header.css'

// Kijkmodus (beheerder bekijkt de site als vers lid): cookie zetten/wissen + herladen, zodat
// zowel de server-render als deze navigatie meteen de gestripte kijk tonen.
function kijkmodusCookieAan(): boolean {
  if (typeof document === 'undefined') return false
  return document.cookie.split(';').some((c) => c.trim() === `${KIJKMODUS_COOKIE}=1`)
}
function zetKijkmodus(aan: boolean) {
  document.cookie = aan
    ? `${KIJKMODUS_COOKIE}=1; path=/; max-age=${12 * 3600}`
    : `${KIJKMODUS_COOKIE}=; path=/; max-age=0`
  clearNavAuth()
  window.location.reload()
}

// Eén gedeelde navigatie. Supporters volgen wedstrijden (primair). Al de rest zit
// onder één opgekuist "Meer"-menu: ontdekken (tornooi, demo) en de drie
// profiel-instappunten. Klik je een profiel, dan vind je dáár de bijhorende tools.
// De `active`-prop markeert de huidige sectie.
export type NavSection = 'wedstrijden' | 'stand' | 'demo' | 'analyse' | 'training' | 'tornooi' | 'clubs' | 'scheidsrechters' | 'federatie' | null

const PRIMARY: { href: string; label: string; key: NavSection }[] = [
  { href: '/', label: 'Wedstrijden', key: 'wedstrijden' },
]

// Het menu is bewust in twee begrijpelijke blokken verdeeld, zodat een supporter meteen weet
// waar hij moet zijn: eerst álles rond wedstrijden volgen en meespelen, daarna het leesvoer.
// "Mijn Krachtbal" staat er los bovenaan als uitgelichte hoofdingang (enkel ingelogd).
const VOLGEN: { href: string; label: string }[] = [
  { href: '/rangschikking', label: '📊 Klassement' },
  { href: '/tornooi', label: '🏆 Tornooien' },
  { href: '/pronostiek', label: '🔮 Pronostiek' },
]

// Leesvoer en uitleg. Elk item een eigen icoon (geen twee keer 📰) zodat ze uit elkaar te
// houden zijn in één oogopslag. Kantinescherm/Ideeënbus/Zo werkt het staan hier bewust niet meer
// — die verhuisden naar de "Mijn Krachtbal"-pagina zelf (/hub) i.p.v. de menubalk.
const ONTDEKKEN: { href: string; label: string }[] = [
  { href: '/recap', label: '🗞️ Weekoverzicht' },
  { href: '/nieuws', label: '📣 Nieuws' },
  { href: '/erelijst', label: '🥇 Erelijst' },
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
  // Kijkmodus pas ná het mounten lezen (cookie bestaat niet op de server → geen hydration-mismatch).
  const [kijkmodus, setKijkmodus] = useState(false)
  useEffect(() => {
    setKijkmodus(kijkmodusCookieAan())
  }, [])
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
        const club = has('club-beheerder') || has('club-medewerker')
        const referee = has('scheidsrechter')
        // Dezelfde regel als canAnalyse in lib/access: admin, eigen analyse-toegang, of iemand
        // die zijn analyses met dit account deelt (anders vindt de gedeelde persoon het menu niet).
        const state = {
          loggedIn: Boolean(u),
          canAnalyse: canAnalyseUser(u),
          canTraining: fed || club || has('club-lid') || Boolean(u?.trainingAccess),
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
  // Kijkmodus: de navigatie toont wat een VERS lid ziet — alle rol-gebonden ingangen weg.
  // (De echte vlaggen blijven bewaard voor het menu-item en de exit-banner.)
  const zichtFlags = kijkmodus ? { isClub: false, isReferee: false, isFed: false } : roleFlags
  const zichtAnalyse = kijkmodus ? false : canAnalyse
  const zichtTraining = kijkmodus ? false : canTraining
  // Toon enkel de profiel-ingangen die bij je rol horen (supporter ziet er geen).
  const visibleProfiles = PROFILES.filter((p) => PROFILE_VISIBLE[p.key]?.(zichtFlags))

  return (
    <>
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
                  {/* Eén duidelijke hoofdingang bovenaan: je eigen startpagina. Ook zichtbaar
                      uitgelogd — /hub valt dan zelf terug op een "log in"-uitnodiging i.p.v. de
                      gepersonaliseerde inhoud, en ontsluit zo ook Kantinescherm/Ideeënbus/Zo werkt
                      het voor wie nog geen account heeft. */}
                  <div className="sh-more-group">
                    <Link href="/hub" className="sh-more-item sh-more-hoofd" onClick={() => setOpen(false)}>
                      🏠 Mijn Krachtbal
                    </Link>
                  </div>
                  <div className="sh-more-group">
                    <div className="sh-more-grouphead">Volgen &amp; meespelen</div>
                    {VOLGEN.map((l) => (
                      <Link key={l.href} href={l.href} className="sh-more-item" onClick={() => setOpen(false)}>
                        {l.label}
                      </Link>
                    ))}
                  </div>
                  <div className="sh-more-group">
                    <div className="sh-more-grouphead">Ontdekken</div>
                    {ONTDEKKEN.map((l) => (
                      <Link key={l.href} href={l.href} className="sh-more-item" onClick={() => setOpen(false)}>
                        {l.label}
                      </Link>
                    ))}
                  </div>
                  {/* Analyse en training staan apart als eigen "Coach"-luik. */}
                  {(zichtAnalyse || zichtTraining) && (
                    <div className="sh-more-group">
                      <div className="sh-more-grouphead">Coach</div>
                      {zichtAnalyse && (
                        <Link href="/analyse" className="sh-more-item" onClick={() => setOpen(false)}>
                          📈 Analyse
                        </Link>
                      )}
                      {zichtTraining && (
                        <Link href="/beheer/training" className="sh-more-item" onClick={() => setOpen(false)}>
                          🏋️ Training
                        </Link>
                      )}
                    </div>
                  )}
                  {/* "Aan de slag" (profiel-instappunten) enkel voor wie de bijhorende rol heeft —
                      een supporter (of uitgelogde bezoeker) krijgt deze tools niet te zien. */}
                  {/* De schermen staan open voor elke ingelogde supporter: je eigen kantinescherm
                      samenstellen en het veldscherm van je club op een tv zetten. Clubstaf en
                      federatie vinden ze al via "Mijn club", dus daar niet dubbel. */}
                  {loggedIn && !zichtFlags.isClub && !zichtFlags.isFed && (
                    <div className="sh-more-group">
                      <div className="sh-more-grouphead">Schermen</div>
                      <Link href="/kantine" className="sh-more-item" onClick={() => setOpen(false)}>
                        🍻 Kantinescherm
                      </Link>
                      <Link href="/club/veldscherm" className="sh-more-item" onClick={() => setOpen(false)}>
                        🏟️ Veldscherm
                      </Link>
                    </div>
                  )}
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
                        {/* Beheerder? Bekijk de site zoals een vers geregistreerd lid ze ziet.
                            Terugkeren gebeurt via de vaste banner onderaan (die blijft altijd
                            zichtbaar, ook al is dit menu-item in kijkmodus verborgen). */}
                        {roleFlags.isFed && !kijkmodus && (
                          <button type="button" className="sh-more-item" onClick={() => { setOpen(false); zetKijkmodus(true) }}>
                            👁 Bekijk als supporter
                          </button>
                        )}
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
    {/* Vaste kijkmodus-banner, BUITEN de header: de backdrop-filter van de header zou een
        fixed-element anders aan de header vastklinken i.p.v. aan de viewport. In kijkmodus zijn
        alle beheer-ingangen verborgen, dus de weg terug moet altijd zichtbaar blijven. */}
    {kijkmodus && (
      <div className="sh-kijkmodus" role="status">
        <span className="sh-kijkmodus-txt">👁 Je bekijkt de site als supporter — zo ziet een vers lid ze.</span>
        <button type="button" className="sh-kijkmodus-btn" onClick={() => zetKijkmodus(false)}>
          Terug naar beheer
        </button>
      </div>
    )}
    </>
  )
}
