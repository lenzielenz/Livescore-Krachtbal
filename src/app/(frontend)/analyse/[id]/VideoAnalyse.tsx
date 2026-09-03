'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import {
  activeMomentIndex,
  fmtVideoTime,
  momentToVideo,
  parseVideoSource,
  youtubeEmbedAt,
  type VideoSync,
} from '@/lib/video-sync'
import {
  aantalStukken,
  bestandsSleutel,
  hervatVanafStuk,
  stukBereik,
  uploadFout,
  wachtNaPoging,
  POGINGEN_PER_STUK,
} from '@/lib/video-upload'

import { CvReview, type CvVoorstel } from './CvReview'
import './video-tijdlijn.css'

export interface VideoMoment {
  half: number
  gameClock: number
  side: 'home' | 'away'
  /** Korte omschrijving, bv. "12 Jens · rugworp". */
  label: string
  /** Punten van het doelpunt (voor de +1/+2-pil). */
  points?: number
}

/** Eén worp op de videotijdlijn — de manuele tag (helft + klok) die we naast het beeld leggen. */
export interface VideoWorp {
  half: number
  gameClock: number
  side: 'home' | 'away'
  /** Nekworp of rugworp (Throws.type). */
  worpType: 'nek' | 'rug'
  /** Bijzondere afloop die de marker bepaalt; gewone worpen tonen hun worpsoort. */
  uitkomst: 'doelpunt' | 'vangst' | null
  shirtNumber: number
}

