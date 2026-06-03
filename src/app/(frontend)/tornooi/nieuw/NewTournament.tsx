'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'

import { buildBracket, nextPow2, seededSlots, shuffle } from '@/lib/tournament'

type Method = 'auto' | 'manual'

// Loting-preview: hoe spelen de ploegen in ronde 1 (incl. bye's) bij de huidige volgorde?
function previewRound1(names: string[]): { home: string | null; away: string | null }[] {
  const filled = names.map((n) => n.trim()).filter(Boolean)
  if (filled.length < 2) return []
  const slots = seededSlots(filled)
  return buildBracket(slots)
    .filter((m) => m.round === 1 && m.bracket === 'main')
    .map((m) => ({ home: m.home, away: m.away }))
}

export function NewTournament({ categories }: { categories: ReadonlyArray<{ label: string; value: string }> }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [category, setCategory] = useState(categories[categories.length - 1]?.value ?? 'senioren')
  const [count, setCount] = useState(4)
  const [names, setNames] = useState<string[]>(['', '', '', ''])
  const [method, setMethod] = useState<Method>('auto')
  const [format, setFormat] = useState<'knockout' | 'roundrobin'>('knockout')
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
  }

  const setNameAt = (i: number, v: string) => setNames((prev) => prev.map((n, idx) => (idx === i ? v : n)))

  const move = (i: number, dir: -1 | 1) => {
    setNames((prev) => {
      const j = i + dir
      if (j < 0 || j >= prev.length) return prev
      const next = prev.slice()
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  const filledCount = names.filter((n) => n.trim()).length
  const bracketSize = useMemo(() => (filledCount >= 2 ? nextPow2(filledCount) : 0), [filledCount])
  const byes = bracketSize > 0 ? bracketSize - filledCount : 0
  const preview = useMemo(() => previewRound1(names), [names])

  const submit = async () => {
    setError(null)
    const filled = names.map((n) => n.trim()).filter(Boolean)
    if (!name.trim()) return setError('Geef het tornooi een naam.')
    if (filled.length < 2) return setError('Vul minstens 2 ploegnamen in.')
    if (new Set(filled.map((n) => n.toLowerCase())).size !== filled.length)
      return setError('Twee ploegen hebben dezelfde naam.')

    // Round-robin: alle ploegen één keer tegen elkaar — geen loting/bye's, namen volstaan.
    // Knock-out: toggle = automatische loting (schudden), manueel = volgorde zoals ingevuld.
    const slots =
      format === 'roundrobin' ? filled : seededSlots(method === 'auto' ? shuffle(filled, Math.random) : filled)

    setBusy(true)
    try {
      const res = await fetch('/api/tournament', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), category, method, format, slots }),
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
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Bv. Paastornooi U14 2026" />
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
      </section>

      <section className="trn-card">
        <h2>2 · Ploegen invullen</h2>
        <p className="trn-hint">
          {filledCount < 2
            ? 'Vul de ploegnamen in.'
            : format === 'roundrobin'
              ? `${filledCount} ploegen · ${(filledCount * (filledCount - 1)) / 2} wedstrijden (iedereen één keer tegen elkaar)`
              : `Schema van ${bracketSize} · ${byes > 0 ? `${byes} bye(s) — die ploeg${byes > 1 ? 'en' : ''} is vrij in ronde 1` : 'geen bye’s'}`}
        </p>
        <ol className="trn-teamlist">
          {names.map((n, i) => (
            <li key={i}>
              <span className="trn-teamnr">{i + 1}</span>
              <input value={n} onChange={(e) => setNameAt(i, e.target.value)} placeholder={`Ploeg ${i + 1}`} />
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

        {method === 'manual' && preview.length > 0 && (
          <div className="trn-preview">
            <h3>Voorbeeld ronde 1</h3>
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
