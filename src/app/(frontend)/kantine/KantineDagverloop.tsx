'use client'

import { useCallback, useEffect, useId, useMemo, useState } from 'react'

import { KrachtbalIcon } from '@/components/KrachtbalIcon'
import { TeamLogo } from '@/components/TeamLogo'
import { DEFAULT_AWAY_COLOR, DEFAULT_HOME_COLOR, readableOnDark } from '@/lib/club-colors'
import type { DagSamenvatting, GolfPunt, WedstrijdVerhaal } from '@/lib/kantine-dagverhaal'
import { dagRol, duurVan, winnaar, type DagStap } from '@/lib/kantine-dagverloop'
import type { KantineLive } from '@/lib/kantine-channel'
import type { KantineMatch } from './KantineBoard'

type Foto = { id: number; matchId: number; url: string; authorName: string }
type DagData = { fotos: Foto[]; verhalen: WedstrijdVerhaal[]; samenvatting: DagSamenvatting | null }

// Het dagverloop: schermvullend zodra alle wedstrijden van vandaag gespeeld zijn. De volgorde van
// de beelden komt uit kantine-dagverloop.ts, het verhaal van elke wedstrijd uit
// kantine-dagverhaal.ts (via /api/kantine/dag); dit component tekent ze en telt de tijd af.
export function KantineDagverloop({ matches, live }: { matches: KantineMatch[]; live: Record<number, KantineLive> }) {
  const scoreVan = useCallback((m: KantineMatch) => live[m.id]?.score ?? m.score, [live])
  const idsSleutel = matches.map((m) => m.id).join(',')
  // Stabiel zolang dezelfde wedstrijden op het scherm staan (de poll geeft telkens een verse array).
  const ids = useMemo(() => (idsSleutel ? idsSleutel.split(',').map(Number) : []), [idsSleutel])

  // Verhalen, foto's en de samenvatting. Eén keer bij het begin en daarna elke minuut: wie na de
  // laatste wedstrijd nog een foto of bericht plaatst, komt er zo vanzelf bij.
  const [data, setData] = useState<DagData>({ fotos: [], verhalen: [], samenvatting: null })
  useEffect(() => {
    if (!idsSleutel) return
    let actief = true
    const laad = async () => {
      try {
        const r = await fetch(`/api/kantine/dag?ids=${idsSleutel}`, { cache: 'no-store' })
        if (!r.ok) return
        const d = (await r.json()) as Partial<DagData>
        const nieuw: DagData = { fotos: d.fotos ?? [], verhalen: d.verhalen ?? [], samenvatting: d.samenvatting ?? null }
        if (actief) setData((vorig) => (JSON.stringify(vorig) === JSON.stringify(nieuw) ? vorig : nieuw))
      } catch {
        // netwerkfout — de volgende ophaling probeert opnieuw; tot dan met wat we al hebben
      }
    }
    void laad()
    const t = setInterval(laad, 60_000)
    return () => {
      actief = false
      clearInterval(t)
    }
  }, [idsSleutel])

  // Een foto die niet laadt, slaan we voortaan over in plaats van een leeg vlak te tonen.
  const [kapot, setKapot] = useState<Set<number>>(new Set())
  const fotos = useMemo(() => data.fotos.filter((f) => !kapot.has(f.id)), [data.fotos, kapot])
  const verhaalVan = useMemo(() => new Map(data.verhalen.map((v) => [v.matchId, v])), [data.verhalen])
  const tribune = useMemo(
    () => data.verhalen.filter((v) => v.berichten.length > 0 || v.kudosTotaal > 0).map((v) => v.matchId),
    [data.verhalen],
  )

  // Waar we zitten: welke ronde (bepaalt welke foto's aan de beurt zijn) en welke stap daarin.
  const [pos, setPos] = useState({ ronde: 0, stap: 0 })
  const { ronde, stap } = pos
  const rol = useMemo(
    () => dagRol(ids, fotos, ronde, undefined, { cijfers: data.samenvatting != null, tribune }),
    [ids, fotos, ronde, data.samenvatting, tribune],
  )
  const huidig: DagStap = rol[Math.min(stap, rol.length - 1)] ?? { soort: 'overzicht' }

  // Na de laatste stap van een ronde begint de volgende, weer bij het overzicht.
  const verder = useCallback(() => {
    setPos((p) => (p.stap + 1 < rol.length ? { ronde: p.ronde, stap: p.stap + 1 } : { ronde: p.ronde + 1, stap: 0 }))
  }, [rol.length])

  useEffect(() => {
    const t = setTimeout(verder, duurVan(huidig))
    return () => clearTimeout(t)
  }, [huidig, verder])

  const fotoVan = (id: number) => fotos.find((f) => f.id === id) ?? null
  const matchVan = (id: number) => matches.find((m) => m.id === id) ?? null
  // De volgende foto alvast laden: zonder dat zie je bij elke wissel eerst een leeg vlak.
  const volgend = rol[stap + 1]
  const vooraf = volgend?.soort === 'foto' ? fotoVan(volgend.fotoId) : null
  const huidigeMatch = 'matchId' in huidig ? matchVan(huidig.matchId) : null
  const huidigVerhaal = huidigeMatch ? (verhaalVan.get(huidigeMatch.id) ?? null) : null

  return (
    <div className="kt-dag">
      {huidig.soort === 'overzicht' && <Overzicht matches={matches} scoreVan={scoreVan} verhaalVan={verhaalVan} />}
      {huidig.soort === 'cijfers' && data.samenvatting && <Cijfers s={data.samenvatting} matchVan={matchVan} scoreVan={scoreVan} />}
      {huidig.soort === 'wedstrijd' && huidigeMatch && (
        <Schijnwerper key={huidigeMatch.id} match={huidigeMatch} score={scoreVan(huidigeMatch)} verhaal={huidigVerhaal} />
      )}
      {huidig.soort === 'tribune' && huidigeMatch && huidigVerhaal && (
        <Tribune key={huidigeMatch.id} match={huidigeMatch} verhaal={huidigVerhaal} />
      )}
      {huidig.soort === 'foto' && fotoVan(huidig.fotoId) && (
        <DagFoto
          key={huidig.fotoId}
          foto={fotoVan(huidig.fotoId)!}
          match={huidigeMatch}
          opFout={() => {
            setKapot((k) => new Set(k).add(huidig.fotoId))
            verder()
          }}
        />
      )}
      {vooraf && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="kt-dag-vooraf" src={vooraf.url} alt="" aria-hidden />
      )}
    </div>
  )
}

