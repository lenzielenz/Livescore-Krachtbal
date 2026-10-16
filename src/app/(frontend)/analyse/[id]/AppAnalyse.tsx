import Link from 'next/link'

import { ondertekendeUrl, type AppManifest } from '@/lib/app-analyse'

import { AppDelen } from './AppDelen'
import { AppVideoNotities, type Moment } from './AppVideoNotities'
import './app-analyse.css'

// De analysepagina van een wedstrijd die door de krachtbal-analyse-app verwerkt is. Alles komt uit
// het pakket dat de app uploadde (src/lib/app-analyse.ts): de meetdata zelf (wedstrijd_data.json)
// voor de tabellen hieronder, en de bestanden die de app maakte — haar interactieve
// wedstrijdcentrum, de video's, de samenvatting, het veldbeeld en de downloads. Niets hiervan wordt
// op de site herberekend; dit is wat de app zag.

type XY = { x: number; y: number } | null

export interface AppWorp {
  possessionId?: string
  worpnummer?: number
  team?: number
  type?: string | null
  uitkomst?: string | null
  punten?: number | null
  afstand?: number | null
  worpSnelheid?: number | null
  vluchttijd?: number | null
  tophoogte?: number | null
  richting?: string | null
  zekerheid?: number | null
  tijd_s?: number | null
  identiteit?: string | null
  vangerIdentiteit?: string | null
  rugnummer?: number | null
  opzetplaats?: XY
  landingspunt?: XY
}

export interface AppSpeler {
  id: string
  naam: string
  rugnummer?: number | null
  team: number
  rolnaam?: string | null
  stats?: {
    worpen?: number
    punten?: number
    goals?: number
    vangsten?: number
    nek?: number
    rug?: number
    onderschept?: number
    buiten?: number
    passen_gegeven?: number
    passen_ontvangen?: number
    gem_worpafstand?: number | null
    max_worpsnelheid?: number | null
  }
  fysiek?: {
    afstand_m?: number | null
    max_snelheid_ms?: number | null
    n_sprints?: number | null
    zichtbaar_s?: number | null
    afstand_per_min?: number | null
    gem_snelheid_kmu?: number | null
  } | null
}

export interface AppPas {
  van?: string
  naar?: string
  team?: number
  tijd_s?: number | null
  afstand?: number | null
  soort?: string | null
  betrouwbaar?: boolean
}

export interface AppData {
  wedstrijd?: string
  duur_s?: number
  kalibratie_rms?: number | null
  ploegen?: { id: number; naam: string; thuis?: boolean }[]
  spelers?: Record<string, AppSpeler>
  worpen?: AppWorp[]
  passen?: AppPas[]
  verwachte_goals?: { per_team?: Record<string, { n?: number; verwacht?: number; goals?: number }> }
  dekking_samenvatting?: Record<string, { n?: number; open?: number; gedekt?: number; onzeker?: number; goals_toegestaan?: number }>
  tactiek?: Record<
    string,
    {
      naam?: string
      werpen?: {
        n?: number
        type?: Record<string, { n: number; pct: number }>
        afstand_gem?: number | null
        richting?: Record<string, { n: number; pct: number }>
        uitkomst?: Record<string, { n: number; pct: number }>
      }
    }
  >
}

const UITKOMST: Record<string, string> = {
  goal: 'Doelpunt',
  own_goal: 'Eigen doelpunt',
  caught: 'Gevangen',
  intercepted: 'Onderschept',
  out_side: 'Buiten (zijlijn)',
  out_back: 'Buiten (achterlijn)',
  out: 'Buiten',
  grond: 'Op de grond',
  buiten: 'Buiten',
}

