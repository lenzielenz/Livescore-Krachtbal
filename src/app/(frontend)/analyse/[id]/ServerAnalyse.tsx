'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// De video-analyse laten draaien op de server: één knop, en de voortgang blijft staan ook al
// klap je de pagina dicht. Het rekenwerk (worpen zoeken, bal volgen, spelers herkennen) duurt
// minuten tot een uur, dus de stand komt uit de database en niet uit deze component.

type Stand = {
  status: 'wachtrij' | 'bezig' | 'klaar' | 'mislukt' | 'afgebroken'
  stap: string
  stapNummer: number
  stappen: number
  gestart: string
  geeindigd?: string
  fout?: string
  /** Hoe ver de huidige stap staat (0..1) en wat ze laatst meldde. */
  stapFractie?: number
  stapDetail?: string
  laatsteTeken?: string
  stappenNamen?: string[]
  rapport?: {
    voorstellen?: number
    detecties?: number
    metLanding?: number
    duurSeconden?: number
    onderbrekingen?: number[]
    gaten?: [number, number][]
    bekekenS?: number
    duurS?: number
    metingenPerS?: number
    overgeslagen?: string[]
  }
  instellingen?: { stand: string; bewegend: boolean; tracking: boolean; overlay: boolean }
}

type Antwoord = {
  stand: Stand | null
  kanAnalyseren: boolean
  omgevingOk: boolean
  heeftOverlay: boolean
  reden: string | null
  heeftKalibratie: boolean
  andereLoopt: boolean
}

type RuntimeStand = {
  status: 'bezig' | 'klaar' | 'mislukt'
  stap: string
  stapNummer: number
  stappen: number
  fout?: string
}

