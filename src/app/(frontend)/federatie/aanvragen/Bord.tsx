'use client'

import { Check, Clock, ExternalLink, Hand, ListTodo, MessageSquare, RefreshCw, Search, Trash2, UserRound, X } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { FedDialoog } from '@/components/fed-shell/FedDialoog'
import { TaakDialoog } from '@/components/fed-shell/SnelMenu'
import { toast } from '@/components/Toaster'
import {
  type Aanvraag,
  type Actie,
  type Bron,
  type Kolom,
  type WachtOp,
  BRON_META,
  KOLOMMEN,
  WACHT_OP_LABEL,
  actiesVoor,
  deadlineStand,
  deadlineVan,
  filterAanvragen,
  kolomVan,
  ouderdom,
  sorteerKolom,
  tellingen,
  wachtOpVan,
} from '@/lib/aanvragen-bord'
import { formatDateBE, formatDateTimeBE } from '@/lib/datetime'

type Behandelaar = { id: number; naam: string }
type Props = { begin: Aanvraag[]; behandelaars: Behandelaar[]; ik: Behandelaar; focus: string | null; beginBron: string | null }

const initialen = (naam: string) =>
  naam
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || '?'

async function post(url: string, body: unknown): Promise<Record<string, unknown>> {
  const r = await fetch(url, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const d = (await r.json().catch(() => ({}))) as Record<string, unknown>
  if (!r.ok) throw new Error(String(d.error ?? `Mislukt (${r.status})`))
  return d
}

export function Bord({ begin, behandelaars, ik, focus, beginBron }: Props) {
  const router = useRouter()
  const [lijst, setLijst] = useState<Aanvraag[]>(begin)
  const [bron, setBron] = useState<Bron | null>((beginBron && beginBron in BRON_META ? beginBron : null) as Bron | null)
  const [mijn, setMijn] = useState(false)
  const [zoek, setZoek] = useState('')
  const [openSleutel, setOpenSleutel] = useState<string | null>(focus)
  const [sleep, setSleep] = useState<string | null>(null)
  const [over, setOver] = useState<Kolom | null>(null)
  const [wachtVraag, setWachtVraag] = useState<string | null>(null)
  const [taakOpen, setTaakOpen] = useState(false)
  const [laden, setLaden] = useState(false)

  useEffect(() => setLijst(begin), [begin])

  const herlaad = useCallback(async () => {
    setLaden(true)
    try {
      const r = await fetch('/api/federatie/aanvragen', { credentials: 'include' })
      if (r.ok) {
        const d = (await r.json()) as { aanvragen: Aanvraag[] }
        setLijst(d.aanvragen)
      }
    } finally {
      setLaden(false)
    }
    router.refresh()
  }, [router])

  // Eén dossierwijziging: het antwoord draagt het verse dossier, dat we in de kaart stoppen.
  const dossier = useCallback(
    async (a: Aanvraag, body: Record<string, unknown>, melding?: string) => {
      try {
        const d = await post('/api/federatie/dossiers', { sleutel: a.sleutel, titel: a.titel, ...body })
        if (d.dossier) setLijst((l) => l.map((x) => (x.sleutel === a.sleutel ? { ...x, dossier: d.dossier as Aanvraag['dossier'] } : x)))
        if (melding) toast('success', melding)
        if (body.actie === 'afronden' || body.actie === 'heropenen' || body.actie === 'verwijderen') await herlaad()
        return true
      } catch (err) {
        toast('error', (err as Error).message)
        return false
      }
    },
    [herlaad],
  )

  const gefilterd = useMemo(() => filterAanvragen(lijst, { bron, mijnId: mijn ? ik.id : null, zoek }), [lijst, bron, mijn, zoek, ik.id])
  const perKolom = useMemo(() => {
    const m: Record<Kolom, Aanvraag[]> = { nieuw: [], bezig: [], wacht: [], klaar: [] }
    for (const a of gefilterd) m[kolomVan(a)].push(a)
    for (const k of Object.keys(m) as Kolom[]) m[k] = sorteerKolom(m[k], k)
    return m
  }, [gefilterd])
  const tel = useMemo(() => tellingen(lijst), [lijst])
  const bronnen = useMemo(() => {
    const t = new Map<Bron, number>()
    for (const a of lijst) if (a.open) t.set(a.bron, (t.get(a.bron) ?? 0) + 1)
    return [...t.entries()].sort((x, y) => y[1] - x[1])
  }, [lijst])

  const open = openSleutel ? lijst.find((a) => a.sleutel === openSleutel) ?? null : null

  // Slepen: naar "In behandeling" = ik neem het op; naar "Nieuw" = loslaten; naar "Wacht" = op wie?
  // De sleutel komt uit dataTransfer (gezet bij dragstart): die is er altijd, ook als React tussen
  // dragstart en drop nog niet opnieuw tekende; de state is enkel voor de visuele toestand.
  const drop = async (kolom: Kolom, gesleept: string | null) => {
    setOver(null)
    const sleutel = gesleept || sleep
    const a = sleutel ? lijst.find((x) => x.sleutel === sleutel) : null
    setSleep(null)
    if (!a || !a.open) return
    const nu = kolomVan(a)
    if (nu === kolom) return
    if (kolom === 'klaar') {
      if (a.bron === 'taak') await dossier(a, { actie: 'afronden' }, 'Taak afgerond.')
      else {
        toast('info', 'Afhandelen doe je met de knop op de kaart: dan gebeurt het echt (goedkeuren, opleggen, …).')
        setOpenSleutel(a.sleutel)
      }
      return
    }
    if (kolom === 'wacht') {
      setWachtVraag(a.sleutel)
      return
    }
    if (kolom === 'bezig') {
      if (a.dossier?.wachtOp) await dossier(a, { actie: 'hervatten' })
      if (!a.dossier?.behandelaar) await dossier(a, { actie: 'toewijzen', behandelaar: ik.id }, 'Jij behandelt dit nu.')
      else if (a.wachtOpAuto) toast('info', `Volgens de aanvraag zelf wachten we nog op ${WACHT_OP_LABEL[a.wachtOpAuto]}.`)
      return
    }
    if (kolom === 'nieuw') {
      if (a.dossier?.wachtOp) await dossier(a, { actie: 'hervatten' })
      if (a.dossier?.behandelaar) await dossier(a, { actie: 'toewijzen', behandelaar: null }, 'Weer vrij voor iedereen.')
      if (a.wachtOpAuto) toast('info', `Volgens de aanvraag zelf wachten we nog op ${WACHT_OP_LABEL[a.wachtOpAuto]}; dat verandert pas als die reageert.`)
    }
  }

  return (
    <div className="bd">
      <header className="bd-kop">
        <div>
          <h1 className="page-title">Aanvragen &amp; taken</h1>
          <p className="page-sub">
            {tel.open === 0 ? 'Niets open.' : `${tel.open} open`}
            {tel.nieuw > 0 && ` · ${tel.nieuw} nieuw`}
            {tel.wacht > 0 && ` · ${tel.wacht} wachten op anderen`}
            {' · '}sleep een kaart om ze op te pakken of door te geven
          </p>
        </div>
        <div className="bd-kop-acties">
          <button type="button" className="fs-knop" onClick={() => void herlaad()} disabled={laden} title="Vernieuwen">
            <RefreshCw className={`fs-icon ${laden ? 'bd-draai' : ''}`} aria-hidden /> <span className="fs-alleen-breed">Vernieuwen</span>
          </button>
          <button type="button" className="fs-knop fs-knop-primair" onClick={() => setTaakOpen(true)}>
            <ListTodo className="fs-icon" aria-hidden /> Taak
          </button>
        </div>
      </header>

      <div className="bd-filters">
        <label className="bd-zoek">
          <Search className="fs-icon" aria-hidden />
          <input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek op club, naam, wedstrijd…" aria-label="Zoeken" />
          {zoek && (
            <button type="button" className="bd-zoek-wis" onClick={() => setZoek('')} aria-label="Wissen">
              <X className="fs-chev" aria-hidden />
            </button>
          )}
        </label>
        <div className="bd-chips" role="group" aria-label="Soort">
          <button type="button" className={`bd-chip ${bron === null ? 'on' : ''}`} onClick={() => setBron(null)}>
            Alles
          </button>
          {bronnen.map(([b, n]) => (
            <button key={b} type="button" className={`bd-chip ${bron === b ? 'on' : ''}`} onClick={() => setBron(bron === b ? null : b)}>
              {BRON_META[b].icoon} {BRON_META[b].meervoud} <span className="bd-chip-n">{n}</span>
            </button>
          ))}
          <button type="button" className={`bd-chip bd-chip-mijn ${mijn ? 'on' : ''}`} onClick={() => setMijn((v) => !v)}>
            <UserRound className="fs-chev" aria-hidden /> Mijn dossiers
          </button>
        </div>
      </div>

      <div className="bd-kolommen">
        {KOLOMMEN.map((k) => (
          <section
            key={k.key}
            className={`bd-kolom bd-kolom-${k.key} ${over === k.key ? 'over' : ''}`}
            aria-label={k.titel}
            onDragOver={(e) => {
              e.preventDefault()
              if (over !== k.key) setOver(k.key)
            }}
            onDragLeave={() => setOver((o) => (o === k.key ? null : o))}
            onDrop={(e) => {
              e.preventDefault()
              void drop(k.key, e.dataTransfer.getData('text/plain') || null)
            }}
          >
            <header className="bd-kolom-kop">
              <h2>
                {k.titel} <span className="bd-kolom-n">{perKolom[k.key].length}</span>
              </h2>
              <p>{k.uitleg}</p>
            </header>
            <div className="bd-kaarten">
              {perKolom[k.key].length === 0 && <p className="bd-leeg">{k.key === 'nieuw' ? 'Niets nieuws — mooi zo.' : '—'}</p>}
              {perKolom[k.key].map((a) => (
                <Kaart key={a.sleutel} a={a} ik={ik} open={() => setOpenSleutel(a.sleutel)} onSleep={(aan) => setSleep(aan ? a.sleutel : null)} slepend={sleep === a.sleutel} />
              ))}
            </div>
          </section>
        ))}
      </div>

      {open && (
        <Detail
          a={open}
          ik={ik}
          behandelaars={behandelaars}
          onClose={() => setOpenSleutel(null)}
          dossier={(body, melding) => dossier(open, body, melding)}
          naActie={herlaad}
        />
      )}
      {wachtVraag && (
        <WachtOpDialoog
          onClose={() => setWachtVraag(null)}
          kies={async (w, tekst) => {
            const a = lijst.find((x) => x.sleutel === wachtVraag)
            setWachtVraag(null)
            if (a) await dossier(a, { actie: 'wachten', wachtOp: w, tekst }, `Wacht op ${WACHT_OP_LABEL[w]}.`)
          }}
        />
      )}
      {taakOpen && <TaakDialoog onClose={() => setTaakOpen(false)} naBewaren={() => void herlaad()} />}
    </div>
  )
}

function Kaart({ a, ik, open, onSleep, slepend }: { a: Aanvraag; ik: Behandelaar; open: () => void; onSleep: (aan: boolean) => void; slepend: boolean }) {
  const meta = BRON_META[a.bron]
  const dl = deadlineStand(deadlineVan(a))
  const wacht = wachtOpVan(a)
  const beh = a.dossier?.behandelaar
  const nNotities = a.dossier?.notities.length ?? 0
  return (
    <article
      className={`bd-kaart bd-bron-${a.bron} ${slepend ? 'slepend' : ''} ${!a.open ? 'klaar' : ''}`}
      draggable={a.open}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', a.sleutel)
        onSleep(true)
      }}
      onDragEnd={() => onSleep(false)}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          open()
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={`${meta.label}: ${a.titel}`}
    >
      <div className="bd-kaart-kop">
        <span className="bd-soort">
          <span aria-hidden>{meta.icoon}</span> {meta.label}
        </span>
        <span className="bd-sinds" title={formatDateTimeBE(a.sinds)}>
          {a.open ? ouderdom(a.sinds) : a.afgeslotenOp ? formatDateBE(a.afgeslotenOp, { day: 'numeric', month: 'short' }) : ''}
        </span>
      </div>
      <strong className="bd-titel">{a.titel}</strong>
      {a.detail && <p className="bd-kaart-detail">{a.detail}</p>}
      <div className="bd-kaart-voet">
        {a.club && <span className="bd-club">{a.club}</span>}
        {wacht && a.open && (
          <span className="bd-tag bd-tag-wacht" title={a.dossier?.wachtOpTekst ?? ''}>
            <Hand className="fs-chev" aria-hidden /> {WACHT_OP_LABEL[wacht]}
          </span>
        )}
        {dl && a.open && (
          <span className={`bd-tag bd-tag-${dl.toon}`}>
            <Clock className="fs-chev" aria-hidden /> {dl.tekst}
          </span>
        )}
        {nNotities > 0 && (
          <span className="bd-tag">
            <MessageSquare className="fs-chev" aria-hidden /> {nNotities}
          </span>
        )}
        {!a.open && <span className="bd-tag bd-tag-klaar">{a.status}</span>}
        {beh && (
          <span className={`bd-avatar ${beh.id === ik.id ? 'ik' : ''}`} title={beh.naam}>
            {initialen(beh.naam)}
          </span>
        )}
      </div>
    </article>
  )
}