const tijd = (s?: number | null) => {
  if (s == null || !Number.isFinite(s)) return '–'
  const m = Math.floor(s / 60)
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`
}
const getal = (v?: number | null, d = 1, eenheid = '') =>
  v == null || !Number.isFinite(v) ? '–' : `${v.toFixed(d).replace('.', ',')}${eenheid}`
const pct = (v?: number | null) => (v == null || !Number.isFinite(v) ? '–' : `${Math.round(v)} %`)

/** Score per kant volgens de app: de punten van haar worpen. */
export function appScore(data: AppData): { thuis: number; uit: number } {
  const thuisId = data.ploegen?.find((p) => p.thuis)?.id ?? 0
  let thuis = 0
  let uit = 0
  for (const w of data.worpen ?? []) {
    const p = Number(w.punten ?? 0)
    if (!p) continue
    if (w.team === thuisId) thuis += p
    else uit += p
  }
  return { thuis, uit }
}

const VIDEO_TITELS: [RegExp, string][] = [
  [/^video\.mp4$/, 'De wedstrijdvideo'],
  [/^volgcamera_alles\.mp4$/, 'Volgcamera · de hele wedstrijd'],
  [/^volgcamera_ploeg_(\d+)\.mp4$/, 'Volgcamera · ploeg'],
  [/^volgcamera_speler_.*\.mp4$/, 'Volgcamera · speler'],
  [/^clip_.*\.mp4$/, 'Doelpuntclip'],
]

function videoTitel(naam: string, titel?: string): string {
  if (titel) return titel
  for (const [re, t] of VIDEO_TITELS) if (re.test(naam)) return t
  return naam
}

const DOWNLOADS: [string, string][] = [
  ['samenvatting.pdf', 'Samenvatting (PDF)'],
  ['spelers.csv', 'Spelers (CSV, voor Excel)'],
  ['wedstrijd_data.json', 'Alle meetdata (JSON)'],
  ['analyse.json', 'Analyse en inzichten (JSON)'],
  ['wereldmodel.json', 'Wereldmodel (JSON)'],
  ['wedstrijdcentrum.html', 'Wedstrijdcentrum (los bestand)'],
  ['coachanalyse.html', 'Coachanalyse (los bestand)'],
]


export interface AppAnalyseProps {
  matchId: number
  manifest: AppManifest
  data: AppData | null
  coachtekst: string | null
  namen: { thuis: string; uit: string }
  /** Waar het schermvullende wedstrijdcentrum staat (eigen pagina of deelpagina). */
  centrumHref: string
  /** Mag deze kijker de analyse delen (eigenaar)? */
  beheert: boolean
  /** Deellink-token als de kijker via een deellink binnenkwam. */
  deel?: string
  titel: string
}

export function AppAnalyse({ matchId, manifest, data, coachtekst, namen, centrumHref, beheert, deel, titel }: AppAnalyseProps) {
  const heeft = new Set(manifest.bestanden.map((b) => b.naam))
  const url = (naam: string) => ondertekendeUrl(matchId, naam)
  const titelVan = new Map(manifest.bestanden.map((b) => [b.naam, b.titel]))
  const thuisId = data?.ploegen?.find((p) => p.thuis)?.id ?? 0
  const kant = (team?: number): 'home' | 'away' => (team === thuisId ? 'home' : 'away')
  const ploegNaam = (team?: number) => (team === thuisId ? namen.thuis : namen.uit)
  const spelers = Object.values(data?.spelers ?? {})
  const spelerVan = new Map(spelers.map((s) => [s.id, s]))
  const wie = (id?: string | null) => {
    if (!id) return '–'
    const s = spelerVan.get(id)
    if (!s) return id
    return `${s.rugnummer != null ? `#${s.rugnummer} ` : ''}${s.naam}`
  }
  const worpen = [...(data?.worpen ?? [])].sort((a, b) => (a.tijd_s ?? 1e9) - (b.tijd_s ?? 1e9))
  const passen = [...(data?.passen ?? [])].sort((a, b) => (a.tijd_s ?? 1e9) - (b.tijd_s ?? 1e9))
  const videos = manifest.bestanden.filter((b) => b.naam.endsWith('.mp4') && b.naam !== 'video.mp4')
  const gemaakt = manifest.gemaakt ? new Date(manifest.gemaakt) : null
  const momenten: Moment[] = worpen
    .filter((w) => w.tijd_s != null && Number.isFinite(w.tijd_s))
    .map((w) => ({
      tijdS: w.tijd_s as number,
      soort: Number(w.punten ?? 0) > 0 ? 'goal' : 'worp',
      kant: kant(w.team),
      label: `${wie(w.identiteit)} · ${UITKOMST[w.uitkomst ?? ''] ?? 'worp'}${w.type ? ` (${w.type === 'rug' ? 'rugworp' : 'nekworp'})` : ''}`,
    }))

  return (
    <div className="appa">
      <nav className="appa-sprong" aria-label="Snel naar">
        <a href="#video">Video</a>
        <a href="#notities">Notities</a>
        {heeft.has('wedstrijdcentrum.html') && <a href="#wedstrijdcentrum">Wedstrijdcentrum</a>}
        <a href="#statistieken">Statistieken</a>
        {beheert && <a href="#delen">Delen</a>}
        <a href="#downloads">Downloads</a>
      </nav>

      {data && (
        <div className="appa-kerncijfers">
          <div><b>{tijd(data.duur_s)}</b><span>beeld</span></div>
          <div><b>{worpen.length}</b><span>worpen</span></div>
          <div><b>{passen.length}</b><span>passen</span></div>
          <div><b>{spelers.length}</b><span>spelers</span></div>
        </div>
      )}

      {heeft.has('wedstrijdcentrum.html') && (
        <section className="appa-blok appa-centrumkaart" id="wedstrijdcentrum">
          <div className="appa-kop">
            <div>
              <h2 className="section-title">Wedstrijdcentrum</h2>
              <p className="appa-uitleg">
                De volledige analyse uit de app: het veld, elke speler, elke actie in beeld, dekking, coach, tactiek en
                de wedstrijd opnieuw afspelen.
              </p>
            </div>
            <Link className="appa-knop vol groot" href={centrumHref}>
              Openen ↗
            </Link>
          </div>
          <iframe
            className="appa-centrum"
            src={url('wedstrijdcentrum.html')}
            title="Wedstrijdcentrum"
            sandbox="allow-scripts allow-popups allow-downloads allow-modals"
            loading="lazy"
          />
        </section>
      )}

      <section className="appa-blok" id="video">
        <h2 className="section-title">Video en notities</h2>
        <AppVideoNotities
          matchId={matchId}
          videoUrl={heeft.has('video.mp4') ? url('video.mp4') : null}
          duurS={data?.duur_s ?? null}
          momenten={momenten}
          deel={deel}
        />
      </section>

      {videos.length > 0 && (
        <section className="appa-blok" id="beelden">
          <h2 className="section-title">Volgcamera en hoogtepunten</h2>
          <div className="appa-videos">
            {videos.map((b) => (
              <figure key={b.naam} className="appa-video">
                <video src={url(b.naam)} controls playsInline preload="metadata" />
                <figcaption>
                  {videoTitel(b.naam, titelVan.get(b.naam))}
                  <a href={`${url(b.naam)}&download=1`} className="appa-bewaar">Bewaren</a>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      {(heeft.has('samenvatting.png') || coachtekst) && (
        <section className="appa-blok" id="samenvatting">
          <h2 className="section-title">Samenvatting</h2>
          {coachtekst && <p className="appa-coach">{coachtekst}</p>}
          {heeft.has('samenvatting.png') && (
            <a href={heeft.has('samenvatting.pdf') ? url('samenvatting.pdf') : url('samenvatting.png')} target="_blank" rel="noopener">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="appa-beeld" src={url('samenvatting.png')} alt="Samenvatting van de wedstrijd" loading="lazy" />
            </a>
          )}
        </section>
      )}

      {heeft.has('veldbeeld.png') && (
        <section className="appa-blok" id="veldbeeld">
          <h2 className="section-title">Veldbeeld</h2>
          <a href={url('veldbeeld.png')} target="_blank" rel="noopener">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="appa-beeld" src={url('veldbeeld.png')} alt="Veldbeeld: posities, worpen en landingen" loading="lazy" />
          </a>
        </section>
      )}

      <div id="statistieken" />
      {worpen.length > 0 && (
        <section className="appa-blok" id="worpen">
          <h2 className="section-title">Worpen <span className="an-chart-hint">{worpen.length}</span></h2>
          <div className="appa-tabelwrap">
            <table className="appa-tabel">
              <thead>
                <tr>
                  <th>Tijd</th><th>Werper</th><th>Type</th><th>Uitkomst</th><th>Ptn</th><th>Afstand</th><th>Snelheid</th>
                  <th>Vlucht</th><th>Top</th><th>Richting</th><th>Vanger</th><th>Zeker</th><th>Ploeg</th>
                </tr>
              </thead>
              <tbody>
                {worpen.map((w, i) => (
                  <tr key={`${w.possessionId}-${w.worpnummer}-${i}`} className={`side-${kant(w.team)}`}>
                    <td>{tijd(w.tijd_s)}</td>
                    <td className="appa-naam">{wie(w.identiteit)}</td>
                    <td>{w.type === 'rug' ? 'Rug' : w.type === 'nek' ? 'Nek' : '–'}</td>
                    <td>{UITKOMST[w.uitkomst ?? ''] ?? w.uitkomst ?? '–'}</td>
                    <td>{w.punten ? w.punten : ''}</td>
                    <td>{getal(w.afstand, 1, ' m')}</td>
                    <td>{getal(w.worpSnelheid != null ? w.worpSnelheid * 3.6 : null, 0, ' km/u')}</td>
                    <td>{getal(w.vluchttijd, 2, ' s')}</td>
                    <td>{getal(w.tophoogte, 1, ' m')}</td>
                    <td>{w.richting ?? '–'}</td>
                    <td className="appa-naam">{wie(w.vangerIdentiteit)}</td>
                    <td>{w.zekerheid != null ? pct(w.zekerheid * 100) : '–'}</td>
                    <td>{ploegNaam(w.team)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {spelers.length > 0 && (
        <section className="appa-blok" id="spelers">
          <h2 className="section-title">Spelers</h2>
          <div className="appa-tabelwrap">
            <table className="appa-tabel">
              <thead>
                <tr>
                  <th>Speler</th><th>Rol</th><th>Worpen</th><th>Ptn</th><th>Vangsten</th><th>Passen</th><th>Afstand</th>
                  <th>Per min</th><th>Topsnelheid</th><th>Sprints</th><th>In beeld</th><th>Ploeg</th>
                </tr>
              </thead>
              <tbody>
                {[...spelers]
                  .sort((a, b) => (a.team === b.team ? (a.rugnummer ?? 999) - (b.rugnummer ?? 999) : a.team === thuisId ? -1 : 1))
                  .map((s) => (
                    <tr key={s.id} className={`side-${kant(s.team)}`}>
                      <td className="appa-naam">{wie(s.id)}</td>
                      <td>{s.rolnaam ?? '–'}</td>
                      <td>{s.stats?.worpen ?? 0}{s.stats?.worpen ? ` (${s.stats?.nek ?? 0}n/${s.stats?.rug ?? 0}r)` : ''}</td>
                      <td>{s.stats?.punten || ''}</td>
                      <td>{s.stats?.vangsten ?? 0}</td>
                      <td>{s.stats?.passen_gegeven ?? 0}/{s.stats?.passen_ontvangen ?? 0}</td>
                      <td>{getal(s.fysiek?.afstand_m, 0, ' m')}</td>
                      <td>{getal(s.fysiek?.afstand_per_min, 0, ' m')}</td>
                      <td>{getal(s.fysiek?.max_snelheid_ms != null ? s.fysiek.max_snelheid_ms * 3.6 : null, 1, ' km/u')}</td>
                      <td>{s.fysiek?.n_sprints ?? '–'}</td>
                      <td>{tijd(s.fysiek?.zichtbaar_s)}</td>
                      <td>{ploegNaam(s.team)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <p className="appa-uitleg">Passen: gegeven/ontvangen. Worpen: nek (n) en rug (r). Loopwerk gemeten zolang de speler in beeld was.</p>
        </section>
      )}

      {passen.length > 0 && (
        <section className="appa-blok" id="passen">
          <h2 className="section-title">Passen <span className="an-chart-hint">{passen.length}</span></h2>
          <ul className="appa-lijst">
            {passen.map((p, i) => (
              <li key={i} className={`side-${kant(p.team)}`}>
                <span className="appa-tijd">{tijd(p.tijd_s)}</span> {wie(p.van)} → {wie(p.naar)}
                {p.afstand != null ? ` · ${getal(p.afstand, 1, ' m')}` : ''}
                {p.betrouwbaar === false ? ' · onzeker' : ''}
              </li>
            ))}
          </ul>
        </section>
      )}

      {data?.tactiek && Object.keys(data.tactiek).length > 0 && (
        <section className="appa-blok" id="tactiek">
          <h2 className="section-title">Tactiek per ploeg</h2>
          <div className="appa-tactiek">
            {Object.entries(data.tactiek).map(([id, t]) => {
              const w = t.werpen ?? {}
              const lijst = (o?: Record<string, { n: number; pct: number }>) =>
                Object.entries(o ?? {})
                  .filter(([, v]) => v.n > 0)
                  .map(([k, v]) => `${k} ${pct(v.pct)}`)
                  .join(' · ') || '–'
              const xg = data.verwachte_goals?.per_team?.[id]
              const dk = data.dekking_samenvatting?.[id]
              return (
                <div key={id} className={`appa-kaart side-${kant(Number(id))}`}>
                  <h3>{ploegNaam(Number(id))}</h3>
                  <dl>
                    <dt>Worpen</dt><dd>{w.n ?? 0}</dd>
                    <dt>Worptype</dt><dd>{lijst(w.type)}</dd>
                    <dt>Gem. afstand</dt><dd>{getal(w.afstand_gem, 1, ' m')}</dd>
                    <dt>Richting</dt><dd>{lijst(w.richting)}</dd>
                    <dt>Uitkomst</dt><dd>{lijst(w.uitkomst)}</dd>
                    {xg && (<><dt>Verwachte goals</dt><dd>{getal(xg.verwacht, 1)} (gescoord {xg.goals ?? 0} uit {xg.n ?? 0})</dd></>)}
                    {dk && (<><dt>Dekking</dt><dd>{dk.n ?? 0} doelpogingen · {dk.open ?? 0} open · {dk.gedekt ?? 0} gedekt · {dk.onzeker ?? 0} onzeker</dd></>)}
                  </dl>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {beheert && (
        <section className="appa-blok" id="delen">
          <h2 className="section-title">Delen</h2>
          <AppDelen matchId={matchId} titel={titel} />
        </section>
      )}

      <section className="appa-blok" id="downloads">
        <h2 className="section-title">Downloads</h2>
        <ul className="appa-downloads">
          {DOWNLOADS.filter(([n]) => heeft.has(n)).map(([n, label]) => (
            <li key={n}>
              <a href={`${url(n)}&download=1`}>{label}</a>
            </li>
          ))}
        </ul>
      </section>

      <p className="appa-bron">
        Gemaakt met de krachtbal-analyse-app
        {gemaakt && !Number.isNaN(gemaakt.getTime())
          ? ` · ${gemaakt.toLocaleString('nl-BE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Brussels' })}`
          : ''}
        {manifest.appVersie ? ` · versie ${manifest.appVersie}` : ''}
        {data?.kalibratie_rms != null ? ` · kalibratiefout ${getal(data.kalibratie_rms, 2, ' m')}` : ''}
      </p>
    </div>
  )
}
