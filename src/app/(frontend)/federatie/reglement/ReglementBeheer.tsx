'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { toast } from '@/components/Toaster'
import { formatDateBE } from '@/lib/datetime'

export type ReglementRij = { id: number; titel: string; geldigVanaf: string; status: string; bron: string; inhoud: string }
export type VerslagRij = { id: number; titel: string; datum: string; reglement: number | null; artikel: string; status: string; inhoud: string }
export type RegelRij = {
  id: number
  naam: string
  soort: string
  actief: boolean
  reglement: number | null
  verslag: number | null
  artikel: string
  maxKeerHoger: number | null
  categorie: string
  bronReeksen: string[]
  topPerReeks: number | null
  eindrondeNaam: string
  heenEnTerug: boolean
  dagenNaEinde: number
  eindronde: { klaar: boolean; resterend: number; bestaat: number | null; doorgaan: number } | null
}
type Reeks = { value: string; label: string; ploegen: number }

async function post(body: Record<string, unknown>) {
  const res = await fetch('/api/federatie/reglement', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  })
  return { ok: res.ok, data: (await res.json().catch(() => ({}))) as Record<string, unknown> }
}

const STATUS: Record<string, string> = { concept: '✎ concept', actief: '✅ geldt nu', archief: '🗄️ archief', ingetrokken: '✗ ingetrokken' }

function useActie() {
  const router = useRouter()
  const [bezig, setBezig] = useState(false)
  const doe = async (body: Record<string, unknown>, ok: string): Promise<boolean> => {
    setBezig(true)
    try {
      const r = await post(body)
      if (!r.ok) {
        toast('error', String(r.data.error ?? 'Mislukt.'))
        return false
      }
      toast('success', ok)
      router.refresh()
      return true
    } finally {
      setBezig(false)
    }
  }
  return { bezig, doe }
}