function Detail({
  a,
  ik,
  behandelaars,
  onClose,
  dossier,
  naActie,
}: {
  a: Aanvraag
  ik: Behandelaar
  behandelaars: Behandelaar[]
  onClose: () => void
  dossier: (body: Record<string, unknown>, melding?: string) => Promise<boolean>
  naActie: () => Promise<void>
}) {
  const [notitie, setNotitie] = useState('')
  const [bezig, setBezig] = useState<string | null>(null)
  const [vraag, setVraag] = useState<Actie | null>(null)
  const [toelichting, setToelichting] = useState('')
  const [wachtTekst, setWachtTekst] = useState(a.dossier?.wachtOpTekst ?? '')
  const acties = actiesVoor(a)
  const meta = BRON_META[a.bron]
  const beh = a.dossier?.behandelaar ?? null
  const wacht = wachtOpVan(a)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !vraag) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, vraag])

  const voerUit = async (actie: Actie, tekst = '') => {
    setBezig(actie.id)
    try {
      await post('/api/federatie/aanvragen', { sleutel: a.sleutel, actie: actie.id, toelichting: tekst })
      toast('success', `${actie.label}: gebeurd.`)
      setVraag(null)
      setToelichting('')
      await naActie()
      onClose()
    } catch (err) {
      toast('error', (err as Error).message)
    } finally {
      setBezig(null)
    }
  }
  const klik = (actie: Actie) => {
    if (actie.toelichting) {
      setVraag(actie)
      setToelichting('')
    } else void voerUit(actie)
  }

  return (
    <aside className="bd-detail" aria-label={`Dossier: ${a.titel}`}>
      <header className="bd-detail-kop">
        <span className="bd-soort">
          <span aria-hidden>{meta.icoon}</span> {meta.label} · {a.status}
        </span>
        <button type="button" className="fs-icoonknop" onClick={onClose} aria-label="Sluiten">
          <X className="fs-icon" aria-hidden />
        </button>
      </header>
      <h2 className="bd-detail-titel">{a.titel}</h2>
      {a.detail && <p className="bd-detail-tekst">{a.detail}</p>}
      <p className="bd-detail-meta">
        {a.club && <span>{a.club} · </span>}
        {a.open ? `sinds ${formatDateTimeBE(a.sinds)}` : a.afgeslotenOp ? `afgehandeld ${formatDateTimeBE(a.afgeslotenOp)}` : ''}
        {a.bron !== 'taak' && (
          <>
            {' · '}
            <Link href={a.href}>
              werkscherm <ExternalLink className="fs-chev bd-inline" aria-hidden />
            </Link>
          </>
        )}
      </p>

      {a.open && acties.length > 0 && (
        <section className="bd-blok bd-blok-acties">
          <h3>Beslissen</h3>
          {vraag ? (
            <div className="bd-vraag">
              <label>
                {vraag.label} — toelichting {vraag.toelichting === 'verplicht' ? '(verplicht; de andere partij leest ze)' : '(optioneel)'}
                <textarea value={toelichting} onChange={(e) => setToelichting(e.target.value)} rows={3} autoFocus />
              </label>
              <div className="bd-knoppen">
                <button type="button" className="fs-knop" onClick={() => setVraag(null)}>
                  Terug
                </button>
                <button
                  type="button"
                  className={`fs-knop ${vraag.stijl === 'gevaar' ? 'fs-knop-gevaar' : 'fs-knop-primair'}`}
                  disabled={bezig != null || (vraag.toelichting === 'verplicht' && toelichting.trim().length < 3)}
                  onClick={() => void voerUit(vraag, toelichting)}
                >
                  {bezig === vraag.id ? 'Bezig…' : vraag.label}
                </button>
              </div>
            </div>
          ) : (
            <div className="bd-knoppen">
              {acties.map((x) =>
                x.href?.startsWith('/api/') ? (
                  // Een document (PDF): in een nieuw tabblad, het bord blijft open.
                  <a key={x.id} href={x.href} target="_blank" rel="noopener noreferrer" className="fs-knop">
                    📄 {x.label}
                  </a>
                ) : x.href ? (
                  <Link key={x.id} href={x.href} className="fs-knop fs-knop-primair">
                    {x.label} →
                  </Link>
                ) : (
                  <button key={x.id} type="button" className={`fs-knop ${x.stijl === 'primair' ? 'fs-knop-primair' : x.stijl === 'gevaar' ? 'fs-knop-gevaar' : ''}`} disabled={bezig != null} onClick={() => klik(x)}>
                    {bezig === x.id ? 'Bezig…' : x.label}
                  </button>
                ),
              )}
            </div>
          )}
        </section>
      )}

      <section className="bd-blok">
        <h3>Opvolging</h3>
        <div className="bd-veld">
          <label htmlFor="bd-beh">Behandelaar</label>
          <div className="bd-veld-rij">
            <select id="bd-beh" value={beh?.id ?? ''} onChange={(e) => void dossier({ actie: 'toewijzen', behandelaar: e.target.value ? Number(e.target.value) : null }, e.target.value ? 'Doorgegeven — de collega krijgt een melding.' : 'Weer vrij voor iedereen.')} disabled={!a.open}>
              <option value="">Nog niemand</option>
              {behandelaars.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.naam}
                  {b.id === ik.id ? ' (ik)' : ''}
                </option>
              ))}
            </select>
            {a.open && beh?.id !== ik.id && (
              <button type="button" className="fs-knop" onClick={() => void dossier({ actie: 'toewijzen', behandelaar: ik.id }, 'Jij behandelt dit nu.')}>
                Ik neem het op
              </button>
            )}
          </div>
        </div>

        {a.open && (
          <div className="bd-veld">
            <label htmlFor="bd-wacht">Wacht op</label>
            <div className="bd-veld-rij">
              <select
                id="bd-wacht"
                value={a.dossier?.wachtOp ?? ''}
                onChange={(e) => (e.target.value ? void dossier({ actie: 'wachten', wachtOp: e.target.value, tekst: wachtTekst }, `Wacht op ${WACHT_OP_LABEL[e.target.value as WachtOp]}.`) : void dossier({ actie: 'hervatten' }, 'Weer in behandeling.'))}
              >
                <option value="">{a.wachtOpAuto ? `Niemand (volgens de aanvraag: ${WACHT_OP_LABEL[a.wachtOpAuto]})` : 'Niemand — wij zijn aan zet'}</option>
                {(Object.keys(WACHT_OP_LABEL) as WachtOp[]).map((w) => (
                  <option key={w} value={w}>
                    {WACHT_OP_LABEL[w]}
                  </option>
                ))}
              </select>
            </div>
            {a.dossier?.wachtOp && (
              <input
                className="bd-wacht-tekst"
                value={wachtTekst}
                onChange={(e) => setWachtTekst(e.target.value)}
                onBlur={() => wachtTekst !== (a.dossier?.wachtOpTekst ?? '') && void dossier({ actie: 'wachten', wachtOp: a.dossier!.wachtOp, tekst: wachtTekst })}
                placeholder="Waarop precies? bv. attest van de dokter"
                aria-label="Waarop wachten we"
              />
            )}
          </div>
        )}

        {a.open && (
          <div className="bd-veld">
            <label htmlFor="bd-dl">Tegen</label>
            <div className="bd-veld-rij">
              <input id="bd-dl" type="date" value={a.dossier?.deadline ? a.dossier.deadline.slice(0, 10) : ''} onChange={(e) => void dossier({ actie: 'deadline', datum: e.target.value || null }, e.target.value ? 'Deadline gezet.' : 'Deadline weg.')} />
              {wacht && <span className="bd-hint">De kaart staat bij “Wacht op anderen”.</span>}
            </div>
          </div>
        )}

        {a.bron === 'taak' && (
          <div className="bd-knoppen bd-taak-knoppen">
            {a.open ? (
              <button type="button" className="fs-knop fs-knop-primair" onClick={() => void dossier({ actie: 'afronden' }, 'Taak afgerond.')}>
                <Check className="fs-icon" aria-hidden /> Afronden
              </button>
            ) : (
              <button type="button" className="fs-knop" onClick={() => void dossier({ actie: 'heropenen' }, 'Taak weer open.')}>
                Heropenen
              </button>
            )}
            <button
              type="button"
              className="fs-knop fs-knop-gevaar"
              onClick={() => {
                if (window.confirm('Deze taak verwijderen?')) void dossier({ actie: 'verwijderen' }, 'Taak verwijderd.').then((ok) => ok && onClose())
              }}
            >
              <Trash2 className="fs-icon" aria-hidden /> Verwijderen
            </button>
          </div>
        )}
      </section>

      <section className="bd-blok">
        <h3>Notities {a.dossier?.notities.length ? `(${a.dossier.notities.length})` : ''}</h3>
        <ul className="bd-notities">
          {(a.dossier?.notities ?? []).map((n, i) => (
            <li key={i}>
              <span className="bd-notitie-wie">
                {n.door} · {n.op ? formatDateTimeBE(n.op) : ''}
              </span>
              <p>{n.tekst}</p>
            </li>
          ))}
        </ul>
        <form
          className="bd-notitie-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (notitie.trim().length < 1) return
            void dossier({ actie: 'notitie', tekst: notitie }).then((ok) => ok && setNotitie(''))
          }}
        >
          <textarea value={notitie} onChange={(e) => setNotitie(e.target.value)} rows={2} placeholder="Notitie voor jezelf en je collega’s…" />
          <button type="submit" className="fs-knop" disabled={notitie.trim().length < 1}>
            Bewaren
          </button>
        </form>
      </section>
    </aside>
  )
}

function WachtOpDialoog({ onClose, kies }: { onClose: () => void; kies: (w: WachtOp, tekst: string) => void }) {
  const [tekst, setTekst] = useState('')
  return (
    <FedDialoog titel="Op wie wachten we?" onClose={onClose}>
      <div className="fs-form">
        <label>
          Waarop precies <small>(optioneel)</small>
          <input value={tekst} onChange={(e) => setTekst(e.target.value)} placeholder="bv. attest van de dokter" autoComplete="off" />
        </label>
        <div className="bd-wacht-keuzes">
          {(Object.keys(WACHT_OP_LABEL) as WachtOp[]).map((w) => (
            <button key={w} type="button" className="fs-knop" onClick={() => kies(w, tekst)}>
              {WACHT_OP_LABEL[w]}
            </button>
          ))}
        </div>
      </div>
    </FedDialoog>
  )
}
