'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { CATEGORY_OPTIONS } from '@/lib/categories'
import { nextPow2, seededSlots, shuffle } from '@/lib/tournament'

// ⚙️ Beheer van een bestaand tornooi (enkel federatie/admin, ingeklapt tot je het nodig hebt):
//  • schrijffouten rechtzetten — de tornooinaam of een ploegnaam, doorheen het hele schema;
//  • het speelschema zelf in handen nemen zolang er nog niet gespeeld is:
//    – poule (round-robin): manueel wedstrijden samenstellen — wie tegen wie, in welke volgorde
//      en om welk uur ("A tegen C, daarna C tegen B") — of via Toggle opnieuw laten genereren;
//    – knock-out: de loting herschikken (↑/↓ of Toggle) mét zicht op de resulterende paren.

type Wedstrijd = { home: string; away: string; plannedAt: string | null }

// ISO → waarde voor <input type="datetime-local"> in lokale tijd (leeg als niet gepland).
function naarLokaal(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function TornooiBeheer({
  id,
  naam,
  categorie,
  teams,
  magHerloten,
  format,
  schema,
}: {
  id: number
  naam: string
  /** Huidige categorie — verkeerd bewaard? Hier rechtzetten (bepaalt speelduur en worpen). */
  categorie: string
  teams: string[]
  /** Nog niets gespeeld → herloten/plannen toegestaan (de server bewaakt het sowieso ook). */
  magHerloten: boolean
  format: 'knockout' | 'roundrobin'
  /** Huidig speelschema (enkel round-robin): voorinvulling van de manuele planner. */
  schema: Wedstrijd[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [fout, setFout] = useState<string | null>(null)
  const [nieuweNaam, setNieuweNaam] = useState(naam)
  const [nieuweCat, setNieuweCat] = useState(categorie)
  // Ploegnamen lokaal bewerkbaar; bewaren gebeurt per ploeg (oud → nieuw).
  const [namen, setNamen] = useState<string[]>(teams)
  const [volgorde, setVolgorde] = useState<string[]>(teams)
  // Manuele planner (round-robin): bewerkbare rijenlijst, datetime in lokale invoerwaarde.
  const [plan, setPlan] = useState<{ home: string; away: string; tijd: string }[]>(
    schema.map((w) => ({ home: w.home, away: w.away, tijd: naarLokaal(w.plannedAt) })),
  )

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

  // Knock-out: bij een macht van 2 telt de lijst letterlijk — nr 1 speelt tegen nr 2, nr 3 tegen
  // nr 4 (zo kies je exact "die tegen die"). Met bye's verdeelt de seeding ze eerlijk.
  const machtVan2 = volgorde.length >= 2 && nextPow2(volgorde.length) === volgorde.length
  const slotsVoor = (basis: string[]): (string | null)[] => (machtVan2 ? basis : seededSlots(basis))
  const paren = (() => {
    const slots = slotsVoor(volgorde)
    const uit: { a: string | null; b: string | null }[] = []
    for (let i = 0; i < slots.length; i += 2) uit.push({ a: slots[i], b: slots[i + 1] })
    return uit
  })()

  const herloot = async (schudden: boolean) => {
    const basis = schudden ? shuffle(volgorde, Math.random) : volgorde
    const ok = await patch({ actie: 'herloting', slots: slotsVoor(basis) })
    if (ok && schudden) setVolgorde(basis)
  }

  // ── Manuele planner (round-robin) ──────────────────────────────────────────
  const zetPlan = (i: number, deel: Partial<{ home: string; away: string; tijd: string }>) =>
    setPlan((p) => p.map((r, j) => (j === i ? { ...r, ...deel } : r)))

  const schuifPlan = (i: number, d: number) =>
    setPlan((p) => {
      const kopie = [...p]
      const j = i + d
      if (j < 0 || j >= kopie.length) return p
      ;[kopie[i], kopie[j]] = [kopie[j], kopie[i]]
      return kopie
    })

  const genereerAlleDuels = () => {
    // Toggle: alle onderlinge duels opnieuw, in een vers geschudde volgorde. Bewaren doe je daarna.
    const door = shuffle(teams, Math.random)
    const rijen: { home: string; away: string; tijd: string }[] = []
    for (let i = 0; i < door.length; i++)
      for (let j = i + 1; j < door.length; j++) rijen.push({ home: door[i], away: door[j], tijd: '' })
    setPlan(rijen)
  }

  const bewaarPlan = async () => {
    for (const r of plan) {
      if (!r.home || !r.away) return setFout('Kies bij elke wedstrijd twee ploegen.')
      if (r.home === r.away) return setFout(`${r.home} kan niet tegen zichzelf spelen.`)
    }
    await patch({
      actie: 'planning',
      wedstrijden: plan.map((r) => ({
        home: r.home,
        away: r.away,
        plannedAt: r.tijd ? new Date(r.tijd).toISOString() : null,
      })),
    })
  }

  if (!open) {
    return (
      <button type="button" className="trn-btn" onClick={() => setOpen(true)}>
        ⚙️ Beheer (naam · ploegen · planning)
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

      <label className="trn-field">
        <span>Categorie (verkeerd bewaard? bepaalt speelduur en worpaantal)</span>
        <div className="trn-beheer-rij">
          <select value={nieuweCat} onChange={(e) => setNieuweCat(e.target.value)}>
            {CATEGORY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button
            type="button"
            className="trn-btn"
            disabled={busy || nieuweCat === categorie}
            onClick={() => void patch({ actie: 'categorie', categorie: nieuweCat })}
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

      {!magHerloten ? (
        <p className="trn-hint">
          Het schema hertekenen kan niet meer: er is al gespeeld. Een fout genoteerde uitslag herstel je via de
          aantekentafel (🔓 Score aanpassen).
        </p>
      ) : format === 'roundrobin' ? (
        <div className="trn-field">
          <span>
            Speelschema — stel zelf de wedstrijden samen: wie tegen wie, in deze volgorde, en (optioneel) om welk uur.
            Kan zolang er nog niet gespeeld is.
          </span>
          <ul className="trn-planlist">
            {plan.map((r, i) => (
              <li key={i}>
                <span className="trn-teamnr">{i + 1}</span>
                <select value={r.home} onChange={(e) => zetPlan(i, { home: e.target.value })} aria-label="Thuisploeg">
                  {!r.home && <option value="">— kies —</option>}
                  {teams.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <span className="trn-plan-vs">–</span>
                <select value={r.away} onChange={(e) => zetPlan(i, { away: e.target.value })} aria-label="Uitploeg">
                  {!r.away && <option value="">— kies —</option>}
                  {teams.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <input
                  type="datetime-local"
                  value={r.tijd}
                  onChange={(e) => zetPlan(i, { tijd: e.target.value })}
                  aria-label="Gepland uur"
                />
                <span className="trn-moves">
                  <button type="button" onClick={() => schuifPlan(i, -1)} disabled={i === 0} aria-label="Vroeger">↑</button>
                  <button type="button" onClick={() => schuifPlan(i, 1)} disabled={i === plan.length - 1} aria-label="Later">↓</button>
                  <button type="button" onClick={() => setPlan((p) => p.filter((_, j) => j !== i))} aria-label="Verwijderen">✕</button>
                </span>
              </li>
            ))}
          </ul>
          <div className="trn-beheer-rij">
            <button
              type="button"
              className="trn-btn"
              onClick={() => setPlan((p) => [...p, { home: '', away: '', tijd: '' }])}
            >
              + Wedstrijd toevoegen
            </button>
          </div>
          <div className="trn-beheer-rij">
            <button type="button" className="trn-btn primary" disabled={busy || plan.length === 0} onClick={() => void bewaarPlan()}>
              ✔ Manueel — dit schema gebruiken
            </button>
            <button type="button" className="trn-btn" disabled={busy} onClick={genereerAlleDuels}>
              🔀 Toggle — alle duels opnieuw genereren
            </button>
          </div>
        </div>
      ) : (
        <div className="trn-field">
          <span>
            Herloting — kan zolang er nog niet gespeeld is.{' '}
            {machtVan2
              ? 'Nr 1 speelt tegen nr 2, nr 3 tegen nr 4, … — zet de ploegen dus exact zoals je ze tegen elkaar wil.'
              : 'Met bye’s verdeelt de seeding de vrijstellingen eerlijk; de paren zie je hieronder.'}{' '}
            Geplande uren van ronde 1 blijven staan.
          </span>
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
          {/* Live-voorbeeld van de paren die deze volgorde oplevert — geen verrassingen na Bewaren. */}
          <ul className="trn-parenlijst">
            {paren.map((p, i) => (
              <li key={i}>
                <em>Wedstrijd {i + 1}</em> {p.a ?? 'vrij (bye)'} – {p.b ?? 'vrij (bye)'}
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
      )}

      {fout && <p className="trn-error">{fout}</p>}
      <button type="button" className="trn-btn" onClick={() => setOpen(false)}>Sluiten</button>
    </section>
  )
}