const kleurHome = (m: KantineMatch) => readableOnDark(m.home.colors?.primary ?? DEFAULT_HOME_COLOR)
const kleurAway = (m: KantineMatch) => readableOnDark(m.away.colors?.primary ?? DEFAULT_AWAY_COLOR)
const kleuren = (m: KantineMatch) => ({ '--home': kleurHome(m), '--away': kleurAway(m) }) as React.CSSProperties

/**
 * Het scoreverloop als golf: boven de middellijn staat de thuisploeg voor, eronder de bezoekers.
 * Het vlak kleurt mee met wie er voorstaat, en de lijn tekent zich uit wanneer het beeld opkomt —
 * zo zie je in één oogopslag of het een wandeling was of een thriller.
 */
function Golf({ golf, duur, match, groot = false }: { golf: GolfPunt[]; duur: number; match: KantineMatch; groot?: boolean }) {
  const id = useId().replace(/:/g, '')
  if (golf.length < 2) return null
  const B = 1000
  const H = groot ? 260 : 120
  const mid = H / 2
  const piek = Math.max(3, ...golf.map((p) => Math.abs(p.diff)))
  const x = (t: number) => (Math.min(t, duur) / duur) * B
  const y = (diff: number) => mid - (diff / piek) * (mid - 6)
  // Trapvorm: de stand verandert pas op het moment van het doelpunt.
  let lijn = `M0,${mid}`
  let vorige = mid
  for (const p of golf.slice(1)) {
    lijn += ` L${x(p.t).toFixed(1)},${vorige.toFixed(1)} L${x(p.t).toFixed(1)},${y(p.diff).toFixed(1)}`
    vorige = y(p.diff)
  }
  lijn += ` L${B},${vorige.toFixed(1)}`
  const vlak = `${lijn} L${B},${mid} L0,${mid} Z`
  return (
    <svg className={`kt-golf${groot ? ' groot' : ''}`} viewBox={`0 0 ${B} ${H}`} preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2={H} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={kleurHome(match)} stopOpacity="0.75" />
          <stop offset="0.5" stopColor={kleurHome(match)} stopOpacity="0.15" />
          <stop offset="0.5" stopColor={kleurAway(match)} stopOpacity="0.15" />
          <stop offset="1" stopColor={kleurAway(match)} stopOpacity="0.75" />
        </linearGradient>
      </defs>
      <line x1="0" x2={B} y1={mid} y2={mid} className="kt-golf-nul" />
      <line x1={B / 2} x2={B / 2} y1="0" y2={H} className="kt-golf-rust" />
      <path d={vlak} fill={`url(#g${id})`} className="kt-golf-vlak" />
      <path d={lijn} pathLength={1} className="kt-golf-lijn" />
    </svg>
  )
}

