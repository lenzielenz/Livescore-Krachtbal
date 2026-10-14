'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { TeamLogo } from '@/components/TeamLogo'
import { DEFAULT_AWAY_COLOR, DEFAULT_HOME_COLOR, readableOnDark } from '@/lib/club-colors'
import { dagRol, duurVan, winnaar, type DagStap } from '@/lib/kantine-dagverloop'
import type { KantineLive } from '@/lib/kantine-channel'
import type { KantineMatch } from './KantineBoard'

type Foto = { id: number; matchId: number; url: string; authorName: string }

// Het dagverloop: schermvullend zodra alle wedstrijden van vandaag gespeeld zijn. De volgorde van
// de beelden komt uit kantine-dagverloop.ts; dit component tekent ze en telt de tijd af.
export function KantineDagverloop({ matches, live }: { matches: KantineMatch[]; live: Record<number, KantineLive> }) {
  const scoreVan = useCallback((m: KantineMatch) => live[m.id]?.score ?? m.score, [live])
  const idsSleutel = matches.map((m) => m.id).join(',')
  // Stabiel zolang dezelfde wedstrijden op het scherm staan (de poll geeft telkens een verse array).
  const ids = useMemo(() => (idsSleutel ? idsSleutel.split(',').map(Number) : []), [idsSleutel])

  // De foto's van vandaag. Eén keer bij het begin en daarna elke minuut: wie na de laatste
  // wedstrijd nog een foto plaatst, komt er zo vanzelf bij.
  const [fotos, setFotos] = useState<Foto[]>([])
  useEffect(() => {
    if (!idsSleutel) return
    let actief = true
    const laad = async () => {
      try {
        const r = await fetch(`/api/kantine/fotos?ids=${idsSleutel}`, { cache: 'no-store' })
        if (!r.ok) return
        const d = (await r.json()) as { fotos?: Foto[] }
        if (actief) setFotos((vorig) => (JSON.stringify(vorig) === JSON.stringify(d.fotos ?? []) ? vorig : (d.fotos ?? [])))
      } catch {
        // netwerkfout — de volgende ophaling probeert opnieuw; tot dan zonder foto's
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
  const bruikbaar = useMemo(() => fotos.filter((f) => !kapot.has(f.id)), [fotos, kapot])

  // Waar we zitten: welke ronde (bepaalt welke foto's aan de beurt zijn) en welke stap daarin.
  const [pos, setPos] = useState({ ronde: 0, stap: 0 })
  const { ronde, stap } = pos
  const rol = useMemo(() => dagRol(ids, bruikbaar, ronde), [ids, bruikbaar, ronde])
  const huidig: DagStap = rol[Math.min(stap, rol.length - 1)] ?? { soort: 'overzicht' }

  // Na de laatste stap van een ronde begint de volgende, weer bij het overzicht.
  const verder = useCallback(() => {
    setPos((p) => (p.stap + 1 < rol.length ? { ronde: p.ronde, stap: p.stap + 1 } : { ronde: p.ronde + 1, stap: 0 }))
  }, [rol.length])

  useEffect(() => {
    const t = setTimeout(verder, duurVan(huidig))
    return () => clearTimeout(t)
  }, [huidig, verder])

  const fotoVan = (id: number) => bruikbaar.find((f) => f.id === id) ?? null
  const matchVan = (id: number) => matches.find((m) => m.id === id) ?? null
  // De volgende foto alvast laden: zonder dat zie je bij elke wissel eerst een leeg vlak.
  const volgend = rol[stap + 1]
  const vooraf = volgend?.soort === 'foto' ? fotoVan(volgend.fotoId) : null

  return (
    <div className="kt-dag">
      {huidig.soort === 'overzicht' && <Overzicht matches={matches} scoreVan={scoreVan} />}
      {huidig.soort === 'wedstrijd' && matchVan(huidig.matchId) && (
        <Schijnwerper key={huidig.matchId} match={matchVan(huidig.matchId)!} score={scoreVan(matchVan(huidig.matchId)!)} />
      )}
      {huidig.soort === 'foto' && fotoVan(huidig.fotoId) && (
        <DagFoto
          key={huidig.fotoId}
          foto={fotoVan(huidig.fotoId)!}
          match={matchVan(huidig.matchId)}
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

const kleuren = (m: KantineMatch) =>
  ({
    '--home': readableOnDark(m.home.colors?.primary ?? DEFAULT_HOME_COLOR),
    '--away': readableOnDark(m.away.colors?.primary ?? DEFAULT_AWAY_COLOR),
  }) as React.CSSProperties

/** Alle uitslagen van vandaag naast elkaar, in de volgorde waarin ze gespeeld werden. */
function Overzicht({ matches, scoreVan }: { matches: KantineMatch[]; scoreVan: (m: KantineMatch) => { home: number; away: number } }) {
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
              <span className="kt-dag-kaart-uur">{m.time}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Eén wedstrijd schermvullend: groot, met de namen erbij — hier is er wél plaats voor. */
function Schijnwerper({ match, score }: { match: KantineMatch; score: { home: number; away: number } }) {
  const w = winnaar(score)
  const winnaarNaam = w === 'home' ? match.home.name : w === 'away' ? match.away.name : null
  return (
    <div className="kt-dag-spot" style={kleuren(match)}>
      <p className="kt-dag-spot-kop">
        {match.reeks} <span className="kt-dag-spot-uur">· {match.time}</span>
      </p>
      <div className="kt-dag-spot-rij">
        <div className={`kt-dag-spot-ploeg home${w === 'home' ? ' wint' : w === 'away' ? ' verliest' : ''}`}>
          <TeamLogo name={match.home.name} logoUrl={match.home.logoUrl} logoFit={match.home.logoFit} side="home" size="clamp(110px, 24vmin, 300px)" ringColor={match.home.colors?.primary} />
          <span className="kt-dag-spot-naam">{match.home.name}</span>
        </div>
        <div className="kt-dag-spot-score">
          {score.home} – {score.away}
        </div>
        <div className={`kt-dag-spot-ploeg away${w === 'away' ? ' wint' : w === 'home' ? ' verliest' : ''}`}>
          <TeamLogo name={match.away.name} logoUrl={match.away.logoUrl} logoFit={match.away.logoFit} side="away" size="clamp(110px, 24vmin, 300px)" ringColor={match.away.colors?.primary} />
          <span className="kt-dag-spot-naam">{match.away.name}</span>
        </div>
      </div>
      <p className="kt-dag-spot-onder">{winnaarNaam ? `🏆 ${winnaarNaam} wint` : '🤝 Gelijkspel'}</p>
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
