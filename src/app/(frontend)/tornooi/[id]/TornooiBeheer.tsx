'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { seededSlots, shuffle } from '@/lib/tournament'

// ⚙️ Beheer van een bestaand tornooi (enkel federatie/admin, ingeklapt tot je het nodig hebt):
//  • schrijffouten rechtzetten — de tornooinaam of een ploegnaam, doorheen het hele schema;
//  • herloten zolang er nog niet gespeeld is — zelf de volgorde bepalen (Manueel, ↑/↓) of
//    opnieuw laten schudden (Toggle). De geplande uren van ronde 1 blijven per slot staan.
export function TornooiBeheer({
  id,
  naam,
  teams,
  magHerloten,
}: {
  id: number
  naam: string
  teams: string[]
  /** Nog niets gespeeld → herloten toegestaan (de server bewaakt het sowieso ook). */
  magHerloten: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [fout, setFout] = useState<string | null>(null)
  const [nieuweNaam, setNieuweNaam] = useState(naam)
  // Ploegnamen lokaal bewerkbaar; bewaren gebeurt per ploeg (oud → nieuw).
  const [namen, setNamen] = useState<string[]>(teams)
  const [volgorde, setVolgorde] = useState<string[]>(teams)

  const patch = async (body: Record<string, unknown>): Promise<boolean> => {
    setBusy(true)
    setFout(null)
    try {
      const res = await fetch(`/api/tournament/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(data.error || 'Aanpassen mislukt.')
      router.refresh()
      return true
    } catch (e) {
      setFout((e as Error).message)
      return false
    } finally {
      setBusy(false)
    }
  }

  const bewaarPloegnaam = async (i: number) => {
    const van = teams[i]
    const naar = namen[i].trim()
    if (!naar || naar === van) return
    await patch({ actie: 'ploegnaam', van, naar })
  }

  const schuif = (i: number, d: number) => {
    setVolgorde((v) => {
      const kopie = [...v]
      const j = i + d
      if (j < 0 || j >= kopie.length) return v
      ;[kopie[i], kopie[j]] = [kopie[j], kopie[i]]
      return kopie
    })
  }

  const herloot = async (schudden: boolean) => {
    const basis = schudden ? shuffle(volgorde, Math.random) : volgorde
    const ok = await patch({ actie: 'herloting', slots: seededSlots(basis) })
    if (ok && schudden) setVolgorde(basis)
  }

  if (!open) {
    return (
      <button type="button" className="trn-btn" onClick={() => setOpen(true)}>
        ⚙️ Beheer (naam · ploegen · herloting)
      </button>
    )
  }

  return (
    <section className="trn-card trn-beheer">
      <h2>⚙️ Beheer</h2>

      <label className="trn-field">
        <span>Tornooinaam (schrijffout? pas ze hier aan)</span>
        <div className="trn-beheer-rij">
          <input value={nieuweNaam} onChange={(e) => setNieuweNaam(e.target.value)} />
          <button
            type="button"
            className="trn-btn"
            disabled={busy || !nieuweNaam.trim() || nieuweNaam.trim() === naam}
            onClick={() => void patch({ actie: 'naam', naam: nieuweNaam })}
          >
            Bewaren
          </button>
        </div>
      </label>

      <div className="trn-field">
        <span>Ploegnamen (wijzigen werkt door in het hele schema)</span>
        <ul className="trn-teamlist">
          {teams.map((t, i) => (
            <li key={t}>
              <input value={namen[i] ?? t} onChange={(e) => setNamen((n) => n.map((x, j) => (j === i ? e.target.value : x)))} />
              <button
                type="button"
                className="trn-btn"
                disabled={busy || !(namen[i] ?? '').trim() || (namen[i] ?? '').trim() === t}
                onClick={() => void bewaarPloegnaam(i)}
              >
                Bewaren
              </button>
            </li>
          ))}
        </ul>
      </div>

      {magHerloten ? (
        <div className="trn-field">
          <span>Herloting — kan zolang er nog niet gespeeld is. Geplande uren van ronde 1 blijven staan.</span>
          <ul className="trn-teamlist">
            {volgorde.map((t, i) => (
              <li key={t}>
                <span className="trn-teamnr">{i + 1}</span>
                <span className="trn-beheer-naam">{t}</span>
                <span className="trn-moves">
                  <button type="button" onClick={() => schuif(i, -1)} disabled={i === 0} aria-label="Omhoog">↑</button>
                  <button type="button" onClick={() => schuif(i, 1)} disabled={i === volgorde.length - 1} aria-label="Omlaag">↓</button>
                </span>
              </li>
            ))}
          </ul>
          <div className="trn-beheer-rij">
            <button type="button" className="trn-btn primary" disabled={busy} onClick={() => void herloot(false)}>
              ✔ Manueel — deze volgorde gebruiken
            </button>
            <button type="button" className="trn-btn" disabled={busy} onClick={() => void herloot(true)}>
              🔀 Toggle — opnieuw schudden
            </button>
          </div>
        </div>
      ) : (
        <p className="trn-hint">Herloten kan niet meer: er is al gespeeld. Een fout genoteerde uitslag herstel je via de aantekentafel (🔓 Score aanpassen).</p>
      )}

      {fout && <p className="trn-error">{fout}</p>}
      <button type="button" className="trn-btn" onClick={() => setOpen(false)}>Sluiten</button>
    </section>
  )
}
