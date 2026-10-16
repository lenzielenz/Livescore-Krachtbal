'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  getal,
  isDoelpunt,
  passenNetwerk,
  spelerLabel,
  thuisId as bepaalThuis,
  tijdLabel,
  uitkomstKleur,
  uitkomstLabel,
  type AppData,
  type AppSpeler,
  type AppWorp,
} from '@/lib/app-analyse-veld'

import { AnalyseDelen } from '../../AnalyseDelen'
import { AppDelen } from '../AppDelen'
import { AppVideoNotities, type Moment } from '../AppVideoNotities'
import { Balken, Staafjes } from './Grafieken'
import { Veld2D } from './Veld2D'
import './app-viewer.css'

const Arena3D = dynamic(() => import('./Arena3D'), {
  ssr: false,
  loading: () => <div className="a3d-laden">3D laden…</div>,
})

// De analyse uit de app, in stukken en interactief: overzicht met video en notities, de wedstrijd in
// 3D, het tactiekbord, spelers, worpen, passen, tactiek, het originele wedstrijdcentrum en delen.
// Alles komt uit wedstrijd_data.json van de app (via een ondertekende link geladen).

export interface AppBestandLink {
  naam: string
  url: string
  titel?: string
}

export interface AppViewerProps {
  matchId: number
  dataUrl: string
  videoUrl: string | null
  centrumUrl: string | null
  centrumHref: string
  bestanden: AppBestandLink[]
  coachtekst: string | null
  namen: { thuis: string; uit: string }
  kleuren: { thuis: string; uit: string }
  titel: string
  beheert: boolean
  deel?: string
}

type Tab = 'overzicht' | '3d' | 'veld' | 'spelers' | 'worpen' | 'passen' | 'tactiek' | 'origineel' | 'delen'

const TABS: [Tab, string][] = [
  ['overzicht', 'Overzicht'],
  ['3d', '3D'],
  ['veld', 'Veld'],
  ['spelers', 'Spelers'],
  ['worpen', 'Worpen'],
  ['passen', 'Passen'],
  ['tactiek', 'Tactiek'],
  ['origineel', 'Wedstrijdcentrum'],
  ['delen', 'Delen & bestanden'],
]

type Filter = { team: 'alle' | number; speler: string; type: 'alle' | 'nek' | 'rug'; uitkomst: 'alle' | 'goal' | 'caught' | 'grond' | 'out' }

function soortUitkomst(w: AppWorp): Filter['uitkomst'] {
  const u = w.uitkomst ?? ''
  if (isDoelpunt(w)) return 'goal'
  if (u === 'caught' || u === 'intercepted') return 'caught'
  if (u.startsWith('out') || u === 'buiten') return 'out'
  return 'grond'
}

