'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'

import { buildBracket, nextPow2, seededSlots, shuffle } from '@/lib/tournament'

type Method = 'auto' | 'manual'

// Loting-preview: hoe spelen de ploegen in ronde 1 (incl. bye's) bij de huidige (seed)volgorde?
function previewRound1(orderedNames: string[]): { home: string | null; away: string | null }[] {
  if (orderedNames.length < 2) return []
  const slots = seededSlots(orderedNames)
  return buildBracket(slots)
    .filter((m) => m.round === 1 && m.bracket === 'main')
    .map((m) => ({ home: m.home, away: m.away }))
}

type TeamOpt = { id: number; name: string; category: string; clubId: number | null; clubName: string }

export function NewTournament({
  categories,
  clubs = [],
  teams = [],
}: {
  categories: ReadonlyArray<{ label: string; value: string }>
  clubs?: { id: number; name: string }[]
  teams?: TeamOpt[]
}) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [category, setCategory] = useState(categories[categories.length - 1]?.value ?? 'senioren')
  const [count, setCount] = useState(4)
  const [names, setNames] = useState<string[]>(['', '', '', ''])
  // Expliciete club per ploeg (optioneel): betrouwbaar logo + de club is gekoppeld.
  const [clubIds, setClubIds] = useState<(number | null)[]>(() => Array(4).fill(null))
  // Koppeling naar een echte ploeg (met spelers) per slot — dan gebruikt de aantekentafel hetzelfde
  // aantekenblad als een gewone wedstrijd. null = vrije tekst (geen spelers).
  const [teamIds, setTeamIds] = useState<(number | null)[]>(() => Array(4).fill(null))
  // Geplaatste ploegen (vrijstelling): bv. de top van vorig seizoen. Zij worden uit elkaar geloot
  // en krijgen de bye's, zodat de sterke ploegen elkaar pas laat (finale) tegenkomen.
  const [seeded, setSeeded] = useState<boolean[]>(() => Array(4).fill(false))
  const [method, setMethod] = useState<Method>('auto')
  const [format, setFormat] = useState<'knockout' | 'roundrobin'>('knockout')
  const [toonOpLive, setToonOpLive] = useState(true)
  // Hoofdgroep/tornooidag (bv. "Beker van Brugge"): reeksen met dezelfde groep delen één
  // publieke groepspagina en één zelfaanpassend kantinescherm.
  const [groep, setGroep] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const setCountSafe = (n: number) => {
    const c = Math.max(2, Math.min(32, Math.floor(n) || 2))
    setCount(c)
    setNames((prev) => {
      const next = prev.slice(0, c)
      while (next.length < c) next.push('')
      return next
    })
    setSeeded((prev) => {
      const next = prev.slice(0, c)
      while (next.length < c) next.push(false)
      return next
    })
    setClubIds((prev) => {
      const next = prev.slice(0, c)
      while (next.length < c) next.push(null)
      return next
    })
    setTeamIds((prev) => {
      const next = prev.slice(0, c)
      while (next.length < c) next.push(null)
      return next
    })
  }

  // Vrije tekst aanpassen verbreekt de ploegkoppeling (de naam komt dan niet meer overeen).
  const setNameAt = (i: number, v: string) => {
    setNames((prev) => prev.map((n, idx) => (idx === i ? v : n)))
    setTeamIds((prev) => prev.map((t, idx) => (idx === i ? null : t)))
  }
  const setClubAt = (i: number, v: number | null) => setClubIds((prev) => prev.map((c, idx) => (idx === i ? v : c)))
  // Een echte ploeg kiezen: vult de naam + koppelt de ploeg (en de club voor het logo).
  const pickTeam = (i: number, teamId: number | null) => {
    const t = teamId ? teams.find((x) => x.id === teamId) ?? null : null
    setTeamIds((prev) => prev.map((v, idx) => (idx === i ? (t ? t.id : null) : v)))
    if (t) {
      setNames((prev) => prev.map((n, idx) => (idx === i ? t.name : n)))
      if (t.clubId) setClubIds((prev) => prev.map((c, idx) => (idx === i ? t.clubId : c)))
    }
  }
  const toggleSeed = (i: number) => setSeeded((prev) => prev.map((s, idx) => (idx === i ? !s : s)))

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= names.length) return
    setClubIds((prev) => { const next = prev.slice(); [next[i], next[j]] = [next[j], next[i]]; return next })
    setTeamIds((prev) => { const next = prev.slice(); [next[i], next[j]] = [next[j], next[i]]; return next })
    setNames((prev) => { const next = prev.slice(); [next[i], next[j]] = [next[j], next[i]]; return next })
    setSeeded((prev) => { const next = prev.slice(); [next[i], next[j]] = [next[j], next[i]]; return next })
  }

  // Geplaatste ploegen eerst (in ingegeven volgorde = seed-volgorde), dan de rest.
  const orderedNames = (shuffleRest: boolean): string[] => {
    const entries = names.map((nm, i) => ({ name: nm.trim(), seed: seeded[i] })).filter((e) => e.name)
    const top = entries.filter((e) => e.seed).map((e) => e.name)
    const restRaw = entries.filter((e) => !e.seed).map((e) => e.name)
    const rest = shuffleRest ? shuffle(restRaw, Math.random) : restRaw
    return [...top, ...rest]
  }

  // Ploegen van de gekozen categorie eerst (handig kiezen), daarna de rest — alfabetisch.
  const sortedTeams = useMemo(
    () =>
      [...teams].sort(
        (a, b) =>
          (a.category === category ? 0 : 1) - (b.category === category ? 0 : 1) ||
          a.name.localeCompare(b.name),
      ),
    [teams, category],
  )

  const filledCount = names.filter((n) => n.trim()).length
  const seededCount = names.filter((n, i) => n.trim() && seeded[i]).length
  const bracketSize = useMemo(() => (filledCount >= 2 ? nextPow2(filledCount) : 0), [filledCount])
  const byes = bracketSize > 0 ? bracketSize - filledCount : 0
  // Preview deterministisch (geplaatst eerst, rest in ingegeven volgorde) zodat je de bye's/seeding ziet.
  const preview = useMemo(() => previewRound1(orderedNames(false)), [names, seeded])

  const submit = async () => {
    setError(null)
    const filled = names.map((n) => n.trim()).filter(Boolean)
    if (!name.trim()) return setError('Geef het tornooi een naam.')
    if (filled.length < 2) return setError('Vul minstens 2 ploegnamen in.')
    if (new Set(filled.map((n) => n.toLowerCase())).size !== filled.length)
      return setError('Twee ploegen hebben dezelfde naam. Schrijft dezelfde club meerdere ploegen in, geef ze dan een nummer (bv. KBC Male 1 en KBC Male 2).')

    // Round-robin: alle ploegen één keer tegen elkaar — geen loting/bye's, namen volstaan.
    // Knock-out: geplaatste ploegen worden geseed (bye's + uit elkaar = sterke finale); de toggle
    // schudt de overige ploegen, manueel houdt de ingegeven volgorde aan.
    const slots = format === 'roundrobin' ? filled : seededSlots(orderedNames(method === 'auto'))
    // Expliciete club-koppeling per ingevulde ploeg (optioneel).
    const teamClubs = names
      .map((nm, i) => ({ name: nm.trim(), clubId: clubIds[i] }))
      .filter((t): t is { name: string; clubId: number } => Boolean(t.name && t.clubId))
    // Koppeling naar echte ploegen (met spelers) per ingevulde ploeg (optioneel).
    const teamTeams = names
      .map((nm, i) => ({ name: nm.trim(), teamId: teamIds[i] }))
      .filter((t): t is { name: string; teamId: number } => Boolean(t.name && t.teamId))

    setBusy(true)
    try {
      const res = await fetch('/api/tournament', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), category, method, format, slots, teamClubs, teamTeams, toonOpLive, groep: groep.trim() }),
      })
      const data = (await res.json()) as { id?: number; error?: string }
      if (!res.ok || !data.id) throw new Error(data.error ?? 'Aanmaken mislukt.')
      router.push(`/tornooi/${data.id}`)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <main className="trn-new">
      <section className="trn-card">
        <h2>1 · Gegevens</h2>
        <label className="trn-field">
          <span>Naam van het tornooi</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Bv. Beker van Brugge — U14" />
        </label>
        <label className="trn-field">
          <span>Hoofdgroep / tornooidag (optioneel)</span>
          <input value={groep} onChange={(e) => setGroep(e.target.value)} placeholder='Bv. "Beker van Brugge" — bundelt alle reeksen van die dag' />
          <small className="trn-field-hint">Reeksen met dezelfde groepsnaam delen één publieke pagina en één kantinescherm dat zichzelf de hele dag aanpast.</small>
        </label>
        <div className="trn-row2">
          <label className="trn-field">
            <span>Leeftijdscategorie (bepaalt de regels)</span>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {categories.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="trn-field">
            <span>Aantal ploegen</span>
            <div className="trn-stepper">
              <button type="button" onClick={() => setCountSafe(count - 1)} aria-label="Minder">−</button>
              <input
                type="number"
                min={2}
                max={32}
                value={count}
                onChange={(e) => setCountSafe(Number(e.target.value))}
              />
              <button type="button" onClick={() => setCountSafe(count + 1)} aria-label="Meer">+</button>
            </div>
          </label>
        </div>
        <div className="trn-methods" style={{ marginTop: 14 }}>
          <button type="button" className={`trn-method ${format === 'knockout' ? 'on' : ''}`} onClick={() => setFormat('knockout')}>
            <strong>Knock-out</strong>
            <span>Afvalrace met finale (en kleine finale).</span>
          </button>
          <button type="button" className={`trn-method ${format === 'roundrobin' ? 'on' : ''}`} onClick={() => setFormat('roundrobin')}>
            <strong>Iedereen tegen elkaar</strong>
            <span>Poule met rangschikking — winst 4, gelijk 3, verlies 2.</span>
          </button>
        </div>
        <label className="trn-livecheck" style={{ marginTop: 14 }}>
          <input type="checkbox" checked={toonOpLive} onChange={(e) => setToonOpLive(e.target.checked)} />
          <span>📺 Tonen op de live-pagina <small>de lopende wedstrijden van deze beker verschijnen bovenaan de live-pagina</small></span>
        </label>
      </section>

      <section className="trn-card">
        <h2>2 · Ploegen invullen</h2>
        <p className="trn-hint trn-hint-sub">
          {teams.length > 0
            ? <>Kies een <strong>echte ploeg</strong> waar mogelijk — dan tekent de aantekentafel met de echte spelerslijst aan (scorerkeuze, wissels), net als bij een gewone wedstrijd. Of typ een vrije naam voor een gastploeg.</>
            : <>Dezelfde club mag meerdere ploegen inschrijven — nummer ze dan (bv. <strong>KBC Male 1</strong> en <strong>KBC Male 2</strong>). Het clublogo verschijnt automatisch.</>}
        </p>
        {format === 'knockout' && (
          <p className="trn-hint trn-hint-sub">
            ⭐ Duid de <strong>geplaatste ploegen</strong> aan (bv. de top van vorig seizoen). Zij krijgen een vrijstelling (bye)
            en worden uit elkaar geloot, zodat de sterkste ploegen elkaar pas in de finale tegenkomen.
          </p>
        )}
        <p className="trn-hint">
          {filledCount < 2
            ? 'Vul de ploegnamen in.'
            : format === 'roundrobin'
              ? `${filledCount} ploegen · ${(filledCount * (filledCount - 1)) / 2} wedstrijden (iedereen één keer tegen elkaar)`
              : `Schema van ${bracketSize} · ${byes > 0 ? `${byes} bye(s)${seededCount > 0 ? ' (naar de geplaatste ploegen)' : ''}` : 'geen bye’s'}`}
        </p>
        <ol className="trn-teamlist">
          {names.map((n, i) => (
            <li key={i}>
              <span className="trn-teamnr">{i + 1}</span>
              {teams.length > 0 && (
                <select
                  className="trn-teampick"
                  value={teamIds[i] ?? ''}
                  onChange={(e) => pickTeam(i, e.target.value ? Number(e.target.value) : null)}
                  title="Koppel een echte ploeg (met spelers) — of laat leeg voor een vrije naam"
                  aria-label="Ploeg"
                >
                  <option value="">— ploeg kiezen —</option>
                  {sortedTeams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.clubName && t.clubName !== t.name ? `${t.clubName} · ${t.name}` : t.name}
                      {t.category && t.category !== category ? ` (${t.category})` : ''}
                    </option>
                  ))}
                </select>
              )}
              <input value={n} onChange={(e) => setNameAt(i, e.target.value)} placeholder={teams.length > 0 ? 'of vrije naam' : `Ploeg ${i + 1}`} />
              {clubs.length > 0 && (
                <select
                  className="trn-teamclub"
                  value={clubIds[i] ?? ''}
                  onChange={(e) => setClubAt(i, e.target.value ? Number(e.target.value) : null)}
                  disabled={!n.trim()}
                  title="Koppel de club (betrouwbaar logo + de club is gekoppeld)"
                  aria-label="Club"
                >
                  <option value="">— club —</option>
                  {clubs.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              )}
              {format === 'knockout' && (
                <button
                  type="button"
                  className={`trn-seed ${n.trim() && seeded[i] ? 'on' : ''}`}
                  onClick={() => toggleSeed(i)}
                  disabled={!n.trim()}
                  title="Geplaatst (vrijstelling) — bv. top van vorig seizoen"
                  aria-label="Geplaatst"
                >
                  ⭐
                </button>
              )}
              {method === 'manual' && (
                <span className="trn-moves">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Omhoog">↑</button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === names.length - 1} aria-label="Omlaag">↓</button>
                </span>
              )}
            </li>
          ))}
        </ol>
      </section>

      {format === 'knockout' && (
      <section className="trn-card">
        <h2>3 · Loting</h2>
        <div className="trn-methods">
          <button type="button" className={`trn-method ${method === 'auto' ? 'on' : ''}`} onClick={() => setMethod('auto')}>
            <strong>Toggle</strong>
            <span>Automatische loting — het systeem kiest wie tegen wie speelt.</span>
          </button>
          <button type="button" className={`trn-method ${method === 'manual' ? 'on' : ''}`} onClick={() => setMethod('manual')}>
            <strong>Manueel</strong>
            <span>Jij bepaalt de loting via de volgorde (gebruik ↑/↓ hierboven).</span>
          </button>
        </div>

        {preview.length > 0 && (
          <div className="trn-preview">
            <h3>Voorbeeld ronde 1 {method === 'auto' && <span className="trn-preview-note">(de niet-geplaatste ploegen worden nog geschud)</span>}</h3>
            <ul>
              {preview.map((m, i) => (
                <li key={i}>
                  <span>{m.home ?? '— vrij —'}</span>
                  <em>vs</em>
                  <span>{m.away ?? '— vrij —'}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
      )}

      {error && <p className="trn-error">{error}</p>}
      <button type="button" className="trn-btn primary big" onClick={submit} disabled={busy}>
        {busy ? 'Bezig…' : 'Tornooi aanmaken'}
      </button>
    </main>
  )
}