// ── Video-analyse: de opname naast de wedstrijdmomenten ───────────────────────────────────────
// Klik een doelpunt → de video springt naar dat beeld. Bij een echt videobestand kan dat exact
// (currentTime) en loopt de lijst mee met het beeld; YouTube laat enkel een herstart op een
// bepaalde seconde toe, dus daar herlaadt de speler bij elke sprong.
export function VideoAnalyse({
  matchId,
  initialUrl,
  initialUrl2 = null,
  initialOffset2 = null,
  initialOffsetH1,
  initialOffsetH2,
  moments,
  worpen,
  voorstellen = [],
  halfSeconds,
  teams,
  canEdit,
  maxMb,
}: {
  matchId: number
  initialUrl: string | null
  /** Tweede camera (andere kant van het veld) en haar geijkte tijdsverschil met camera 1. */
  initialUrl2?: string | null
  initialOffset2?: number | null
  initialOffsetH1: number | null
  initialOffsetH2: number | null
  moments: VideoMoment[]
  /** Alle worpen van de wedstrijd, voor de tijdlijnbalk onder de video. */
  worpen: VideoWorp[]
  /** CV-voorstellen (fase 1) — enkel meegegeven aan federatie-kijkers; leeg = geen review-laan. */
  voorstellen?: CvVoorstel[]
  halfSeconds: number
  teams: { home: string; away: string }
  canEdit: boolean
  /** Maximale uploadgrootte van de server (MAX_MATCH_VIDEO_MB) — zo weigeren we een te groot
   *  bestand vóór we een half uur zitten uploaden. */
  maxMb: number
}) {
  const router = useRouter()
  const [url, setUrl] = useState(initialUrl ?? '')
  const [draftUrl, setDraftUrl] = useState(initialUrl ?? '')
  const [sync, setSync] = useState<VideoSync>({ offsetH1: initialOffsetH1 ?? 0, offsetH2: initialOffsetH2 })
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Waar de video nu staat, in de TIJDLIJN VAN CAMERA 1 (de gedeelde tijdlijn van alle markers).
  // Kijk je naar camera 2, dan is dit de eigen positie min het geijkte tijdsverschil.
  const [pos, setPos] = useState(0)
  // Duur van camera 1 (enkel gekend bij een bestand) — de schaal van de tijdlijnbalk. De duur
  // van camera 2 is bewust géén schaal: de tijdlijn blijft die van de hoofdopname.
  const [dur, setDur] = useState<number | null>(null)
  // Is de aftrap van de 1e helft écht geijkt? (offsetH1 valt op 0 terug zolang dat niet zo is,
  // en dat verschil moet het sync-rapport net tonen.)
  const [h1Geijkt, setH1Geijkt] = useState(initialOffsetH1 != null)
  // Uploadvoortgang in % (null = geen upload bezig), plus voor welke camera die loopt.
  const [upPct, setUpPct] = useState<number | null>(null)
  const [upCam, setUpCam] = useState<1 | 2>(1)
  const videoRef = useRef<HTMLVideoElement>(null)
  // Herlaad-sleutel voor de YouTube-iframe: bij elke sprong een nieuwe waarde → nieuwe start.
  const [ytSeek, setYtSeek] = useState(0)

  // ── Tweede camera ──
  const [url2, setUrl2] = useState(initialUrl2 ?? '')
  const [offset2, setOffset2] = useState<number | null>(initialOffset2)
  // Welke opname er in de speler staat. De tijdlijn en de voorstellen blijven op camera 1.
  const [cam, setCam] = useState<1 | 2>(1)
  // De ijk-flow voor het tijdsverschil: het moment (camera 1-tijd) dat we in camera 2 zoeken.
  const [ijk2Start, setIjk2Start] = useState<number | null>(null)
  // Na een camerawissel wil de speler op het overeenkomstige moment verder — pas te zetten
  // zodra de nieuwe bron geladen is.
  const wilNative = useRef<number | null>(null)

  const source = useMemo(() => parseVideoSource(url), [url])
  const isFile = source?.kind === 'file'
  const source2 = useMemo(() => parseVideoSource(url2), [url2])
  const isFile2 = source2?.kind === 'file'
  // De bron die nú in de speler staat.
  const kijkCam2 = cam === 2 && isFile2
  const actieveSrc = kijkCam2 && source2 ? source2.src : isFile && source ? source.src : null
  /** Eigen tijd van de actieve opname → camera 1-tijdlijn. */
  const naarTijdlijn = useCallback(
    (native: number) => (kijkCam2 ? native - (offset2 ?? 0) : native),
    [kijkCam2, offset2],
  )
  /** Camera 1-tijdlijn → eigen tijd van de actieve opname. */
  const naarNative = useCallback(
    (t: number) => (kijkCam2 ? t + (offset2 ?? 0) : t),
    [kijkCam2, offset2],
  )

  // Andere video gekoppeld → de oude duur geldt niet meer als schaal voor de tijdlijnbalk.
  useEffect(() => {
    setDur(null)
  }, [url])

  // Een melding over de refresh heen tillen. Was dit de éérste video, dan staat dit blok
  // bovenaan de pagina en verhuist het na router.refresh() naar zijn vaste plek — een nieuw
  // exemplaar, dat zijn state (en dus de melding) anders kwijt is. Met een tijdstip erbij,
  // zodat een oude melding nooit bij een later bezoek opduikt.
  const parkeerMelding = useCallback(
    (melding: string) => {
      try {
        sessionStorage.setItem(`va-melding-${matchId}`, JSON.stringify({ m: melding, t: Date.now() }))
      } catch { /* privémodus zonder opslag: dan enkel de gewone melding in dít exemplaar */ }
    },
    [matchId],
  )

  // De geparkeerde melding ophalen (zie hierboven): dit exemplaar is dan net gemount
  // op de vaste plek, terwijl het exemplaar dat de upload deed met het lege-staat-blok verdween.
  // Enkel een vérse melding tonen — een oude wordt stil opgeruimd.
  useEffect(() => {
    try {
      const ruw = sessionStorage.getItem(`va-melding-${matchId}`)
      if (!ruw) return
      sessionStorage.removeItem(`va-melding-${matchId}`)
      const { m, t } = JSON.parse(ruw) as { m?: string; t?: number }
      if (typeof m === 'string' && typeof t === 'number' && Date.now() - t < 15_000) setMsg(m)
    } catch { /* geen opslag of onleesbare inhoud: geen melding, geen drama */ }
  }, [matchId])

  // ── Download & delen (gsm) ──
  // Een videobestand moet je ook op je telefoon kunnen bewaren en doorsturen. Onze eigen
  // clip-route (/api/clip/…) maakt er met ?download=1 een échte download van (Android: meteen in
  // Downloads); delen gaat via het toestel-deelvenster (WhatsApp staat daar tussen) met de link —
  // de ontvanger tikt en kijkt. Een extern .mp4-bestand delen we op dezelfde manier.
  const videoNaam = `krachtbal-${teams.home}-${teams.away}`.replace(/[^A-Za-z0-9_-]+/g, '-').slice(0, 60)
  const downloadHref =
    isFile && source
      ? `${source.src}${source.src.includes('?') ? '&' : '?'}download=1&name=${encodeURIComponent(videoNaam)}`
      : null
  const shareVideo = useCallback(async () => {
    if (!source || source.kind !== 'file') return
    const abs = new URL(source.src, window.location.origin).toString()
    const tekst = `🎥 Wedstrijdvideo ${teams.home} – ${teams.away}`
    const nav = navigator as Navigator & { share?: (d: { title?: string; text?: string; url?: string }) => Promise<void> }
    if (nav.share) {
      try {
        await nav.share({ title: tekst, text: tekst, url: abs })
        return
      } catch (err) {
        if ((err as Error).name === 'AbortError') return // gebruiker annuleerde
      }
    }
    // Geen deelvenster (desktopbrowser): rechtstreeks naar WhatsApp met de link in het bericht.
    window.open(`https://wa.me/?text=${encodeURIComponent(`${tekst}: ${abs}`)}`, '_blank', 'noopener')
  }, [source, teams])

  const save = useCallback(
    async (patch: Record<string, unknown>, okMsg: string) => {
      setBusy(true)
      setMsg(null)
      try {
        const res = await fetch(`/api/match/${matchId}/video`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(patch),
        })
        const data = (await res.json()) as { error?: string }
        if (!res.ok) throw new Error(data.error ?? 'Bewaren mislukt.')
        setMsg(okMsg)
        // De vervolgstappen (kalibratie, server-analyse, de voortgangskaart bovenaan) zijn
        // server-gerenderde blokken die op de video en de ijking van de wedstrijd afhangen.
        // Zonder dit zag je ze pas na een handmatige herlading — "ik moet refreshen om de
        // volgende stap te zien". Dit rendert enkel de serverkant opnieuw; de speler en zijn
        // positie blijven gewoon staan.
        router.refresh()
        return true
      } catch (e) {
        setMsg((e as Error).message)
        return false
      } finally {
        setBusy(false)
      }
    },
    [matchId, router],
  )

  /** Spring naar een positie op de camera 1-tijdlijn (exact bij een bestand, herstart bij
   *  YouTube). Staat camera 2 in de speler, dan wordt er naar háár eigen tijd omgerekend. */
  const seek = useCallback(
    (seconds: number) => {
      const t = Math.max(0, seconds)
      setPos(t)
      if (actieveSrc && videoRef.current) {
        videoRef.current.currentTime = Math.max(0, naarNative(t))
        void videoRef.current.play().catch(() => {})
      } else {
        setYtSeek((n) => n + 1)
      }
    },
    [actieveSrc, naarNative],
  )

  /** Eén frame verspringen voor de CV-review (,/.): pauzeer en schuif exact op — enkel bij een
   *  videobestand, want alleen daar sturen we currentTime rechtstreeks aan. */
  const frameStap = useCallback(
    (deltaSeconds: number) => {
      const v = videoRef.current
      if (!v) return
      v.pause()
      const t = Math.max(0, v.currentTime + deltaSeconds)
      v.currentTime = t
      setPos(naarTijdlijn(t))
    },
    [naarTijdlijn],
  )

  /** Van opname wisselen, en op hetzelfde móment verdergaan (voor zover het verschil geijkt is). */
  const wisselCamera = useCallback(
    (naar: 1 | 2) => {
      if (naar === cam) return
      const v = videoRef.current
      const huidigNative = v?.currentTime ?? 0
      // Het gedeelde moment: eerst naar de tijdlijn van camera 1, dan naar de nieuwe opname.
      const t = cam === 2 ? huidigNative - (offset2 ?? 0) : huidigNative
      wilNative.current = Math.max(0, naar === 2 ? t + (offset2 ?? 0) : t)
      setCam(naar)
    },
    [cam, offset2],
  )

  const jumpTo = useCallback(
    (m: { half: number; gameClock: number }) => {
      const t = momentToVideo(m, sync, halfSeconds)
      // Valt het moment voorbij het einde van de video, dan zou de speler stilzwijgend op het einde
      // blijven staan ("ik klik en er gebeurt niets"). Zeg wat er scheelt: meestal staat de ijking
      // verkeerd, of is dit een fragment i.p.v. de volledige wedstrijd.
      const dur = videoRef.current?.duration
      if (isFile && !kijkCam2 && dur && Number.isFinite(dur) && t > dur) {
        setMsg(`Dit moment valt op ${fmtVideoTime(t)}, voorbij het einde van de video (${fmtVideoTime(dur)}). Klopt de ijking van de aftrap?`)
        return
      }
      setMsg(null)
      seek(t)
    },
    [seek, sync, halfSeconds, isFile, kijkCam2],
  )

  /** IJk: "de video staat nu precies op de aftrap van deze helft" — altijd op de tijdlijn van
   *  camera 1, ook als camera 2 in de speler staat (dan telt het geijkte verschil mee). */
  const calibrate = async (half: 1 | 2) => {
    const at = Math.round(
      actieveSrc ? naarTijdlijn(videoRef.current?.currentTime ?? naarNative(pos)) : pos,
    )
    if (at < 0) return
    const key = half === 1 ? 'videoOffsetH1' : 'videoOffsetH2'
    const ok = await save({ [key]: at }, `Aftrap ${half}e helft geijkt op ${fmtVideoTime(at)}.`)
    if (ok) {
      setSync((s) => (half === 1 ? { ...s, offsetH1: at } : { ...s, offsetH2: at }))
      if (half === 1) setH1Geijkt(true)
    }
  }

  /** De ijk-flow voor camera 2, stap 1: dít moment (camera 1) gaan we in camera 2 zoeken. */
  const startIjk2 = () => {
    const t = videoRef.current?.currentTime ?? pos
    setIjk2Start(cam === 2 ? naarTijdlijn(t) : t)
    wisselCamera(2)
    setMsg('Zoek nu hetzélfde moment in camera 2 (bv. de aftrap) en klik "Zelfde moment hier".')
  }

  /** Stap 2: de speler staat in camera 2 op datzelfde moment → het verschil ligt vast. */
  const bevestigIjk2 = async () => {
    if (ijk2Start == null) return
    const t2 = videoRef.current?.currentTime ?? 0
    const verschil = Math.round((t2 - ijk2Start) * 10) / 10
    const ok = await save(
      { video2OffsetS: verschil },
      `Camera 2 geijkt: hetzelfde moment staat er ${Math.abs(verschil).toFixed(1)} s ${verschil >= 0 ? 'later' : 'vroeger'} op de band dan in camera 1.`,
    )
    if (ok) {
      setOffset2(verschil)
      setIjk2Start(null)
    }
  }

  /**
   * De volledige matchvideo uploaden naar de server (streamt daar meteen naar schijf).
   * Op een gsm is dit de gevoeligste stap: een wedstrijd van een uur is al snel honderden MB.
   * Daarom eerst controleren wat we hier al weten, i.p.v. na tien minuten een foutmelding.
   */
  const upload = (f: File, camera: 1 | 2 = 1) => {
    const mb = f.size / (1024 * 1024)
    // Android's camera levert mp4; de server aanvaardt mp4 en webm. Andere formaten (bv. .mkv of
    // een .mov uit een iPhone-back-up) worden geweigerd — dat zeggen we meteen.
    const bruikbaar = /mp4|webm/i.test(f.type) || /\.(mp4|webm)$/i.test(f.name)
    if (!bruikbaar) {
      setMsg(`Dit bestand (${f.name}) is geen mp4 of webm. Zet het eerst om, of plak een YouTube-link.`)
      return
    }
    if (mb > maxMb) {
      setMsg(`Deze video is ${Math.round(mb)} MB, meer dan de ${maxMb} MB die de server aanvaardt. Zet ze op YouTube en plak de link.`)
      return
    }
    // Mobiele data: een grote upload kost dan echt geld/tijd. Even bevestigen.
    const conn = (navigator as { connection?: { type?: string; effectiveType?: string; saveData?: boolean } }).connection
    const mobiel = conn?.type === 'cellular' || conn?.saveData === true
    if (mobiel && mb > 50 && !window.confirm(`Deze video is ${Math.round(mb)} MB en je zit op mobiele data. Toch uploaden?`)) {
      return
    }
    setMsg(null)
    setUpPct(0)
    setUpCam(camera)
    void uploadInStukken(f, camera)
  }

  /**
   * Het bestand in stukken naar de server duwen.
   *
   * Vroeger ging alles in één verzoek. Een wedstrijdvideo is honderden megabytes, dus dat is één
   * verbinding die minutenlang moet houden vanaf een telefoon — en viel die weg, dan was álles
   * weg met de melding "Uploaden mislukt (verbinding)", zonder dat je wist hoever je stond.
   *
   * Nu kost een hapering hoogstens één stuk: dat wordt een paar keer opnieuw geprobeerd, en wat
   * al aankwam blijft op de server staan. Kies je later hetzelfde bestand opnieuw, dan begint de
   * upload waar hij gebleven was in plaats van vooraan.
   */
  const uploadInStukken = async (f: File, camera: 1 | 2 = 1) => {
    const type = f.type || 'video/mp4'
    // Eén id per bestand (naam + grootte + wijzigingsdatum + camera), zodat hetzelfde bestand
    // opnieuw kiezen dezelfde upload voortzet en een ánder bestand een verse begint.
    const uploadId = await bestandsSleutel(f, matchId, camera)
    const camQ = camera === 2 ? '&camera=2' : ''

    // Staat er al iets van een vorige poging?
    let gedaan = 0
    try {
      const res = await fetch(`/api/match/${matchId}/video/upload?uploadId=${uploadId}${camQ}`, { credentials: 'include' })
      if (res.ok) gedaan = Number((await res.json()).bytes) || 0
    } catch {
      /* geen antwoord: gewoon vooraan beginnen */
    }
    if (gedaan > f.size) gedaan = 0
    if (gedaan > 0) setMsg(`Verdergaan waar de vorige poging stopte (${Math.round(gedaan / (1024 * 1024))} MB stond er al).`)

    const stukken = aantalStukken(f.size)
    for (let i = hervatVanafStuk(gedaan); i < stukken; i++) {
      const { van, tot } = stukBereik(i, f.size)
      const laatste = i === stukken - 1
      let gelukt = false
      for (let poging = 0; poging < POGINGEN_PER_STUK && !gelukt; poging++) {
        if (poging > 0) await new Promise((r) => setTimeout(r, wachtNaPoging(poging - 1)))
        try {
          const res = await fetch(`/api/match/${matchId}/video/upload?stuk=1${camQ}`, {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Content-Type': type,
              'x-upload-id': uploadId,
              'x-offset': String(van),
              ...(laatste ? { 'x-laatste-stuk': '1' } : {}),
            },
            body: f.slice(van, tot),
          })
          const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string; bytes?: number }
          if (res.status === 409 && typeof data.bytes === 'number') {
            // De server staat ergens anders dan wij dachten (een stuk kwam tóch aan, of net niet).
            // Meegaan met de server in plaats van blijven duwen.
            gedaan = data.bytes
            i = hervatVanafStuk(gedaan) - 1
            gelukt = true
            break
          }
          if (!res.ok) {
            // Een échte weigering (te groot, geen rechten) heeft geen zin om te herhalen.
            setUpPct(null)
            setMsg(data.error ?? 'Uploaden mislukt.')
            return
          }
          gedaan = typeof data.bytes === 'number' ? data.bytes : tot
          setUpPct(Math.round((gedaan / f.size) * 100))
          gelukt = true
          if (laatste && data.url) {
            setUpPct(null)
            if (camera === 2) {
              setUrl2(data.url)
              setMsg('Tweede camera geüpload. IJk nu het tijdsverschil met camera 1 ("IJk camera 2") en zet haar eigen veldkalibratie.')
            } else {
              setUrl(data.url)
              setDraftUrl(data.url)
              const melding = 'Video geüpload en gekoppeld. IJk nu de aftrap van elke helft.'
              setMsg(melding)
              parkeerMelding(melding)
            }
            // Zelfde reden als in save(): de vervolgstappen (kalibratie, server-analyse) zijn
            // serverblokken die er pas zijn als de server wéét dat er een video hangt.
            router.refresh()
            return
          }
        } catch {
          /* verbinding weg: zo dadelijk opnieuw, hetzelfde stuk */
        }
      }
      if (!gelukt) {
        setUpPct(null)
        setMsg(uploadFout(gedaan, f.size))
        return
      }
    }
  }

  const saveUrl = async () => {
    const next = draftUrl.trim()
    const melding = next ? 'Video gekoppeld.' : 'Video losgekoppeld.'
    const ok = await save({ videoUrl: next }, melding)
    if (ok) {
      setUrl(next)
      // Ook hier: was dit de éérste video (bv. een YouTube-link), dan verhuist het blok na de
      // refresh en moet de melding mee.
      if (next && !url) parkeerMelding(melding)
    }
  }

  // Sneltoetsen bij een videobestand: ←/→ 5 s, spatie speel/pauze. Niet wanneer je in een veld typt.
  useEffect(() => {
    if (!isFile) return
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return
      const v = videoRef.current
      if (!v) return
      if (e.key === 'ArrowLeft') { e.preventDefault(); v.currentTime = Math.max(0, v.currentTime - 5) }
      else if (e.key === 'ArrowRight') { e.preventDefault(); v.currentTime = v.currentTime + 5 }
      else if (e.key === ' ') { e.preventDefault(); if (v.paused) void v.play().catch(() => {}); else v.pause() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isFile])

  // Welk moment is nu in beeld? Enkel zinvol als we de positie echt kennen (videobestand).
  const activeIdx = isFile ? activeMomentIndex(moments, pos, sync, halfSeconds) : -1

  // ── Tijdlijnbalk: elke worp op zijn videotijd (aftrap van zijn helft + wedstrijdklok) ──
  const h2Geijkt = sync.offsetH2 != null
  const startH2 = sync.offsetH2 ?? sync.offsetH1 + halfSeconds
  const tijdlijn = useMemo(
    () => worpen.map((w) => ({ ...w, t: momentToVideo(w, sync, halfSeconds) })),
    [worpen, sync, halfSeconds],
  )
  // Schaal van de balk: de echte videoduur als we die kennen, anders het laatste moment + uitloop
  // (YouTube meldt zijn duur niet). CV-voorstellen tellen mee in de schaal: ook een wedstrijd
  // zonder manuele tags moet haar voorstellen op de balk kwijt kunnen.
  const tlEinde = useMemo(() => {
    if (dur != null && Number.isFinite(dur) && dur > 0) return dur
    const max = Math.max(
      tijdlijn.reduce((m, w) => Math.max(m, w.t), 0),
      voorstellen.reduce((m, v) => Math.max(m, v.videoTimeS), 0),
    )
    return max > 0 ? max + 30 : 0
  }, [dur, tijdlijn, voorstellen])
  const tlPct = useCallback(
    (seconds: number) => `${Math.max(0, Math.min(100, (seconds / tlEinde) * 100))}%`,
    [tlEinde],
  )
  // Sync-rapport: een event is pas écht gekoppeld als de aftrap van zijn helft geijkt is —
  // precies wat je moet weten om te zien of de kalibratie compleet is.
  const gekoppeld = worpen.filter((w) => (w.half >= 2 ? h2Geijkt : h1Geijkt)).length
  const heeftH1 = worpen.some((w) => w.half < 2)
  const heeftH2 = worpen.some((w) => w.half >= 2)

  if (!canEdit && !source) return null

  // Nog geen video? Dan is dit blok een uitnodiging, geen instellingenrij: grote uploadknop,
  // duidelijke titel, en de link-invoer als tweede keuze. Zonder dat viel de plek waar je een
  // opname toevoegt niet op tussen de rest van de analyse.
  const leeg = !source

  return (
    <section className={`an-card va${leeg && canEdit ? ' va-empty' : ''}`} id="video">
      <h2 className="an-h2">🎥 Video-analyse</h2>

      {canEdit && (
        <>
          {leeg && (
            <p className="va-lead">
              Nog geen opname bij deze wedstrijd. Voeg ze toe — daarna springt elk doelpunt
              hieronder rechtstreeks naar het juiste beeld.
            </p>
          )}
          <div className="va-setup">
            <label className={`va-btn va-upload${leeg ? ' primary' : ''}`}>
              {upPct === null ? '⬆ Video uploaden' : `Uploaden… ${upPct}%${upCam === 2 ? ' (camera 2)' : ''}`}
              <input
                type="file"
                accept="video/mp4,video/webm,video/*"
                disabled={upPct !== null}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  if (f) upload(f)
                }}
              />
            </label>
            <span className="va-of">of</span>
            <input
              className="va-url"
              type="url"
              inputMode="url"
              placeholder="YouTube-link of https://…/wedstrijd.mp4"
              value={draftUrl}
              onChange={(e) => setDraftUrl(e.target.value)}
              aria-label="Video-URL"
            />
            <button type="button" className="va-btn" onClick={() => void saveUrl()} disabled={busy || upPct !== null || draftUrl.trim() === url.trim()}>
              {url ? 'Bijwerken' : 'Koppelen'}
            </button>
          </div>
          {/* De tweede camera: pas zinvol als de hoofdopname er als bestand staat. Eén veld van
              46 m past zelden in één beeld — wie beide kanten filmt, hangt de tweede opname hier
              en ijkt daarna het tijdsverschil (knop bij de speler). */}
          {isFile && (
            <div className="va-setup">
              <label className="va-btn va-upload">
                {url2 ? '⬆ Tweede camera vervangen' : '⬆ Tweede camera (andere kant van het veld)'}
                <input
                  type="file"
                  accept="video/mp4,video/webm,video/*"
                  disabled={upPct !== null}
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    e.target.value = ''
                    if (f) upload(f, 2)
                  }}
                />
              </label>
              {url2 && (
                <button
                  type="button"
                  className="va-btn"
                  disabled={busy}
                  onClick={() => {
                    void save({ video2Url: null, video2OffsetS: null }, 'Tweede camera losgekoppeld.').then((ok) => {
                      if (ok) {
                        setUrl2('')
                        setOffset2(null)
                        setCam(1)
                      }
                    })
                  }}
                >
                  ✕ Loskoppelen
                </button>
              )}
            </div>
          )}
        </>
      )}

      {upPct !== null && (
        <>
          <div className="va-progress" role="progressbar" aria-valuenow={upPct} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${upPct}%` }} />
          </div>
          <p className="va-hint va-hint-sm">Hou de app open tot het uploaden klaar is.</p>
        </>
      )}

      {!source ? (
        canEdit ? null : (
          <p className="va-hint">Nog geen opname bij deze wedstrijd.</p>
        )
      ) : source.kind === 'link' ? (
        <p className="va-hint">
          Deze host laat insluiten niet toe.{' '}
          <a href={source.href} target="_blank" rel="noopener noreferrer">Open de video in een nieuw tabblad →</a>{' '}
          Gebruik een YouTube-link of een direct .mp4-bestand om hem hier te kunnen koppelen.
        </p>
      ) : (
        <>
          {/* Camerawissel: de tijdlijn en de markers blijven op camera 1; de speler toont wat
              jij wil zien. Springen werkt in beide — via het geijkte tijdsverschil. */}
          {isFile && isFile2 && (
            <div className="va-cams" role="tablist" aria-label="Welke camera">
              <button type="button" className={`va-btn small${cam === 1 ? ' aan' : ''}`} onClick={() => wisselCamera(1)}>
                🎥 Camera 1
              </button>
              <button type="button" className={`va-btn small${cam === 2 ? ' aan' : ''}`} onClick={() => wisselCamera(2)}>
                🎥 Camera 2
              </button>
              {offset2 == null && (
                <span className="va-hint va-hint-sm">tijdsverschil nog niet geijkt — springen tussen camera's is dan een gok</span>
              )}
            </div>
          )}
          <div className="va-player">
            {source.kind === 'file' ? (
              <video
                ref={videoRef}
                key={actieveSrc ?? 'geen'}
                className="va-video"
                src={actieveSrc ?? undefined}
                controls
                playsInline
                preload="metadata"
                onTimeUpdate={(e) => setPos(naarTijdlijn(e.currentTarget.currentTime))}
                onDurationChange={(e) => {
                  // Enkel camera 1 bepaalt de schaal van de tijdlijnbalk.
                  if (!kijkCam2) setDur(e.currentTarget.duration)
                }}
                onLoadedMetadata={(e) => {
                  // Na een camerawissel: op het overeenkomstige moment verdergaan.
                  if (wilNative.current != null) {
                    e.currentTarget.currentTime = wilNative.current
                    wilNative.current = null
                  }
                }}
              />
            ) : (
              <iframe
                key={ytSeek}
                className="va-video"
                src={youtubeEmbedAt(source.id, pos)}
                title="Wedstrijdvideo"
                allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
              />
            )}
          </div>

          {/* Tijdlijnbalk: alle worpen van de wedstrijd op hun videotijd. Klik = spring ernaartoe.
              Vorm/kleur per soort — doelpunten opvallend, de rest rustig. Zolang een helft niet
              geijkt is, staan haar markers halfdoorzichtig (positie = schatting). CvReview legt
              er de CV-voorstellenlaan boven en het reviewpaneel onder; zonder voorstellen rendert
              die enkel zijn children en blijft dit blok exact zoals het was. */}
          {(tijdlijn.length > 0 || voorstellen.length > 0) && tlEinde > 0 && (
            <div className="va-tl">
              <CvReview
                voorstellen={voorstellen}
                tlEinde={tlEinde}
                pos={pos}
                onSeek={seek}
                onFrameStap={isFile ? frameStap : undefined}
                // Het beeld bij elk voorstel wordt uit het bestand zelf gehaald; een
                // YouTube-speler laat zijn beeld niet uitlezen, dus daar blijft het bij het
                // tijdstip (zelfde grens als de kalibratie).
                videoSrc={isFile && source ? source.src : null}
                duurS={dur}
                video2Src={isFile2 && source2 ? source2.src : null}
                video2OffsetS={offset2}
              >
              <div className="va-tl-track" aria-label="Alle worpen op de videotijdlijn">
                <span className="va-tl-half" style={{ left: tlPct(sync.offsetH1) }} aria-hidden>
                  <span>{h1Geijkt ? 'H1' : '~H1'}</span>
                </span>
                <span className="va-tl-half" style={{ left: tlPct(startH2) }} aria-hidden>
                  <span>{h2Geijkt ? 'H2' : '~H2'}</span>
                </span>
                {isFile && <span className="va-tl-now" style={{ left: tlPct(pos) }} aria-hidden />}
                {tijdlijn.map((w, i) => {
                  const worpNaam = w.worpType === 'rug' ? 'rugworp' : 'nekworp'
                  const soort = w.uitkomst ?? worpNaam
                  const geschat = w.half >= 2 ? !h2Geijkt : !h1Geijkt
                  const buiten = isFile && dur != null && Number.isFinite(dur) && w.t > dur
                  const titel = `H${w.half} ${fmtVideoTime(w.gameClock)} · #${w.shirtNumber} ${worpNaam}${w.uitkomst ? ` · ${w.uitkomst}` : ''}`
                  return (
                    <button
                      key={`${w.half}-${w.gameClock}-${i}`}
                      type="button"
                      className={`va-tl-m ${soort}${geschat ? ' geschat' : ''}${buiten ? ' buiten' : ''}`}
                      style={{ left: tlPct(w.t) }}
                      title={titel}
                      aria-label={titel}
                      onClick={() => jumpTo(w)}
                    />
                  )
                })}
              </div>
              {tijdlijn.length > 0 && (
                <>
                  <div className="va-tl-legend" aria-hidden>
                    <span><i className="va-tl-key" /> nekworp</span>
                    <span><i className="va-tl-key rugworp" /> rugworp</span>
                    <span><i className="va-tl-key vangst" /> vangst</span>
                    <span><i className="va-tl-key doelpunt" /> doelpunt</span>
                  </div>
                  <p className="va-tl-sync">
                    <strong>{gekoppeld} van de {worpen.length}</strong>{' '}
                    {worpen.length === 1 ? 'event' : 'events'} gekoppeld aan de video.
                    {heeftH1 && !h1Geijkt
                      ? ' De 1e helft is nog niet geijkt — haar markers gaan uit van de videostart (0:00).'
                      : ''}
                    {heeftH2 && !h2Geijkt
                      ? ' De 2e helft is nog niet geijkt — haar markers zijn een schatting (aftrap H1 + één speelhelft).'
                      : ''}
                  </p>
                </>
              )}
              </CvReview>
            </div>
          )}

          <div className="va-bar">
            <span className="va-pos">
              {isFile ? `⏱ ${fmtVideoTime(pos)}` : `⏱ sprong naar ${fmtVideoTime(pos)}`}
            </span>
            {canEdit && (
              <span className="va-cal">
                <button
                  type="button"
                  className="va-btn small"
                  onClick={() => void calibrate(1)}
                  disabled={busy || (kijkCam2 && offset2 == null)}
                  title={kijkCam2 && offset2 == null ? 'IJk eerst het tijdsverschil van camera 2' : 'De video staat nu op de aftrap van de 1e helft'}
                >
                  IJk H1 hier
                </button>
                <button
                  type="button"
                  className="va-btn small"
                  onClick={() => void calibrate(2)}
                  disabled={busy || (kijkCam2 && offset2 == null)}
                  title={kijkCam2 && offset2 == null ? 'IJk eerst het tijdsverschil van camera 2' : 'De video staat nu op de aftrap van de 2e helft'}
                >
                  IJk H2 hier
                </button>
                {isFile2 && ijk2Start == null && (
                  <button
                    type="button"
                    className="va-btn small"
                    onClick={startIjk2}
                    disabled={busy}
                    title="Zet de speler op een herkenbaar moment (bv. de aftrap), klik hier, en zoek datzelfde moment daarna in camera 2"
                  >
                    IJk camera 2
                  </button>
                )}
                {isFile2 && ijk2Start != null && (
                  <>
                    <button
                      type="button"
                      className="va-btn small primary"
                      onClick={() => void bevestigIjk2()}
                      disabled={busy || cam !== 2}
                      title="Camera 2 staat nu op hetzelfde moment als waar je in camera 1 klikte"
                    >
                      Zelfde moment hier
                    </button>
                    <button type="button" className="va-btn small" onClick={() => setIjk2Start(null)} disabled={busy}>
                      annuleer
                    </button>
                  </>
                )}
              </span>
            )}
            <span className="va-synced">
              H1 {fmtVideoTime(sync.offsetH1)} · H2 {sync.offsetH2 == null ? 'geschat' : fmtVideoTime(sync.offsetH2)}
              {url2 ? ` · cam 2 ${offset2 == null ? 'niet geijkt' : `Δ ${offset2.toFixed(1)} s`}` : ''}
            </span>
          </div>

          {/* Bewaren op je telefoon en doorsturen — de twee dingen die je na de wedstrijd met de
              opname wil doen. Voor iedereen die de video mag zien, niet enkel de beheerder. */}
          {isFile && (
            <div className="va-take">
              {downloadHref && (
                <a className="va-btn small" href={downloadHref}>
                  ⬇ Download op je gsm
                </a>
              )}
              <button type="button" className="va-btn small" onClick={() => void shareVideo()}>
                📤 Delen (WhatsApp)
              </button>
            </div>
          )}

          {!isFile && (
            <p className="va-hint va-hint-sm">
              YouTube herstart bij elke sprong en meldt zijn positie niet — de lijst loopt dus niet mee.
              Een direct .mp4-bestand springt vloeiend én markeert het moment dat je bekijkt.
            </p>
          )}
        </>
      )}

      {msg && <p className="va-msg">{msg}</p>}

      {moments.length === 0 ? (
        <p className="va-hint">Nog geen doelpunten om naar te springen.</p>
      ) : (
        <ol className="va-moments">
          {moments.map((m, i) => (
            <li key={`${m.half}-${m.gameClock}-${i}`}>
              <button
                type="button"
                className={`va-moment side-${m.side}${i === activeIdx ? ' on' : ''}`}
                onClick={() => jumpTo(m)}
                disabled={!source || source.kind === 'link'}
              >
                <span className="va-moment-t">H{m.half} {fmtVideoTime(m.gameClock)}</span>
                <span className="va-moment-team">{m.side === 'home' ? teams.home : teams.away}</span>
                <span className="va-moment-lbl">{m.label}</span>
                {m.points ? <span className="va-moment-pts">+{m.points}</span> : null}
                <span className="va-moment-go" aria-hidden>▶</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