const klokje = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`

const duurTekst = (s?: number) =>
  s == null ? '' : s < 90 ? `${s} s` : `${Math.round(s / 60)} min`

export function ServerAnalyse({ matchId, heeftVideo }: { matchId: number; heeftVideo: boolean }) {
  const [info, setInfo] = useState<Antwoord | null>(null)
  const [busy, setBusy] = useState(false)
  const [fout, setFout] = useState<string | null>(null)
  const [stand, setStand] = useState<'snel' | 'gewoon' | 'nauwkeurig' | 'ultra'>('gewoon')
  const [bewegend, setBewegend] = useState(false)
  const [tracking, setTracking] = useState(false)
  const [ai, setAi] = useState(false)
  const [aiModel, setAiModel] = useState(false)
  const [modelGewichten, setModelGewichten] = useState(true)
  const [omgeving, setOmgeving] = useState<RuntimeStand | null>(null)
  const [magInstalleren, setMagInstalleren] = useState(false)
  const timer = useRef<number | null>(null)

  const haal = useCallback(async () => {
    try {
      const res = await fetch(`/api/cv/match/${matchId}/analyseer`)
      if (!res.ok) return
      setInfo((await res.json()) as Antwoord)
    } catch {
      /* stil: een mislukte peiling is geen fout die de gebruiker moet zien */
    }
  }, [matchId])

  // De stand van de analyse-omgeving. Een 403 betekent gewoon: jij mag ze niet installeren —
  // dan blijft de knop weg in plaats van een foutmelding te tonen.
  const haalOmgeving = useCallback(async () => {
    try {
      const res = await fetch('/api/cv/runtime')
      if (!res.ok) {
        setMagInstalleren(false)
        return
      }
      const data = (await res.json()) as {
        stand: RuntimeStand | null
        aiModel?: boolean
        modelGewichten?: boolean
      }
      setMagInstalleren(true)
      setOmgeving(data.stand)
      setAiModel(data.aiModel === true)
      setModelGewichten(data.modelGewichten !== false)
    } catch {
      /* stil */
    }
  }, [])

  useEffect(() => {
    void haal()
  }, [haal])

  // Ook als de omgeving in orde is willen we weten of het houdingsmodel erbij staat.
  useEffect(() => {
    if (info) void haalOmgeving()
  }, [info, haalOmgeving])

  // Zolang er iets draait: elke vijf seconden kijken. Niet vaker — het is rekenwerk van
  // minuten, en elke peiling kost de server een databaseronde.
  const draait = info?.stand?.status === 'bezig' || info?.stand?.status === 'wachtrij'
  useEffect(() => {
    if (!draait) return
    timer.current = window.setInterval(() => void haal(), 5000)
    return () => {
      if (timer.current) window.clearInterval(timer.current)
    }
  }, [draait, haal])

  // De klok, de hartslag en "nog ± zoveel" hangen aan Date.now(). Zonder een eigen tik worden ze
  // maar om de vijf seconden herrekend en staat het scherm vier van de vijf seconden stil — net
  // wat we wilden wegwerken. Deze tik kost de server niets.
  const [, tik] = useState(0)
  useEffect(() => {
    if (!draait) return
    const t = window.setInterval(() => tik((n) => n + 1), 1000)
    return () => window.clearInterval(t)
  }, [draait])

  // Installeren duurt een halve minuut tot enkele minuten: sneller peilen, en als het klaar is
  // meteen de analysestand opnieuw ophalen zodat de knop vanzelf aangaat.
  const installeert = omgeving?.status === 'bezig'
  useEffect(() => {
    if (!installeert) return
    const t = window.setInterval(() => {
      void haalOmgeving()
      void haal()
    }, 3000)
    return () => window.clearInterval(t)
  }, [installeert, haalOmgeving, haal])

  const installeer = async (soort: 'basis' | 'ai' = 'basis') => {
    setBusy(true)
    setFout(null)
    try {
      const res = await fetch('/api/cv/runtime', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ soort }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) {
        setFout(data.error ?? 'Installeren mislukt.')
        return
      }
      await haalOmgeving()
    } catch {
      setFout('Netwerkfout — probeer opnieuw.')
    } finally {
      setBusy(false)
    }
  }

  const start = async () => {
    setBusy(true)
    setFout(null)
    try {
      const res = await fetch(`/api/cv/match/${matchId}/analyseer`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ stand, bewegend, tracking, ai, overlay: true }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) {
        setFout(data.error ?? 'Starten mislukt.')
        return
      }
      await haal()
    } catch {
      setFout('Netwerkfout — probeer opnieuw.')
    } finally {
      setBusy(false)
    }
  }

  const stop = async () => {
    setBusy(true)
    try {
      await fetch(`/api/cv/match/${matchId}/analyseer`, { method: 'DELETE' })
      await haal()
    } finally {
      setBusy(false)
    }
  }

  if (!heeftVideo) return null
  const s = info?.stand ?? null
  // Elke peiling (om de vijf seconden) hertekent dit blok, dus deze klok loopt vanzelf mee.
  const nu = Date.now()
  // De balk telt niet alleen áfgewerkte stappen mee, maar ook hoe ver de lopende staat: de
  // zwaarste stap duurt in zijn eentje langer dan al de rest samen, en een balk die daar een
  // halfuur stilstaat is niet te onderscheiden van een vastgelopen taak.
  const pct =
    s && s.stappen > 0
      ? Math.round(((s.stapNummer - 1 + Math.min(1, Math.max(0, s.stapFractie ?? 0))) / s.stappen) * 100)
      : 0
  // Hoe lang geleden liet de stap iets van zich horen? Alleen tonen als het écht lang duurt —
  // anders lijkt elke normale stap verdacht.
  const stilS = s?.laatsteTeken ? Math.round((nu - new Date(s.laatsteTeken).getTime()) / 1000) : null
  const langStil = stilS != null && stilS > 300
  // "Leeft het nog?" — een melding van minder dan een minuut geleden telt als een hartslag.
  const leeft = stilS == null || stilS < 60
  const verstrekenS = s?.gestart ? Math.max(0, Math.round((nu - new Date(s.gestart).getTime()) / 1000)) : 0
  // Verwachte klaartijd uit wat er tot nu toe gebeurd is. Bij een analyse die de hele nacht
  // duurt is "klaar rond 05:40" het enige getal waar je iets aan hebt.
  const klaarRond = (() => {
    const f = s && s.stappen > 0
      ? (s.stapNummer - 1 + Math.min(1, Math.max(0, s.stapFractie ?? 0))) / s.stappen
      : 0
    if (!s || f <= 0.01 || verstrekenS < 30) return null
    const resterend = (verstrekenS * (1 - f)) / f
    if (!Number.isFinite(resterend) || resterend <= 0) return null
    return kloktijd(new Date(nu + resterend * 1000).toISOString())
  })()

  return (
    <section className="sa" id="serveranalyse">
      <h2 className="an-h2">🤖 Video automatisch analyseren</h2>

      {info && !info.kanAnalyseren && <p className="sa-let-op">{info.reden}</p>}

      {info && !info.omgevingOk && magInstalleren && (
        <div className="sa-omgeving">
          {installeert ? (
            <>
              <div className="sa-balk" role="progressbar">
                <span style={{ width: `${Math.max(8, ((omgeving!.stapNummer - 1) / omgeving!.stappen) * 100)}%` }} />
              </div>
              <p className="sa-stap">
                <strong>
                  Stap {omgeving!.stapNummer} van {omgeving!.stappen}:
                </strong>{' '}
                {omgeving!.stap}…
              </p>
              <p className="sa-hint">Dit duurt ongeveer een minuut. Je mag de pagina gerust sluiten.</p>
            </>
          ) : (
            <>
              <p className="sa-lead">
                De analyse-omgeving (Python met opencv) staat nog niet op deze server. Ze wordt
                eenmalig opgehaald en op het volume gezet — ongeveer <strong>320 MB</strong>, klaar
                in een minuut. Daarna blijft ze staan, ook na een nieuwe versie van de site.
              </p>
              {omgeving?.status === 'mislukt' && <p className="sa-let-op">❌ Mislukt: {omgeving.fout}</p>}
              <button type="button" className="va-btn primary" disabled={busy} onClick={() => void installeer('basis')}>
                {busy ? 'Bezig…' : '⚙️ Analyse-omgeving installeren'}
              </button>
            </>
          )}
        </div>
      )}

      {draait ? (
        <div className="sa-bezig">
          <div className="sa-balk" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${Math.max(6, pct)}%` }} />
          </div>
          <p className="sa-stap">
            {/* De hartslag klopt zolang er meldingen binnenkomen. Dat is het verschil tussen
                "traag" en "vastgelopen" in één oogopslag — een percentage dat langzaam stijgt
                ziet er hetzelfde uit als een percentage dat stilstaat. */}
            <span className={`sa-puls${leeft ? '' : ' stil'}`} aria-hidden />
            <strong>Stap {s?.stapNummer} van {s?.stappen} · {pct}%:</strong> {s?.stap}…
            {s?.stapDetail ? <span className="sa-detail"> {s.stapDetail}</span> : null}
          </p>

          <p className="sa-klok">
            Bezig sinds {kloktijd(s?.gestart)} · {duur(verstrekenS)} onderweg
            {klaarRond && <> · naar schatting klaar rond <strong>{klaarRond}</strong></>}
          </p>

          {/* Wat er al af is en wat er nog komt. Bij een analyse van uren wil je zien dat er
              nog vijf stappen wachten — niet alleen dat stap 1 "bezig" is. */}
          {s?.stappenNamen && s.stappenNamen.length > 1 && (
            <ol className="sa-stappenlijst">
              {s.stappenNamen.map((naam, i) => {
                const nummer = i + 1
                const status = nummer < (s.stapNummer ?? 1) ? 'ok' : nummer === s.stapNummer ? 'bezig' : 'todo'
                return (
                  <li key={naam} className={status}>
                    <span aria-hidden>{status === 'ok' ? '✓' : status === 'bezig' ? '▸' : '○'}</span> {naam}
                  </li>
                )
              })}
            </ol>
          )}
          {langStil && (
            <p className="sa-let-op">
              Al {Math.round((stilS as number) / 60)} minuten niets gehoord van deze stap. Ze kan
              nog bezig zijn met een zwaar stuk video, maar als dit blijft duren breek je ze beter
              af en probeer je opnieuw op de stand “snel”.
            </p>
          )}
          <p className="sa-hint">
            Dit duurt minuten tot een uur, afhankelijk van de lengte van de video. Je mag deze
            pagina gerust sluiten — de analyse loopt door en de stand blijft hier staan.
          </p>
          <button type="button" className="va-btn" disabled={busy} onClick={() => void stop()}>
            Analyse afbreken
          </button>
        </div>
      ) : (
        <>
          {s?.status === 'klaar' && (
            <div className="sa-klaar">
              <p>
                ✅ Klaar in {duurTekst(s.rapport?.duurSeconden)}:{' '}
                <strong>{s.rapport?.voorstellen ?? 0} voorstellen</strong>
                {s.rapport?.metLanding ? ` (${s.rapport.metLanding} met landingspunt)` : ''} — bekijk en
                bevestig ze hierboven bij de video.
              </p>
              {/* Wát er precies gebeurd is. Zonder deze regel is "9 voorstellen" een getal
                  zonder betekenis: je weet niet of de hele video bekeken is, hoe fijn er
                  gekeken werd, of hoeveel dat per minuut is. */}
              {s.rapport?.bekekenS != null && (
                <p className="sa-hint">
                  Bekeken: {klokje(s.rapport.bekekenS)}
                  {s.rapport.duurS != null && s.rapport.duurS > 0
                    ? ` van de ${klokje(s.rapport.duurS)}`
                    : ''}
                  {s.rapport.metingenPerS ? `, ${s.rapport.metingenPerS} metingen per seconde` : ''} —{' '}
                  {((s.rapport.voorstellen ?? 0) / Math.max(1 / 60, s.rapport.bekekenS / 60)).toFixed(1)}{' '}
                  voorstellen per minuut.
                  {s.rapport.duurS != null && s.rapport.bekekenS < 0.9 * s.rapport.duurS && (
                    <strong> Een deel van de opname kon niet gelezen worden.</strong>
                  )}
                </p>
              )}
              {s.rapport?.overgeslagen?.length ? (
                <p className="sa-onderbroken">
                  ⚠️ Zonder veldkalibratie is dit overgeslagen: {s.rapport.overgeslagen.join(', ')}.
                  Duid het veld hieronder aan en analyseer opnieuw.
                </p>
              ) : null}
            </div>
          )}
          {info?.heeftOverlay && (
            <div className="sa-controle">
              <h3 className="sa-h3">🎯 Zien wat er getrackt werd</h3>
              <video className="sa-video" src={`/api/cv/match/${matchId}/overlay`} controls playsInline preload="metadata" />
              <p className="sa-legende">
                <span className="sa-kleur groen" /> veldmodel
                <span className="sa-kleur blauw" /> herkende lijnen
                <span className="sa-kleur rood" /> bal
                <span className="sa-kleur roze" /> spelers
              </p>
              <p className="sa-hint">
                Loopt het groene veld mee met het echte veld, dan klopt de meting. Schuift het weg,
                dan is de kalibratie of het beeld op dat moment niet betrouwbaar — die worpen kan je
                bij het reviewen met een korrel zout nemen.
              </p>
            </div>
          )}

          {s?.status === 'klaar' && s.rapport?.onderbrekingen?.length ? (
            <p className="sa-onderbroken">
              ✂️ De opname is {s.rapport.onderbrekingen.length}× onderbroken (
              {s.rapport.onderbrekingen.slice(0, 4).map(klokje).join(', ')}
              {s.rapport.onderbrekingen.length > 4 ? ', …' : ''}). Elk stuk wordt apart gevolgd.
              {s.rapport.gaten?.length ? (
                <>
                  {' '}
                  <strong>
                    Zonder ijkbeeld, dus niet gemeten:{' '}
                    {s.rapport.gaten.map(([a, b]) => `${klokje(a)}–${klokje(b)}`).join(', ')}.
                  </strong>{' '}
                  Neem daar hierboven een beeld en analyseer opnieuw.
                </>
              ) : (
                ' Elk stuk had een ijkbeeld — alles is gemeten.'
              )}
            </p>
          ) : null}

          {s?.status === 'mislukt' && <p className="sa-let-op">❌ Mislukt: {s.fout}</p>}
          {s?.status === 'afgebroken' && <p className="sa-let-op">⏹ Afgebroken. {s.fout ?? ''}</p>}

          <p className="sa-lead">
            De server zoekt <strong>momenten met veel beweging</strong> en zet die klaar als
            voorstellen die jij bevestigt of afwijst. Hij herkent nog geen worpen als zodanig:
            het is een spotter die kandidaten aandraagt, geen scheidsrechter. Op een opname met
            een bewegende camera vindt hij er duidelijk minder — de camerabeweging overstemt dan
            wat de spelers doen.
            {info && !info.heeftKalibratie && (
              <>
                {' '}Zonder veldkalibratie weet hij <em>wanneer</em> er geworpen wordt, maar niet
                waar de bal landt — kalibreer hieronder om ook zones en afstanden te krijgen.
              </>
            )}
          </p>

          <div className="sa-opties">
            <label className="sa-optie">
              <span>Precisie</span>
              <select value={stand} onChange={(e) => setStand(e.target.value as typeof stand)}>
                <option value="snel">Snel</option>
                <option value="gewoon">Gewoon</option>
                <option value="nauwkeurig">Nauwkeurig</option>
                <option value="ultra">Ultra — hele nacht</option>
              </select>
            </label>
            <p className="sa-uitleg">
              Elke stand kijkt <strong>twee keer</strong>: eerst de hele video af op zoek naar
              alles wat op een worp lijkt, daarna élk beeld rond die momenten opnieuw. Zo hangt
              het niet van toeval af of er net een meting midden in de zwaai viel — en dát is wat
              een worp gevonden of gemist maakt. De precisie hierboven bepaalt hoe grondig er
              gezócht wordt.
            </p>
            {stand === 'ultra' && (
              <p className="sa-let-op sa-ultra">
                Ultra zoekt met het zwaarste model en laat niets liggen: reken op uren, niet op
                minuten. Zet ze aan vóór je gaat slapen — je ziet hieronder rond welk uur ze klaar
                is.
                <br />
                <strong>Let wel:</strong> komt er ondertussen een nieuwe versie van de site
                online, of herstart de server, dan sneuvelt de lopende analyse en moet ze
                opnieuw. Bij een run van acht uur is dat een echte kans.
              </p>
            )}
            <label className="sa-vink">
              <input type="checkbox" checked={bewegend} onChange={(e) => setBewegend(e.target.checked)} />
              <span>Camera bewoog (gsm in de hand)</span>
            </label>
            <label className="sa-vink">
              <input type="checkbox" checked={tracking} onChange={(e) => setTracking(e.target.checked)} />
              <span>Ook spelers volgen (loopafstand, sprintjes)</span>
            </label>
            {aiModel && !modelGewichten && (
              <p className="sa-let-op">
                Het houdingsmodel staat er wél, maar zijn gewichten niet meer — die stonden in de
                container en zijn bij de laatste uitrol verdwenen. Zonder ze haalt de eerste
                analyse ze stilletjes opnieuw op (± 100 MB), en daar lijkt ze op vast te lopen.{' '}
                <button
                  type="button"
                  className="va-btn"
                  disabled={busy || installeert}
                  onClick={() => void installeer('ai')}
                >
                  Model opnieuw ophalen
                </button>
              </p>
            )}
            {aiModel ? (
              <label className="sa-vink">
                <input type="checkbox" checked={ai} onChange={(e) => setAi(e.target.checked)} />
                <span>
                  Worpen herkennen met het houdingsmodel <em>(kijkt naar de spelers zelf —
                  werkt ook bij een bewegende camera, maar rekent trager)</em>
                </span>
              </label>
            ) : (
              info?.omgevingOk &&
              magInstalleren && (
                <p className="sa-hint">
                  Het houdingsmodel staat er nog niet bij. Dat herkent worpen aan de spelers zelf
                  in plaats van aan beeldverschil — de enige manier die werkt bij een camera in de
                  hand.{' '}
                  <button
                    type="button"
                    className="va-btn"
                    disabled={busy || installeert}
                    onClick={() => void installeer('ai')}
                  >
                    🧠 Houdingsmodel installeren (~200 MB)
                  </button>
                </p>
              )
            )}
          </div>

          <div className="sa-acties">
            <button
              type="button"
              className="va-btn primary"
              disabled={busy || !info?.kanAnalyseren || info?.andereLoopt}
              onClick={() => void start()}
            >
              {busy ? 'Starten…' : s?.status === 'klaar' ? '🤖 Opnieuw analyseren' : '🤖 Analyseer de video'}
            </button>
            {info?.andereLoopt && (
              <span className="sa-hint">Er loopt al een analyse van een andere wedstrijd — even wachten.</span>
            )}
          </div>
          {fout && <p className="sa-let-op">{fout}</p>}
        </>
      )}
    </section>
  )
}

/** Een tijdstip als klokuur — "klaar rond 05:40" zegt meer dan "nog 7:12:00". */
function kloktijd(iso: string | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Verstreken tijd in mensentaal: "3 min", "2 u 14 min". */
function duur(seconden: number): string {
  if (seconden < 60) return `${seconden} s`
  const m = Math.round(seconden / 60)
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)} u ${String(m % 60).padStart(2, '0')} min`
}
