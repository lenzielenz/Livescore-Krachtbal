'use client'

import { useState } from 'react'

import './bulk.css'

interface Team {
  id: number
  label: string
}
interface Row {
  shirtNumber: string
  name: string
  birth: string
}

const emptyRows = (n: number): Row[] => Array.from({ length: n }, () => ({ shirtNumber: '', name: '', birth: '' }))
const clean = (s: string) =>
  s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/\s+/g, ' ').trim()

// Parseert een geplakte/geüploade lijst (CSV, tab, ; of HTML-tabel .xls) → spelers.
// Kolommen: rugnummer · naam · geboortedatum. Een koprij wordt herkend en gebruikt.
function parseRoster(text: string): Row[] {
  const raw: string[][] = []
  if (/<td/i.test(text)) {
    for (const tr of text.split(/<tr[^>]*>/i).slice(1)) {
      const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => clean(m[1]))
      if (cells.some((c) => c)) raw.push(cells)
    }
  } else {
    for (const line of text.split(/\r?\n/)) {
      const t = line.trim()
      if (t) raw.push(t.split(/[\t;,]/).map((c) => c.trim()))
    }
  }
  if (raw.length === 0) return []
  let start = 0
  let iNum = 0
  let iName = 1
  let iBirth = 2
  const head = raw[0].map((c) => c.toLowerCase())
  if (head.some((c) => /naam|nummer|rug|geboor|geb|leeftijd/.test(c))) {
    start = 1
    const find = (re: RegExp) => head.findIndex((c) => re.test(c))
    iNum = find(/rug|nummer|\bnr\b/)
    iName = find(/naam/)
    iBirth = find(/geboor|geb|leeftijd/)
    if (iNum < 0) iNum = 0
    if (iName < 0) iName = 1
  }
  const out: Row[] = []
  for (let i = start; i < raw.length; i++) {
    const c = raw[i]
    const name = (c[iName] ?? '').trim()
    if (!name) continue
    out.push({ shirtNumber: (c[iNum] ?? '').trim(), name, birth: iBirth >= 0 ? (c[iBirth] ?? '').trim() : '' })
  }
  return out
}

export function BulkPlayers({ teams }: { teams: Team[] }) {
  const [teamId, setTeamId] = useState<number>(teams[0]?.id ?? 0)
  const [rows, setRows] = useState<Row[]>(emptyRows(6))
  const [paste, setPaste] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const setRow = (i: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  const addRow = () => setRows((prev) => [...prev, { shirtNumber: '', name: '', birth: '' }])

  const nextNumber = (current: Row[]): number => {
    const nums = current.map((r) => Number(r.shirtNumber)).filter((n) => Number.isFinite(n) && n > 0)
    return nums.length ? Math.max(...nums) + 1 : 1
  }

  const mergeParsed = (parsed: Row[]) => {
    if (parsed.length === 0) {
      setMsg({ kind: 'err', text: 'Geen spelers herkend in het bestand/de lijst.' })
      return
    }
    setRows((prev) => {
      const filled = prev.filter((r) => r.name.trim())
      const out = [...filled]
      for (const p of parsed) {
        out.push({ shirtNumber: p.shirtNumber || String(nextNumber(out)), name: p.name, birth: p.birth })
      }
      return [...out, ...emptyRows(2)]
    })
    setMsg({ kind: 'ok', text: `${parsed.length} speler(s) toegevoegd aan de tabel — controleer en sla op.` })
  }

  const onFile = async (f: File | null) => {
    if (!f) return
    mergeParsed(parseRoster(await f.text()))
  }

  const importPaste = () => {
    mergeParsed(parseRoster(paste))
    setPaste('')
  }

  const save = async () => {
    const players = rows
      .filter((r) => r.name.trim())
      .map((r) => ({ shirtNumber: Number(r.shirtNumber), name: r.name.trim(), birthDate: r.birth.trim() }))
    if (players.length === 0) {
      setMsg({ kind: 'err', text: 'Vul minstens één speler in.' })
      return
    }
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch('/api/players/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, players }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Opslaan mislukt')
      setMsg({ kind: 'ok', text: `${data.created} speler(s) toegevoegd.` })
      setRows(emptyRows(6))
    } catch (e) {
      setMsg({ kind: 'err', text: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bulk">
      <label className="bulk-field">
        <span>Ploeg</span>
        <select value={teamId} onChange={(e) => setTeamId(Number(e.target.value))}>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
      </label>

      <details className="bulk-guide">
        <summary>📋 Excel/CSV opladen — hoe opbouwen?</summary>
        <ol>
          <li>Maak in Excel drie kolommen: <b>Rugnummer</b> · <b>Naam</b> · <b>Geboortedatum</b> (de eerste rij mag de koppen zijn).</li>
          <li>Eén speler per rij. Geboortedatum als <b>dd/mm/jjjj</b> (of enkel het geboortejaar).</li>
          <li>Bewaar als <b>CSV</b> (Bestand → Opslaan als → CSV) en laad het hier op. Een .xls of geplakte lijst werkt ook.</li>
        </ol>
        <p className="bulk-guide-ex">Voorbeeld:<br />Rugnummer;Naam;Geboortedatum<br />7;Jens Peeters;12/03/2010<br />8;Wout De Cock;2009</p>
      </details>

      <label className="bulk-file">
        <input type="file" accept=".csv,.xls,.xlsx,.txt,text/csv" onChange={(e) => void onFile(e.target.files?.[0] ?? null)} />
        <span>📤 Excel/CSV opladen…</span>
      </label>

      <div className="bulk-table-wrap">
        <table className="bulk-table">
          <thead>
            <tr>
              <th>Rugnr.</th>
              <th>Naam</th>
              <th>Geboorte</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>
                  <input type="number" inputMode="numeric" value={r.shirtNumber} onChange={(e) => setRow(i, { shirtNumber: e.target.value })} className="bulk-num" />
                </td>
                <td>
                  <input
                    type="text"
                    value={r.name}
                    placeholder="Naam speler"
                    onChange={(e) => setRow(i, { name: e.target.value })}
                    onKeyDown={(e) => { if (e.key === 'Enter' && i === rows.length - 1) addRow() }}
                  />
                </td>
                <td>
                  <input type="text" value={r.birth} placeholder="dd/mm/jjjj" onChange={(e) => setRow(i, { birth: e.target.value })} className="bulk-birth" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" className="bulk-addrow" onClick={addRow}>+ rij</button>

      <details className="bulk-paste">
        <summary>Of plak een lijst (één speler per regel, bv. “7 Jens 12/03/2010”)</summary>
        <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={6} placeholder={'7;Jens;12/03/2010\n8;Wout;2009\nLander'} />
        <button type="button" onClick={importPaste}>Toevoegen aan tabel</button>
      </details>

      {msg && <div className={`bulk-msg ${msg.kind}`}>{msg.text}</div>}

      <button type="button" className="bulk-save" disabled={busy} onClick={save}>
        {busy ? 'Bezig…' : 'Alle spelers opslaan'}
      </button>
    </div>
  )
}