// ─── Reglement (versies) ────────────────────────────────────────────────────
function Reglementen({ lijst }: { lijst: ReglementRij[] }) {
  const { bezig, doe } = useActie()
  const leeg = { id: null as number | null, titel: '', geldigVanaf: '', bron: '', inhoud: '' }
  const [f, setF] = useState(leeg)
  return (
    <div className="rb-kolommen">
      <div className="ft-wrap">
        {lijst.length === 0 && <p className="ft-stat">Nog geen versie in het platform: /reglement toont het meegeleverde RCVK.</p>}
        {lijst.map((r) => (
          <div key={r.id} className="ft-kaart">
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <strong style={{ flex: '1 1 auto' }}>{r.titel}</strong>
              <span className="ft-stat">{STATUS[r.status] ?? r.status}</span>
            </div>
            <span className="ft-stat">Geldig vanaf {formatDateBE(r.geldigVanaf)}</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="ft-btn" onClick={() => setF({ id: r.id, titel: r.titel, geldigVanaf: r.geldigVanaf, bron: r.bron, inhoud: r.inhoud })}>
                Bewerken
              </button>
              {r.status !== 'actief' && (
                <button
                  type="button"
                  className="ft-btn ft-primair"
                  disabled={bezig}
                  onClick={() => confirm(`"${r.titel}" wordt het geldende reglement. De huidige versie gaat naar het archief.`) && doe({ actie: 'activeren', id: r.id }, 'Deze versie geldt nu.')}
                >
                  Laten gelden
                </button>
              )}
              {r.status === 'concept' && (
                <button type="button" className="ft-btn" disabled={bezig} onClick={() => confirm('Dit concept verwijderen?') && doe({ actie: 'reglementVerwijderen', id: r.id }, 'Verwijderd.')}>
                  Verwijderen
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="ft-kaart">
        <h2>{f.id ? 'Versie bewerken' : 'Nieuwe versie van het reglement'}</h2>
        <div className="ft-velden">
          <label className="ft-veld">
            Titel
            <input value={f.titel} onChange={(e) => setF({ ...f, titel: e.target.value })} placeholder="RCVK 2026" />
          </label>
          <label className="ft-veld">
            Geldig vanaf
            <input type="date" value={f.geldigVanaf} onChange={(e) => setF({ ...f, geldigVanaf: e.target.value })} />
          </label>
          <label className="ft-veld">
            Officiële bron (URL)
            <input value={f.bron} onChange={(e) => setF({ ...f, bron: e.target.value })} placeholder="https://www.krachtbal.be/…" />
          </label>
        </div>
        <label className="ft-veld">
          Tekst (markdown: # voor hoofdstukken, ## voor artikels)
          <textarea className="rb-tekst" rows={18} value={f.inhoud} onChange={(e) => setF({ ...f, inhoud: e.target.value })} />
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="ft-btn ft-primair"
            disabled={bezig}
            onClick={async () => (await doe({ actie: 'reglement', ...f }, f.id ? 'Bewaard.' : 'Opgeslagen als concept. Klik "Laten gelden" wanneer het van kracht wordt.')) && setF(leeg)}
          >
            Bewaren
          </button>
          {f.id && (
            <button type="button" className="ft-btn" onClick={() => setF(leeg)}>
              Annuleren
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Verslagen ──────────────────────────────────────────────────────────────
function Verslagen({ lijst, reglementen }: { lijst: VerslagRij[]; reglementen: ReglementRij[] }) {
  const { bezig, doe } = useActie()
  const standaardReglement = reglementen.find((r) => r.status === 'actief')?.id ?? reglementen[0]?.id ?? null
  const leeg = { id: null as number | null, titel: '', datum: '', reglement: standaardReglement as number | null, artikel: '', status: 'actief', inhoud: '' }
  const [f, setF] = useState(leeg)
  if (reglementen.length === 0) return <p className="ft-stat">Zet eerst het reglement in het platform (tabblad Reglement): een verslag hangt altijd aan een reglement.</p>
  return (
    <div className="rb-kolommen">
      <div className="ft-wrap">
        {lijst.length === 0 && <p className="ft-stat">Nog geen verslagen.</p>}
        {lijst.map((v) => (
          <div key={v.id} className="ft-kaart">
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <strong style={{ flex: '1 1 auto' }}>{v.titel}</strong>
              <span className="ft-stat">{STATUS[v.status] ?? v.status}</span>
            </div>
            <span className="ft-stat">
              {formatDateBE(v.datum)}
              {v.artikel ? ` · ${v.artikel}` : ''} · bij {reglementen.find((r) => r.id === v.reglement)?.titel ?? '—'}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="ft-btn" onClick={() => setF({ ...v })}>
                Bewerken
              </button>
              <button type="button" className="ft-btn" disabled={bezig} onClick={() => confirm(`"${v.titel}" verwijderen?`) && doe({ actie: 'verslagVerwijderen', id: v.id }, 'Verwijderd.')}>
                Verwijderen
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="ft-kaart">
        <h2>{f.id ? 'Verslag bewerken' : 'Nieuw verslag'}</h2>
        <div className="ft-velden">
          <label className="ft-veld">
            Titel
            <input value={f.titel} onChange={(e) => setF({ ...f, titel: e.target.value })} placeholder="AV 12 mei: eindronde 2de nationale" />
          </label>
          <label className="ft-veld">
            Datum
            <input type="date" value={f.datum} onChange={(e) => setF({ ...f, datum: e.target.value })} />
          </label>
          <label className="ft-veld">
            Hoort bij
            <select value={f.reglement ?? ''} onChange={(e) => setF({ ...f, reglement: Number(e.target.value) || null })}>
              {reglementen.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.titel}
                </option>
              ))}
            </select>
          </label>
          <label className="ft-veld">
            Artikel(s)
            <input value={f.artikel} onChange={(e) => setF({ ...f, artikel: e.target.value })} placeholder="art. 34" />
          </label>
          <label className="ft-veld">
            Status
            <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
              <option value="actief">Van toepassing</option>
              <option value="ingetrokken">Ingetrokken</option>
            </select>
          </label>
        </div>
        <label className="ft-veld">
          Tekst
          <textarea className="rb-tekst" rows={10} value={f.inhoud} onChange={(e) => setF({ ...f, inhoud: e.target.value })} />
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="ft-btn ft-primair" disabled={bezig} onClick={async () => (await doe({ actie: 'verslag', ...f }, 'Verslag bewaard.')) && setF(leeg)}>
            Bewaren
          </button>
          {f.id && (
            <button type="button" className="ft-btn" onClick={() => setF(leeg)}>
              Annuleren
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Regels (bouwstenen) ────────────────────────────────────────────────────
function Regels({ lijst, reglementen, verslagen, reeksen }: { lijst: RegelRij[]; reglementen: ReglementRij[]; verslagen: VerslagRij[]; reeksen: Reeks[] }) {
  const { bezig, doe } = useActie()
  const leeg = {
    id: null as number | null,
    naam: '',
    soort: 'vastspelen',
    actief: true,
    reglement: reglementen.find((r) => r.status === 'actief')?.id ?? null,
    verslag: null as number | null,
    artikel: '',
    maxKeerHoger: 3 as number | null,
    categorie: 'alle',
    bronReeksen: [] as string[],
    topPerReeks: 4 as number | null,
    eindrondeNaam: '',
    heenEnTerug: false,
    dagenNaEinde: 7,
  }
  const [f, setF] = useState(leeg)
  const metPloegen = reeksen.filter((r) => r.ploegen > 0)
  return (
    <div className="rb-kolommen">
      <div className="ft-wrap">
        {lijst.length === 0 && <p className="ft-stat">Nog geen regels. Zonder regel past het platform niets toe.</p>}
        {lijst.map((g) => (
          <div key={g.id} className="ft-kaart" style={g.actief ? undefined : { opacity: 0.6 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <strong style={{ flex: '1 1 auto' }}>
                {g.soort === 'vastspelen' ? '🎟️' : '🏁'} {g.naam}
              </strong>
              <span className="ft-stat">{g.actief ? '✅ van toepassing' : 'uit'}</span>
            </div>
            <span className="ft-stat">
              {g.soort === 'vastspelen'
                ? `Na ${g.maxKeerHoger}× hoger spelen vast in die reeks${g.categorie !== 'alle' ? ` (${g.categorie})` : ''}.`
                : `${g.bronReeksen.join(', ')} → beste ${g.topPerReeks} per reeks${g.heenEnTerug ? ', heen en terug' : ''}, start ${g.dagenNaEinde} dagen na de laatste wedstrijd.`}
            </span>
            <span className="ft-stat">
              Bron: {reglementen.find((r) => r.id === g.reglement)?.titel ?? verslagen.find((v) => v.id === g.verslag)?.titel ?? '—'}
              {g.artikel ? `, ${g.artikel}` : ''}
            </span>
            {g.eindronde && (
              <span className="ft-stat">
                {g.eindronde.bestaat ? (
                  <Link href={`/eindronde/${g.eindronde.bestaat}`}>🏁 Eindronde aangemaakt — bekijk →</Link>
                ) : g.eindronde.klaar ? (
                  `Klaar: ${g.eindronde.doorgaan} ploegen gaan door. Het systeem maakt ze aan na de volgende afgelopen wedstrijd, of nu:`
                ) : (
                  `Nog ${g.eindronde.resterend} wedstrijden te spelen in de reeksen.`
                )}
              </span>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="ft-btn" onClick={() => setF({ ...leeg, ...g })}>
                Bewerken
              </button>
              {g.eindronde && !g.eindronde.bestaat && (
                <button
                  type="button"
                  className="ft-btn ft-primair"
                  disabled={bezig}
                  onClick={() =>
                    (g.eindronde!.klaar || confirm('De reeksen zijn nog niet uitgespeeld. Toch nu aanmaken met de huidige stand?')) &&
                    doe({ actie: 'eindronde', regelId: g.id, forceer: !g.eindronde!.klaar }, 'Eindronde met kalender aangemaakt.')
                  }
                >
                  🏁 Eindronde nu aanmaken
                </button>
              )}
              <button type="button" className="ft-btn" disabled={bezig} onClick={() => confirm(`"${g.naam}" verwijderen?`) && doe({ actie: 'regelVerwijderen', id: g.id }, 'Verwijderd.')}>
                Verwijderen
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="ft-kaart">
        <h2>{f.id ? 'Regel bewerken' : 'Nieuwe regel'}</h2>
        <div className="ft-velden">
          <label className="ft-veld">
            Naam
            <input value={f.naam} onChange={(e) => setF({ ...f, naam: e.target.value })} placeholder="Vastspelen senioren" />
          </label>
          <label className="ft-veld">
            Soort
            <select value={f.soort} onChange={(e) => setF({ ...f, soort: e.target.value })}>
              <option value="vastspelen">🎟️ Vastspelen (knipjes)</option>
              <option value="eindronde">🏁 Eindronde</option>
            </select>
          </label>
          <label className="ft-veld">
            Bron: reglement
            <select value={f.reglement ?? ''} onChange={(e) => setF({ ...f, reglement: Number(e.target.value) || null })}>
              <option value="">—</option>
              {reglementen.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.titel}
                </option>
              ))}
            </select>
          </label>
          <label className="ft-veld">
            of bron: verslag
            <select value={f.verslag ?? ''} onChange={(e) => setF({ ...f, verslag: Number(e.target.value) || null })}>
              <option value="">—</option>
              {verslagen.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.titel}
                </option>
              ))}
            </select>
          </label>
          <label className="ft-veld">
            Artikel
            <input value={f.artikel} onChange={(e) => setF({ ...f, artikel: e.target.value })} placeholder="art. 21" />
          </label>
          <label className="ft-veld">
            Van toepassing
            <select value={f.actief ? 'ja' : 'nee'} onChange={(e) => setF({ ...f, actief: e.target.value === 'ja' })}>
              <option value="ja">Ja</option>
              <option value="nee">Nee (uit)</option>
            </select>
          </label>
        </div>
        {f.soort === 'vastspelen' ? (
          <div className="ft-velden">
            <label className="ft-veld">
              Hoeveel keer hoger spelen mag (daarna vast)
              <input type="number" min={1} value={f.maxKeerHoger ?? ''} onChange={(e) => setF({ ...f, maxKeerHoger: Number(e.target.value) || null })} />
            </label>
            <label className="ft-veld">
              Geldt voor
              <select value={f.categorie} onChange={(e) => setF({ ...f, categorie: e.target.value })}>
                <option value="alle">Alle categorieën</option>
                {['senioren', 'U20', 'U18', 'U16', 'U14', 'U12'].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : (
          <>
            <div className="ft-velden">
              <label className="ft-veld">
                Naam van de eindronde
                <input value={f.eindrondeNaam} onChange={(e) => setF({ ...f, eindrondeNaam: e.target.value })} placeholder="Eindronde regionale heren" />
              </label>
              <label className="ft-veld">
                Hoeveel per reeks gaan door
                <input type="number" min={1} value={f.topPerReeks ?? ''} onChange={(e) => setF({ ...f, topPerReeks: Number(e.target.value) || null })} />
              </label>
              <label className="ft-veld">
                Start: dagen na de laatste wedstrijd
                <input type="number" min={1} value={f.dagenNaEinde} onChange={(e) => setF({ ...f, dagenNaEinde: Number(e.target.value) || 7 })} />
              </label>
              <label className="ft-veld">
                Wedstrijden
                <select value={f.heenEnTerug ? 'ht' : 'h'} onChange={(e) => setF({ ...f, heenEnTerug: e.target.value === 'ht' })}>
                  <option value="h">Enkel heen</option>
                  <option value="ht">Heen en terug</option>
                </select>
              </label>
            </div>
            <fieldset className="ft-veld" style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 10 }}>
              <legend>Uit welke reeksen</legend>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px' }}>
                {metPloegen.map((r) => (
                  <label key={r.value} style={{ display: 'inline-flex', gap: 4, color: 'var(--txt)' }}>
                    <input
                      type="checkbox"
                      checked={f.bronReeksen.includes(r.value)}
                      onChange={() =>
                        setF({ ...f, bronReeksen: f.bronReeksen.includes(r.value) ? f.bronReeksen.filter((x) => x !== r.value) : [...f.bronReeksen, r.value] })
                      }
                    />
                    {r.value} <span className="ft-stat">({r.ploegen})</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="ft-btn ft-primair" disabled={bezig} onClick={async () => (await doe({ actie: 'regel', ...f }, 'Regel bewaard.')) && setF(leeg)}>
            Bewaren
          </button>
          {f.id && (
            <button type="button" className="ft-btn" onClick={() => setF(leeg)}>
              Annuleren
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export function ReglementBeheer({
  reglementen,
  verslagen,
  regels,
  reeksen,
}: {
  reglementen: ReglementRij[]
  verslagen: VerslagRij[]
  regels: RegelRij[]
  reeksen: Reeks[]
}) {
  const [tab, setTab] = useState<'reglement' | 'verslagen' | 'regels'>('regels')
  return (
    <div className="ft-wrap">
      <div className="ft-balk" role="tablist">
        {(
          [
            ['regels', `⚙️ Regels die het platform toepast (${regels.length})`],
            ['verslagen', `📝 Verslagen (${verslagen.length})`],
            ['reglement', `📖 Reglement (${reglementen.length} versies)`],
          ] as const
        ).map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`ft-btn ${tab === k ? 'ft-primair' : ''}`} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'reglement' && <Reglementen lijst={reglementen} />}
      {tab === 'verslagen' && <Verslagen lijst={verslagen} reglementen={reglementen} />}
      {tab === 'regels' && <Regels lijst={regels} reglementen={reglementen} verslagen={verslagen} reeksen={reeksen} />}
    </div>
  )
}