/** Telt op van 0 tot de waarde wanneer het beeld opkomt. */
function Teller({ waarde }: { waarde: number }) {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setN(waarde)
      return
    }
    const start = performance.now()
    let raf = 0
    const tik = (nu: number) => {
      const f = Math.min(1, (nu - start) / 1200)
      setN(Math.round(waarde * (1 - Math.pow(1 - f, 3))))
      if (f < 1) raf = requestAnimationFrame(tik)
    }
    raf = requestAnimationFrame(tik)
    return () => cancelAnimationFrame(raf)
  }, [waarde])
  return <>{n}</>
}

/** Alle uitslagen van vandaag naast elkaar, in de volgorde waarin ze gespeeld werden. */
function Overzicht({
  matches,
  scoreVan,
  verhaalVan,
}: {
  matches: KantineMatch[]
  scoreVan: (m: KantineMatch) => { home: number; away: number }
  verhaalVan: Map<number, WedstrijdVerhaal>
}) {
  const n = matches.length
  // Geen lege vakken: drie wedstrijden naast elkaar i.p.v. twee plus een gat. Hoe minder kaarten,
  // hoe groter alles erop.
  const cols = n <= 3 ? Math.max(1, n) : n === 4 ? 2 : n <= 9 ? 3 : 4
  const grootte = n <= 3 ? 'clamp(16px, 3.2vmin, 38px)' : n <= 6 ? 'clamp(14px, 2.6vmin, 30px)' : 'clamp(12px, 2vmin, 24px)'
  const logo = n <= 3 ? 'clamp(64px, 11vmin, 150px)' : n <= 6 ? 'clamp(52px, 8vmin, 116px)' : 'clamp(40px, 6vmin, 90px)'
  return (
    <div className="kt-dag-overzicht">
      <p className="kt-dag-kop">🏁 Alle wedstrijden van vandaag zijn gespeeld</p>
      <div className="kt-dag-raster" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, fontSize: grootte }}>
        {matches.map((m, i) => {
          const score = scoreVan(m)
          const w = winnaar(score)
          const v = verhaalVan.get(m.id)
          return (
            <div key={m.id} className="kt-dag-kaart" style={{ ...kleuren(m), animationDelay: `${i * 90}ms` }}>
              <span className="kt-dag-kaart-reeks">{m.reeks}</span>
              <span className="kt-dag-kaart-rij">
                <span className={`kt-dag-logo${w === 'away' ? ' verloren' : ''}`}>
                  <TeamLogo name={m.home.name} logoUrl={m.home.logoUrl} logoFit={m.home.logoFit} side="home" size={logo} ringColor={m.home.colors?.primary} />
                </span>
                <span className="kt-dag-kaart-score">{score.home} – {score.away}</span>
                <span className={`kt-dag-logo${w === 'home' ? ' verloren' : ''}`}>
                  <TeamLogo name={m.away.name} logoUrl={m.away.logoUrl} logoFit={m.away.logoFit} side="away" size={logo} ringColor={m.away.colors?.primary} />
                </span>
              </span>
              {v && v.golf.length > 1 && <Golf golf={v.golf} duur={v.duur} match={m} />}
              <span className="kt-dag-kaart-uur">{m.time}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** De dag samengevat: de grote getallen, en de wedstrijden die eruit sprongen. */
function Cijfers({
  s,
  matchVan,
  scoreVan,
}: {
  s: DagSamenvatting
  matchVan: (id: number) => KantineMatch | null
  scoreVan: (m: KantineMatch) => { home: number; away: number }
}) {
  const affiche = (id: number) => {
    const m = matchVan(id)
    return m ? `${m.home.name} – ${m.away.name}` : ''
  }
  const tegels = [
    { label: s.wedstrijden === 1 ? 'wedstrijd' : 'wedstrijden', waarde: s.wedstrijden },
    { label: 'doelpunten', waarde: s.doelpunten },
    { label: s.kudos === 1 ? 'reactie' : 'reacties', waarde: s.kudos },
    { label: s.berichten === 1 ? 'bericht' : 'berichten', waarde: s.berichten },
    { label: s.fotos === 1 ? 'foto' : "foto's", waarde: s.fotos },
  ].filter((t, i) => i < 2 || t.waarde > 0)

  const hoogtepunten: { ico: string; titel: string; tekst: string }[] = []
  if (s.spannendste) hoogtepunten.push({ ico: '🎢', titel: 'Spannendste wedstrijd', tekst: `${affiche(s.spannendste.matchId)} · de leiding wisselde ${s.spannendste.wissels}×` })
  if (s.grootsteZege) {
    const m = matchVan(s.grootsteZege.matchId)
    const w = m ? winnaar(scoreVan(m)) : null
    const naam = m && w ? (w === 'home' ? m.home.name : m.away.name) : affiche(s.grootsteZege.matchId)
    hoogtepunten.push({ ico: '💥', titel: 'Grootste zege', tekst: `${naam} · +${s.grootsteZege.verschil}` })
  }
  if (s.topscorer) hoogtepunten.push({ ico: '🎯', titel: 'Topschutter van de dag', tekst: `${s.topscorer.naam} · ${s.topscorer.punten} punten` })
  if (s.meesteKudos) hoogtepunten.push({ ico: '📣', titel: 'Luidste tribune', tekst: `${affiche(s.meesteKudos.matchId)} · ${s.meesteKudos.aantal} reacties` })

  return (
    <div className="kt-dag-cijfers">
      <p className="kt-dag-kop">📊 De dag in cijfers</p>
      <div className="kt-dag-tegels">
        {tegels.map((t, i) => (
          <div key={t.label} className="kt-dag-tegel" style={{ animationDelay: `${i * 120}ms` }}>
            <span className="kt-dag-tegel-getal"><Teller waarde={t.waarde} /></span>
            <span className="kt-dag-tegel-label">{t.label}</span>
          </div>
        ))}
      </div>
      {hoogtepunten.length > 0 && (
        <div className="kt-dag-hoogte">
          {hoogtepunten.map((h, i) => (
            <div key={h.titel} className="kt-dag-hoogtepunt" style={{ animationDelay: `${600 + i * 450}ms` }}>
              <span className="kt-dag-hoogtepunt-ico" aria-hidden>{h.ico}</span>
              <span>
                <span className="kt-dag-hoogtepunt-titel">{h.titel}</span>
                <span className="kt-dag-hoogtepunt-tekst">{h.tekst}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Eén wedstrijd schermvullend: de krantenkop, de stand, de golf van het verloop en wie opviel. */
function Schijnwerper({ match, score, verhaal }: { match: KantineMatch; score: { home: number; away: number }; verhaal: WedstrijdVerhaal | null }) {
  const w = winnaar(score)
  const naamVan = (side: 'home' | 'away') => (side === 'home' ? match.home.name : match.away.name)
  const chips: { ico: string; tekst: string }[] = []
  if (verhaal?.topscorer) chips.push({ ico: '🎯', tekst: `${verhaal.topscorer.naam} · ${verhaal.topscorer.punten} ptn` })
  if (verhaal?.mvp) chips.push({ ico: '🏅', tekst: `Held van de match: ${verhaal.mvp.naam}` })
  if (verhaal?.langsteReeks) chips.push({ ico: '🔥', tekst: `${verhaal.langsteReeks.lengte} op rij voor ${naamVan(verhaal.langsteReeks.side)}` })
  if (verhaal && verhaal.leidingWissels > 1) chips.push({ ico: '🎢', tekst: `Leiding ${verhaal.leidingWissels}× gewisseld` })
  if (verhaal?.kijkers) chips.push({ ico: '👀', tekst: `${verhaal.kijkers} kijkers tegelijk` })
  return (
    <div className="kt-dag-spot" style={kleuren(match)}>
      <p className="kt-dag-spot-kop">
        {match.reeks} <span className="kt-dag-spot-uur">· {match.time}</span>
      </p>
      {verhaal?.kop && <h2 className="kt-dag-spot-krant">{verhaal.kop}</h2>}
      <div className="kt-dag-spot-rij">
        <div className={`kt-dag-spot-ploeg home${w === 'home' ? ' wint' : w === 'away' ? ' verliest' : ''}`}>
          <TeamLogo name={match.home.name} logoUrl={match.home.logoUrl} logoFit={match.home.logoFit} side="home" size="clamp(90px, 18vmin, 230px)" ringColor={match.home.colors?.primary} />
          <span className="kt-dag-spot-naam">{match.home.name}</span>
        </div>
        <div className="kt-dag-spot-score">
          {score.home} – {score.away}
        </div>
        <div className={`kt-dag-spot-ploeg away${w === 'away' ? ' wint' : w === 'home' ? ' verliest' : ''}`}>
          <TeamLogo name={match.away.name} logoUrl={match.away.logoUrl} logoFit={match.away.logoFit} side="away" size="clamp(90px, 18vmin, 230px)" ringColor={match.away.colors?.primary} />
          <span className="kt-dag-spot-naam">{match.away.name}</span>
        </div>
      </div>
      {verhaal && verhaal.golf.length > 1 && (
        <div className="kt-dag-spot-golf">
          <Golf golf={verhaal.golf} duur={verhaal.duur} match={match} groot />
          <span className="kt-golf-legende">
            <span style={{ color: kleurHome(match) }}>▲ {match.home.name} voor</span>
            <span>rust</span>
            <span style={{ color: kleurAway(match) }}>▼ {match.away.name} voor</span>
          </span>
        </div>
      )}
      {verhaal?.inleiding && <p className="kt-dag-spot-verhaal">{verhaal.inleiding}</p>}
      {chips.length > 0 ? (
        <div className="kt-dag-chips">
          {chips.map((c, i) => (
            <span key={c.tekst} className="kt-dag-chip" style={{ animationDelay: `${900 + i * 300}ms` }}>
              <span aria-hidden>{c.ico}</span> {c.tekst}
            </span>
          ))}
        </div>
      ) : (
        <p className="kt-dag-spot-onder">{w ? `🏆 ${naamVan(w)} wint` : '🤝 Gelijkspel'}</p>
      )}
    </div>
  )
}

const KUDOS_GLYPH: Record<string, string> = { clap: '👏', fire: '🔥', heart: '❤️', wow: '😮', rocket: '🚀' }

/** Wat de tribune zei: de berichten verschijnen één voor één, met de reacties eronder. */
function Tribune({ match, verhaal }: { match: KantineMatch; verhaal: WedstrijdVerhaal }) {
  return (
    <div className="kt-dag-tribune" style={kleuren(match)}>
      <p className="kt-dag-kop">
        💬 Uit de tribune <span className="kt-dag-tribune-affiche">· {match.home.name} – {match.away.name}</span>
      </p>
      {verhaal.berichten.length > 0 && (
        <div className="kt-dag-ballonnen">
          {verhaal.berichten.map((b, i) => (
            <div key={`${b.naam}-${i}`} className={`kt-dag-ballon${i % 2 ? ' rechts' : ''}`} style={{ animationDelay: `${300 + i * 900}ms` }}>
              <span className="kt-dag-ballon-tekst">{b.tekst}</span>
              <span className="kt-dag-ballon-naam">— {b.naam}</span>
            </div>
          ))}
        </div>
      )}
      {verhaal.kudos.length > 0 && (
        <div className="kt-dag-kudos">
          {verhaal.kudos.map((k) => (
            <span key={k.soort} className="kt-dag-kudo">
              <span className="kt-dag-kudo-ico" aria-hidden>
                {k.soort === 'goal' ? <KrachtbalIcon size="1em" kleur="wit" /> : (KUDOS_GLYPH[k.soort] ?? '👏')}
              </span>
              <span className="kt-dag-kudo-getal"><Teller waarde={k.aantal} /></span>
            </span>
          ))}
          {verhaal.kijkers && (
            <span className="kt-dag-kudo kijkers">
              👀 <Teller waarde={verhaal.kijkers} /> kijkers
            </span>
          )}
        </div>
      )}
    </div>
  )
}

/** Een supportersfoto schermvullend, met de inzender en de wedstrijd eronder. */
function DagFoto({ foto, match, opFout }: { foto: Foto; match: KantineMatch | null; opFout: () => void }) {
  return (
    <div className="kt-dag-foto">
      <div className="kt-dag-foto-kader">
        {/* eslint-disable-next-line @next/next/no-img-element -- eigen bestandsroute; next/image
            kan die niet optimaliseren. */}
        <img src={foto.url} alt={`Foto van ${foto.authorName}`} onError={opFout} />
      </div>
      <p className="kt-dag-foto-onder">
        📷 <b>{foto.authorName}</b>
        {match && (
          <span className="kt-dag-foto-match">
            {match.reeks} · {match.home.name} – {match.away.name}
          </span>
        )}
      </p>
    </div>
  )
}