export function AppViewer(props: AppViewerProps) {
  const { matchId, dataUrl, videoUrl, centrumUrl, centrumHref, bestanden, coachtekst, namen, kleuren, titel, beheert, deel } = props
  const [data, setData] = useState<AppData | null>(null)
  const [fout, setFout] = useState<string | null>(null)
  const [tab, setTabState] = useState<Tab>('overzicht')
  const [filter, setFilter] = useState<Filter>({ team: 'alle', speler: '', type: 'alle', uitkomst: 'alle' })
  const [gekozen, setGekozen] = useState<AppWorp | null>(null)
  const [spelerId, setSpelerId] = useState<string>('')
  const [videoZoek, setVideoZoek] = useState<{ t: number; n: number } | null>(null)
  const [veldLagen, setVeldLagen] = useState({ heat: true, worpen: true, vangsten: true, passen: false, netwerk: false })

  useEffect(() => {
    let weg = false
    fetch(dataUrl)
      .then((r) => {
        if (!r.ok) throw new Error(`De analyse kon niet geladen worden (${r.status}).`)
        return r.json()
      })
      .then((d: AppData) => !weg && setData(d))
      .catch((e: Error) => !weg && setFout(e.message))
    return () => {
      weg = true
    }
  }, [dataUrl])

  // Tabblad in de adresbalk (#3d, #spelers…), zodat terug-knop en delen werken.
  useEffect(() => {
    const lees = () => {
      const h = window.location.hash.replace('#', '') as Tab
      if (TABS.some(([k]) => k === h)) setTabState(h)
    }
    lees()
    window.addEventListener('hashchange', lees)
    return () => window.removeEventListener('hashchange', lees)
  }, [])
  const setTab = useCallback((t: Tab) => {
    setTabState(t)
    history.replaceState(null, '', `#${t}`)
    document.getElementById('appv-tabs')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const thuis = data ? bepaalThuis(data) : 0
  const spelers = useMemo(() => Object.values(data?.spelers ?? {}), [data])
  const spelerVan = useMemo(() => new Map(spelers.map((s) => [s.id, s])), [spelers])
  const naamVan = useCallback((id?: string | null) => (id ? spelerLabel(spelerVan.get(id), id) : '–'), [spelerVan])
  const ploegNaam = (team?: number) => (team === thuis ? namen.thuis : namen.uit)
  const kleurTeam = (team?: number) => (team === thuis ? kleuren.thuis : kleuren.uit)

  const alleWorpen = useMemo(() => [...(data?.worpen ?? [])].sort((a, b) => (a.tijd_s ?? 1e9) - (b.tijd_s ?? 1e9)), [data])
  const worpen = useMemo(
    () =>
      alleWorpen.filter(
        (w) =>
          (filter.team === 'alle' || w.team === filter.team) &&
          (!filter.speler || w.identiteit === filter.speler || w.vangerIdentiteit === filter.speler) &&
          (filter.type === 'alle' || w.type === filter.type) &&
          (filter.uitkomst === 'alle' || soortUitkomst(w) === filter.uitkomst),
      ),
    [alleWorpen, filter],
  )
  const heatSpelers = useMemo(() => {
    if (filter.speler) return [filter.speler]
    return spelers.filter((s) => filter.team === 'alle' || s.team === filter.team).map((s) => s.id)
  }, [spelers, filter])
  const passen = useMemo(
    () =>
      (data?.passen ?? []).filter(
        (p) =>
          (filter.team === 'alle' || p.team === filter.team) &&
          (!filter.speler || p.van === filter.speler || p.naar === filter.speler),
      ),
    [data, filter],
  )
  const netwerk = useMemo(() => {
    if (!data) return undefined
    const teams = filter.team === 'alle' ? [thuis, ...(data.ploegen ?? []).map((p) => p.id).filter((t) => t !== thuis)] : [filter.team]
    const knopen: { id: string; plek: { x: number; y: number }; label: string; team: number }[] = []
    const lijnen: { van: string; naar: string; n: number }[] = []
    for (const t of teams) {
      const n = passenNetwerk(data, t)
      knopen.push(...n.knopen.map((k) => ({ id: k.id, plek: k.plek, team: t, label: k.speler.rugnummer != null ? String(k.speler.rugnummer) : k.speler.naam.slice(0, 2) })))
      lijnen.push(...n.lijnen)
    }
    return { knopen, lijnen }
  }, [data, filter.team, thuis])

  const momenten: Moment[] = alleWorpen
    .filter((w) => w.tijd_s != null)
    .map((w) => ({
      tijdS: w.tijd_s as number,
      soort: isDoelpunt(w) ? 'goal' : 'worp',
      kant: w.team === thuis ? 'home' : 'away',
      label: `${naamVan(w.identiteit)} · ${uitkomstLabel(w.uitkomst)}${w.type ? ` (${w.type === 'rug' ? 'rugworp' : 'nekworp'})` : ''}`,
    }))

  const inVideo = (t?: number | null) => {
    if (t == null || !videoUrl) return
    setVideoZoek({ t, n: Date.now() })
    setTab('overzicht')
  }

  const kies = (w: AppWorp | null) => setGekozen((o) => (o === w ? null : w))

  if (fout) return <p className="appv-fout">{fout}</p>
  if (!data) return <div className="appx-laden"><span className="appx-spinner" /> De analyse laden…</div>

  const ploegen = data.ploegen ?? []
  const videos = bestanden.filter((b) => b.naam.endsWith('.mp4') && b.naam !== 'video.mp4')
  const bestand = (n: string) => bestanden.find((b) => b.naam === n)

  const filterBalk = (metSpeler = true) => (
    <div className="appx-filters">
      <div className="appx-seg" role="group" aria-label="Ploeg">
        <button type="button" className={filter.team === 'alle' ? 'aan' : ''} onClick={() => setFilter((f) => ({ ...f, team: 'alle', speler: '' }))}>Beide</button>
        {ploegen.map((p) => (
          <button key={p.id} type="button" className={filter.team === p.id ? 'aan' : ''} onClick={() => setFilter((f) => ({ ...f, team: p.id, speler: '' }))}>
            <i style={{ background: kleurTeam(p.id) }} /> {ploegNaam(p.id)}
          </button>
        ))}
      </div>
      {metSpeler && (
        <select value={filter.speler} onChange={(e) => setFilter((f) => ({ ...f, speler: e.target.value }))} aria-label="Speler">
          <option value="">Alle spelers</option>
          {spelers
            .filter((s) => filter.team === 'alle' || s.team === filter.team)
            .sort((a, b) => a.team - b.team || (a.rugnummer ?? 99) - (b.rugnummer ?? 99))
            .map((s) => (
              <option key={s.id} value={s.id}>{spelerLabel(s)}</option>
            ))}
        </select>
      )}
      <select value={filter.type} onChange={(e) => setFilter((f) => ({ ...f, type: e.target.value as Filter['type'] }))} aria-label="Worptype">
        <option value="alle">Nek- en rugworpen</option>
        <option value="nek">Nekworpen</option>
        <option value="rug">Rugworpen</option>
      </select>
      <select value={filter.uitkomst} onChange={(e) => setFilter((f) => ({ ...f, uitkomst: e.target.value as Filter['uitkomst'] }))} aria-label="Afloop">
        <option value="alle">Elke afloop</option>
        <option value="goal">Doelpunten</option>
        <option value="caught">Gevangen</option>
        <option value="grond">Op de grond</option>
        <option value="out">Buiten</option>
      </select>
    </div>
  )

  const legende = (
    <div className="appx-legende">
      {[['goal', 'Doelpunt'], ['caught', 'Gevangen'], ['grond', 'Op de grond'], ['out', 'Buiten']].map(([k, l]) => (
        <span key={k}><i style={{ background: uitkomstKleur(k) }} /> {l}</span>
      ))}
      <span>— rugworp · - - nekworp</span>
    </div>
  )

  const worpKaart = gekozen && (
    <div className="appx-worpkaart">
      <div>
        <b>{naamVan(gekozen.identiteit)}</b> · {gekozen.type === 'rug' ? 'rugworp' : 'nekworp'} ·{' '}
        <span style={{ color: uitkomstKleur(gekozen.uitkomst) }}>{uitkomstLabel(gekozen.uitkomst)}</span>
        {gekozen.punten ? ` · ${gekozen.punten} ptn` : ''}
      </div>
      <div className="appx-worpcijfers">
        <span>{tijdLabel(gekozen.tijd_s, true)}</span>
        <span>{getal(gekozen.afstand, 1, ' m')}</span>
        <span>{getal(gekozen.worpSnelheid != null ? gekozen.worpSnelheid * 3.6 : null, 0, ' km/u')}</span>
        <span>top {getal(gekozen.tophoogte, 1, ' m')}</span>
        <span>{getal(gekozen.vluchttijd, 2, ' s')} vlucht</span>
        {gekozen.vangerIdentiteit && <span>vanger {naamVan(gekozen.vangerIdentiteit)}</span>}
      </div>
      <div className="appx-worpacties">
        {videoUrl && gekozen.tijd_s != null && <button type="button" onClick={() => inVideo(gekozen.tijd_s)}>▶ In de video</button>}
        {tab !== '3d' && <button type="button" onClick={() => setTab('3d')}>In 3D</button>}
        {tab !== 'veld' && <button type="button" onClick={() => setTab('veld')}>Op het veld</button>}
        <button type="button" onClick={() => setGekozen(null)}>Sluiten</button>
      </div>
    </div>
  )

  const gekozenSpeler: AppSpeler | undefined = spelerId ? spelerVan.get(spelerId) : undefined

  return (
    <div className="appx">
      <nav className="appx-tabs" id="appv-tabs" aria-label="Onderdelen van de analyse">
        {TABS.filter(([k]) => (k === 'origineel' ? Boolean(centrumUrl) : true)).map(([k, l]) => (
          <button key={k} type="button" className={tab === k ? 'aan' : ''} onClick={() => setTab(k)} aria-current={tab === k}>
            {l}
          </button>
        ))}
      </nav>

      {tab === 'overzicht' && (
        <div className="appx-paneel">
          <div className="appa-kerncijfers">
            <div><b>{tijdLabel(data.duur_s)}</b><span>beeld</span></div>
            <div><b>{alleWorpen.length}</b><span>worpen</span></div>
            <div><b>{(data.passen ?? []).length}</b><span>passen</span></div>
            <div><b>{spelers.length}</b><span>spelers</span></div>
          </div>
          <section className="appa-blok" id="video">
            <h2 className="section-title">Video en notities</h2>
            <AppVideoNotities matchId={matchId} videoUrl={videoUrl} duurS={data.duur_s ?? null} momenten={momenten} deel={deel} zoek={videoZoek} />
          </section>
          <div className="appx-snel">
            <button type="button" onClick={() => setTab('3d')}><b>3D</b><span>De wedstrijd opnieuw, van elke kant</span></button>
            <button type="button" onClick={() => setTab('veld')}><b>Veld</b><span>Heatmaps, worpen en vangsten</span></button>
            <button type="button" onClick={() => setTab('spelers')}><b>Spelers</b><span>Elke speler apart</span></button>
            <button type="button" onClick={() => setTab('tactiek')}><b>Tactiek</b><span>Hoe beide ploegen spelen</span></button>
          </div>
          {videos.length > 0 && (
            <section className="appa-blok">
              <h2 className="section-title">Volgcamera en hoogtepunten</h2>
              <div className="appa-videos">
                {videos.map((b) => (
                  <figure key={b.naam} className="appa-video">
                    <video src={b.url} controls playsInline preload="metadata" />
                    <figcaption>{b.titel ?? b.naam}<a href={`${b.url}&download=1`} className="appa-bewaar">Bewaren</a></figcaption>
                  </figure>
                ))}
              </div>
            </section>
          )}
          {(coachtekst || bestand('samenvatting.png')) && (
            <section className="appa-blok">
              <h2 className="section-title">Samenvatting</h2>
              {coachtekst && <p className="appa-coach">{coachtekst}</p>}
              {bestand('samenvatting.png') && (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="appa-beeld" src={bestand('samenvatting.png')!.url} alt="Samenvatting van de wedstrijd" loading="lazy" />
              )}
            </section>
          )}
        </div>
      )}

      {tab === '3d' && (
        <div className="appx-paneel">
          {filterBalk()}
          <Arena3D data={data} kleuren={kleuren} worpen={worpen} heatSpelers={heatSpelers} gekozen={gekozen} onKies={(w) => setGekozen(w)} naamVan={naamVan} />
          {legende}
          <p className="appa-uitleg">Sleep om te draaien, scroll of knijp om te zoomen, rechtermuisknop of twee vingers om te verschuiven. Tik op een boog voor de details; de herhaling springt dan naar die worp.</p>
          {worpKaart}
        </div>
      )}

      {tab === 'veld' && (
        <div className="appx-paneel">
          {filterBalk()}
          <div className="appx-lagen">
            {(
              [
                ['heat', 'Heatmap'],
                ['worpen', 'Worpen'],
                ['vangsten', 'Vangsten'],
                ['passen', 'Passen'],
                ['netwerk', 'Passennetwerk'],
              ] as [keyof typeof veldLagen, string][]
            ).map(([k, l]) => (
              <label key={k} className={veldLagen[k] ? 'aan' : ''}>
                <input type="checkbox" checked={veldLagen[k]} onChange={(e) => setVeldLagen((o) => ({ ...o, [k]: e.target.checked }))} /> {l}
              </label>
            ))}
          </div>
          <Veld2D
            data={data}
            kleuren={kleuren}
            lagen={veldLagen}
            heatSpelers={heatSpelers}
            worpen={worpen}
            passen={passen}
            netwerk={netwerk}
            gekozen={gekozen}
            onKies={kies}
            naamVan={naamVan}
          />
          {legende}
          {worpKaart}
        </div>
      )}

      {tab === 'spelers' && (
        <div className="appx-paneel">
          <div className="appx-spelersraster">
            {[...spelers]
              .sort((a, b) => (a.team === b.team ? (a.rugnummer ?? 99) - (b.rugnummer ?? 99) : a.team === thuis ? -1 : 1))
              .map((s) => (
                <button key={s.id} type="button" className={`appx-spelerkaart${spelerId === s.id ? ' aan' : ''}`} style={{ ['--ploeg' as string]: kleurTeam(s.team) }} onClick={() => setSpelerId(spelerId === s.id ? '' : s.id)}>
                  <span className="appx-nr">{s.rugnummer ?? '–'}</span>
                  <span className="appx-naam">{s.naam}<small>{s.rolnaam ?? ploegNaam(s.team)}</small></span>
                  <span className="appx-mini">
                    <b>{getal(s.fysiek?.afstand_m, 0, ' m')}</b>
                    <small>{s.stats?.worpen ?? 0} worpen · {s.stats?.vangsten ?? 0} vangsten</small>
                  </span>
                </button>
              ))}
          </div>
          {gekozenSpeler ? (
            <SpelerDetail
              sp={gekozenSpeler}
              data={data}
              kleuren={kleuren}
              kleur={kleurTeam(gekozenSpeler.team)}
              ploeg={ploegNaam(gekozenSpeler.team)}
              naamVan={naamVan}
              gekozen={gekozen}
              onKies={kies}
              inVideo={videoUrl ? inVideo : undefined}
            />
          ) : (
            <p className="appa-uitleg">Kies een speler voor zijn heatmap, waar hij werpt en vangt, zijn passen en zijn loopwerk.</p>
          )}
        </div>
      )}

      {tab === 'worpen' && (
        <div className="appx-paneel">
          {filterBalk()}
          <div className="appx-tweeluik">
            <Veld2D data={data} kleuren={kleuren} lagen={{ worpen: true, vangsten: true }} heatSpelers={[]} worpen={worpen} gekozen={gekozen} onKies={kies} naamVan={naamVan} hoogte="auto" />
            <ul className="appx-worpen">
              {worpen.map((w, i) => (
                <li key={i}>
                  <button type="button" className={gekozen === w ? 'aan' : ''} onClick={() => kies(w)} style={{ ['--ploeg' as string]: kleurTeam(w.team) }}>
                    <span className="appx-tijd">{tijdLabel(w.tijd_s, true)}</span>
                    <span className="appx-wie">{naamVan(w.identiteit)}<small>{w.type === 'rug' ? 'Rugworp' : 'Nekworp'} · {getal(w.afstand, 1, ' m')}</small></span>
                    <span className="appx-afloop" style={{ color: uitkomstKleur(w.uitkomst) }}>{uitkomstLabel(w.uitkomst)}{w.punten ? ` +${w.punten}` : ''}</span>
                  </button>
                </li>
              ))}
              {worpen.length === 0 && <li className="appa-uitleg">Geen worpen met deze filter.</li>}
            </ul>
          </div>
          {worpKaart}
        </div>
      )}

      {tab === 'passen' && (
        <div className="appx-paneel">
          {filterBalk()}
          <Veld2D data={data} kleuren={kleuren} lagen={{ netwerk: true, passen: true }} heatSpelers={[]} worpen={[]} passen={passen} netwerk={netwerk} naamVan={naamVan} />
          <p className="appa-uitleg">Elke cirkel staat op de gemiddelde plaats van de speler; hoe dikker de lijn, hoe meer passen ertussen.</p>
          <ul className="appa-lijst">
            {passen.map((p, i) => (
              <li key={i} className={`side-${p.team === thuis ? 'home' : 'away'}`}>
                <span className="appa-tijd">{tijdLabel(p.tijd_s, true)}</span> {naamVan(p.van)} → {naamVan(p.naar)}
                {p.afstand != null ? ` · ${getal(p.afstand, 1, ' m')}` : ''}
                {p.betrouwbaar === false ? ' · onzeker' : ''}
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === 'tactiek' && (
        <div className="appx-paneel">
          <div className="appa-tactiek">
            {ploegen.map((p) => {
              const t = data.tactiek?.[String(p.id)]
              const w = t?.werpen ?? {}
              const xg = data.verwachte_goals?.per_team?.[String(p.id)]
              const dk = data.dekking_samenvatting?.[String(p.id)]
              return (
                <div key={p.id} className="appa-kaart" style={{ borderTop: `3px solid ${kleurTeam(p.id)}` }}>
                  <h3>{ploegNaam(p.id)} <small className="an-chart-hint">{w.n ?? 0} worpen · gem. {getal(w.afstand_gem, 1, ' m')}</small></h3>
                  <Balken titel="Worptype" verdeling={w.type} kleur={kleurTeam(p.id)} />
                  <Balken titel="Afstand" verdeling={w.afstand_klassen} kleur={kleurTeam(p.id)} />
                  <Balken titel="Boog" verdeling={w.boog} kleur={kleurTeam(p.id)} />
                  <Balken titel="Richting" verdeling={w.richting} kleur={kleurTeam(p.id)} />
                  <Balken titel="Afloop" verdeling={w.uitkomst} kleur={kleurTeam(p.id)} />
                  <Balken titel="Zones" verdeling={w.zones} kleur={kleurTeam(p.id)} />
                  {xg && <p className="appx-feit">Verwachte goals <b>{getal(xg.verwacht, 1)}</b> · gescoord {xg.goals ?? 0} uit {xg.n ?? 0}</p>}
                  {dk && <p className="appx-feit">Dekking bij doelpogingen: {dk.n ?? 0} · open {dk.open ?? 0} · gedekt {dk.gedekt ?? 0} · onzeker {dk.onzeker ?? 0}</p>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {tab === 'origineel' && centrumUrl && (
        <div className="appx-paneel">
          <div className="appa-kop">
            <p className="appa-uitleg">Het wedstrijdcentrum precies zoals de app het toont: veld, elke speler, elke actie in beeld, dekking, coach, tactiek en afspelen.</p>
            <a className="appa-knop vol" href={centrumHref}>Schermvullend ↗</a>
          </div>
          <iframe className="appx-centrum" src={centrumUrl} title="Wedstrijdcentrum" sandbox="allow-scripts allow-popups allow-downloads allow-modals" />
        </div>
      )}

      {tab === 'delen' && (
        <div className="appx-paneel">
          {beheert && (
            <section className="appa-blok">
              <h2 className="section-title">Deellink</h2>
              <AppDelen matchId={matchId} titel={titel} />
            </section>
          )}
          {beheert && !deel && (
            <section className="appa-blok">
              <h2 className="section-title">Met accounts delen</h2>
              <AnalyseDelen />
            </section>
          )}
          <section className="appa-blok">
            <h2 className="section-title">Bestanden</h2>
            <ul className="appa-downloads">
              {bestanden
                .filter((b) => !b.naam.endsWith('.mp4') || b.naam === 'video.mp4')
                .map((b) => (
                  <li key={b.naam}><a href={`${b.url}&download=1`}>{b.titel ?? b.naam}</a></li>
                ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  )
}

function SpelerDetail({
  sp,
  data,
  kleuren,
  kleur,
  ploeg,
  naamVan,
  gekozen,
  onKies,
  inVideo,
}: {
  sp: AppSpeler
  data: AppData
  kleuren: { thuis: string; uit: string }
  kleur: string
  ploeg: string
  naamVan: (id?: string | null) => string
  gekozen: AppWorp | null
  onKies: (w: AppWorp) => void
  inVideo?: (t?: number | null) => void
}) {
  const worpen = (data.worpen ?? []).filter((w) => w.identiteit === sp.id)
  const vangsten = (data.worpen ?? []).filter((w) => w.vangerIdentiteit === sp.id)
  const passenVan = Object.entries(sp.passen_naar ?? {}).sort((a, b) => b[1] - a[1])
  const passenNaar = Object.entries(sp.passen_van ?? {}).sort((a, b) => b[1] - a[1])
  const [lagen, setLagen] = useState({ heat: true, worpen: true, vangsten: true })
  const f = sp.fysiek ?? {}
  const st = sp.stats ?? {}
  const richtingen = st.werprichtingen ?? {}
  const looprichting = {
    vooruit: { n: 0, pct: f.pct_vooruit ?? 0 },
    achteruit: { n: 0, pct: f.pct_achteruit ?? 0 },
    zijwaarts: { n: 0, pct: f.pct_zijwaarts ?? 0 },
    stilstand: { n: 0, pct: f.pct_stilstand ?? 0 },
  }
  return (
    <section className="appx-speler" style={{ ['--ploeg' as string]: kleur }}>
      <header>
        <span className="appx-nr groot">{sp.rugnummer ?? '–'}</span>
        <div>
          <h2>{sp.naam}</h2>
          <p>{sp.rolnaam ?? ''}{sp.rolnaam ? ' · ' : ''}{ploeg}</p>
        </div>
      </header>
      <div className="appx-cijfers">
        <div><b>{getal(f.afstand_m, 0, ' m')}</b><span>gelopen</span></div>
        <div><b>{getal(f.max_snelheid_ms != null ? f.max_snelheid_ms * 3.6 : null, 1)}</b><span>km/u top</span></div>
        <div><b>{f.n_sprints ?? '–'}</b><span>sprints</span></div>
        <div><b>{st.worpen ?? 0}</b><span>worpen</span></div>
        <div><b>{st.punten ?? 0}</b><span>punten</span></div>
        <div><b>{st.vangsten ?? 0}</b><span>vangsten</span></div>
        <div><b>{st.passen_gegeven ?? 0}/{st.passen_ontvangen ?? 0}</b><span>passen g/o</span></div>
        <div><b>{tijdLabel(f.zichtbaar_s)}</b><span>in beeld</span></div>
      </div>
      <div className="appx-lagen">
        {(
          [
            ['heat', 'Heatmap'],
            ['worpen', 'Zijn worpen'],
            ['vangsten', 'Zijn vangsten'],
          ] as [keyof typeof lagen, string][]
        ).map(([k, l]) => (
          <label key={k} className={lagen[k] ? 'aan' : ''}>
            <input type="checkbox" checked={lagen[k]} onChange={(e) => setLagen((o) => ({ ...o, [k]: e.target.checked }))} /> {l}
          </label>
        ))}
      </div>
      <Veld2D
        data={data}
        kleuren={kleuren}
        lagen={{ heat: lagen.heat, worpen: lagen.worpen || lagen.vangsten, vangsten: lagen.vangsten }}
        heatSpelers={[sp.id]}
        worpen={[...(lagen.worpen ? worpen : []), ...(lagen.vangsten ? vangsten.filter((w) => !worpen.includes(w)) : [])]}
        gekozen={gekozen}
        onKies={onKies}
        naamVan={naamVan}
      />
      <div className="appx-grafieken">
        <Staafjes titel="Afstand per minuut (m)" waarden={sp.afstand_per_minuut ?? []} kleur={kleur} />
        <Staafjes titel="Gemiddelde snelheid per minuut (km/u)" waarden={sp.snelheid_per_minuut ?? []} kleur={kleur} />
        <Balken titel="Looprichting" verdeling={looprichting} kleur={kleur} />
        <Balken
          titel="Werprichting"
          verdeling={Object.fromEntries(
            Object.entries(richtingen).map(([k, n]) => [k, { n: Number(n), pct: (100 * Number(n)) / Math.max(1, st.worpen ?? 1) }]),
          )}
          kleur={kleur}
        />
      </div>
      <div className="appx-tweekolom">
        <div>
          <h3>Worpen</h3>
          <ul className="appx-worpen">
            {worpen.map((w, i) => (
              <li key={i}>
                <button type="button" className={gekozen === w ? 'aan' : ''} onClick={() => onKies(w)}>
                  <span className="appx-tijd">{tijdLabel(w.tijd_s, true)}</span>
                  <span className="appx-wie">{w.type === 'rug' ? 'Rugworp' : 'Nekworp'}<small>{getal(w.afstand, 1, ' m')} · {getal(w.worpSnelheid != null ? w.worpSnelheid * 3.6 : null, 0, ' km/u')}</small></span>
                  <span className="appx-afloop" style={{ color: uitkomstKleur(w.uitkomst) }}>{uitkomstLabel(w.uitkomst)}</span>
                </button>
                {inVideo && w.tijd_s != null && <button type="button" className="appx-play" onClick={() => inVideo(w.tijd_s)} aria-label="In de video">▶</button>}
              </li>
            ))}
            {worpen.length === 0 && <li className="appa-uitleg">Geen worpen.</li>}
          </ul>
        </div>
        <div>
          <h3>Passen</h3>
          <ul className="appa-lijst">
            {passenVan.map(([id, n]) => <li key={`v${id}`}>naar {naamVan(id)} · {n}×</li>)}
            {passenNaar.map(([id, n]) => <li key={`n${id}`}>van {naamVan(id)} · {n}×</li>)}
            {passenVan.length + passenNaar.length === 0 && <li className="appa-uitleg">Geen passen.</li>}
          </ul>
          <h3>Vangsten</h3>
          <ul className="appa-lijst">
            {vangsten.map((w, i) => <li key={i}>{tijdLabel(w.tijd_s, true)} · van {naamVan(w.identiteit)}</li>)}
            {vangsten.length === 0 && <li className="appa-uitleg">Geen vangsten.</li>}
          </ul>
        </div>
      </div>
    </section>
  )
}
