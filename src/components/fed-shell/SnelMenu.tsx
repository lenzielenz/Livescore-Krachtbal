'use client'

import { ArrowLeftRight, Building2, ChevronDown, ListTodo, Megaphone, Plus, Stethoscope, UserCheck } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import { toast } from '@/components/Toaster'
import { FedDialoog } from './FedDialoog'

// "Snel doen": de handelingen die de federatie het vaakst nodig heeft, in één of twee klikken vanuit
// elke pagina — een scheidsrechter toevoegen, een taak op het bord zetten, een bericht aan alle clubs
// of scheidsrechters, en de sprongen naar club aanmaken, wedstrijd verplaatsen en leden keuren.

type Dialoog = 'scheidsrechter' | 'taak' | 'bericht' | null
type Behandelaar = { id: number; naam: string }

export function SnelMenu({ compact }: { compact?: boolean }) {
  const [open, setOpen] = useState(false)
  const [dialoog, setDialoog] = useState<Dialoog>(null)
  const menu = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const buiten = (e: MouseEvent) => {
      if (open && menu.current && !menu.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', buiten)
    return () => document.removeEventListener('mousedown', buiten)
  }, [open])

  const kies = (d: Dialoog) => {
    setOpen(false)
    setDialoog(d)
  }

  return (
    <div className="fs-snel" ref={menu}>
      <button type="button" className={`fs-snel-knop ${compact ? 'fs-snel-compact' : ''}`} aria-expanded={open} onClick={() => setOpen((v) => !v)} title="Snel doen">
        <Plus className="fs-icon" aria-hidden />
        <span className="fs-alleen-breed">Snel doen</span>
        <ChevronDown className="fs-chev fs-alleen-breed" aria-hidden />
      </button>
      {open && (
        <div className="fs-snel-menu" role="menu">
          <button type="button" role="menuitem" onClick={() => kies('scheidsrechter')}>
            <UserCheck className="fs-icon" aria-hidden /> Scheidsrechter toevoegen
          </button>
          <button type="button" role="menuitem" onClick={() => kies('taak')}>
            <ListTodo className="fs-icon" aria-hidden /> Taak op het bord
          </button>
          <button type="button" role="menuitem" onClick={() => kies('bericht')}>
            <Megaphone className="fs-icon" aria-hidden /> Bericht aan clubs of scheidsrechters
          </button>
          <div className="fs-snel-scheiding" />
          <Link href="/beheer/clubs" role="menuitem" onClick={() => setOpen(false)}>
            <Building2 className="fs-icon" aria-hidden /> Club aanmaken of uitnodigen
          </Link>
          <Link href="/beheer/wedstrijden" role="menuitem" onClick={() => setOpen(false)}>
            <ArrowLeftRight className="fs-icon" aria-hidden /> Wedstrijd verplaatsen
          </Link>
          <Link href="/beheer/leden" role="menuitem" onClick={() => setOpen(false)}>
            <Stethoscope className="fs-icon" aria-hidden /> Leden keuren
          </Link>
        </div>
      )}
      {dialoog === 'scheidsrechter' && <ScheidsrechterDialoog onClose={() => setDialoog(null)} />}
      {dialoog === 'taak' && <TaakDialoog onClose={() => setDialoog(null)} />}
      {dialoog === 'bericht' && <BerichtDialoog onClose={() => setDialoog(null)} />}
    </div>
  )
}

async function post(url: string, body: unknown): Promise<Record<string, unknown>> {
  const r = await fetch(url, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const d = (await r.json().catch(() => ({}))) as Record<string, unknown>
  if (!r.ok) throw new Error(String(d.error ?? `Mislukt (${r.status})`))
  return d
}

export function ScheidsrechterDialoog({ onClose, naBewaren }: { onClose: () => void; naBewaren?: () => void }) {
  const router = useRouter()
  const [naam, setNaam] = useState('')
  const [email, setEmail] = useState('')
  const [nummer, setNummer] = useState('')
  const [bezig, setBezig] = useState(false)
  const [link, setLink] = useState<string | null>(null)

  const bewaar = async (e: React.FormEvent) => {
    e.preventDefault()
    setBezig(true)
    try {
      const d = await post('/api/federatie/scheidsrechters', { naam, email, federationNumber: nummer })
      toast('success', email ? (d.nieuw ? `${naam} toegevoegd — bezorg de link.` : `${naam} toegevoegd en gekoppeld aan het bestaande account.`) : `${naam} toegevoegd.`)
      router.refresh()
      naBewaren?.()
      if (d.link) setLink(String(d.link))
      else onClose()
    } catch (err) {
      toast('error', (err as Error).message)
    } finally {
      setBezig(false)
    }
  }

  if (link) {
    return (
      <FedDialoog titel="Scheidsrechter toegevoegd" onClose={onClose}>
        <p className="fs-dlg-uitleg">
          Bezorg {naam} deze eenmalige link (24 uur geldig). Daarmee kiest hij of zij zelf een wachtwoord en ziet meteen de toegewezen wedstrijden en de QR in het scheidsrechtersportaal.
        </p>
        <div className="fs-link-vak">
          <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Uitnodigingslink" />
          <button
            type="button"
            className="fs-knop fs-knop-primair"
            onClick={() => {
              void navigator.clipboard?.writeText(link).then(() => toast('success', 'Link gekopieerd.'))
            }}
          >
            Kopiëren
          </button>
        </div>
        <div className="fs-dlg-acties">
          <button type="button" className="fs-knop" onClick={onClose}>
            Klaar
          </button>
        </div>
      </FedDialoog>
    )
  }

  return (
    <FedDialoog titel="Scheidsrechter toevoegen" onClose={onClose}>
      <form onSubmit={bewaar} className="fs-form">
        <label>
          Naam
          <input value={naam} onChange={(e) => setNaam(e.target.value)} required minLength={3} placeholder="Voornaam Naam" autoComplete="off" />
        </label>
        <label>
          E-mailadres <small>(optioneel — dan krijgt hij of zij meteen een login)</small>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="naam@voorbeeld.be" autoComplete="off" />
        </label>
        <label>
          Federatie-lidnummer <small>(optioneel)</small>
          <input value={nummer} onChange={(e) => setNummer(e.target.value)} placeholder="bv. 1234" autoComplete="off" />
        </label>
        <p className="fs-dlg-uitleg">Daarna kan je hem of haar meteen toewijzen op <Link href="/beheer/scheidsrechters">Scheidsrechters</Link>.</p>
        <div className="fs-dlg-acties">
          <button type="button" className="fs-knop" onClick={onClose}>
            Annuleren
          </button>
          <button type="submit" className="fs-knop fs-knop-primair" disabled={bezig || naam.trim().length < 3}>
            {bezig ? 'Bezig…' : 'Toevoegen'}
          </button>
        </div>
      </form>
    </FedDialoog>
  )
}

export function TaakDialoog({ onClose, naBewaren }: { onClose: () => void; naBewaren?: () => void }) {
  const router = useRouter()
  const [titel, setTitel] = useState('')
  const [omschrijving, setOmschrijving] = useState('')
  const [behandelaar, setBehandelaar] = useState<string>('')
  const [deadline, setDeadline] = useState('')
  const [wie, setWie] = useState<Behandelaar[]>([])
  const [bezig, setBezig] = useState(false)

  useEffect(() => {
    fetch('/api/federatie/aanvragen', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { behandelaars?: Behandelaar[]; ik?: Behandelaar } | null) => {
        if (d?.behandelaars) setWie(d.behandelaars)
        if (d?.ik) setBehandelaar(String(d.ik.id))
      })
      .catch(() => {})
  }, [])

  const bewaar = async (e: React.FormEvent) => {
    e.preventDefault()
    setBezig(true)
    try {
      await post('/api/federatie/dossiers', { actie: 'taak', titel, omschrijving, behandelaar: behandelaar || null, deadline: deadline || null })
      toast('success', 'Taak staat op het bord.')
      router.refresh()
      naBewaren?.()
      onClose()
    } catch (err) {
      toast('error', (err as Error).message)
    } finally {
      setBezig(false)
    }
  }

  return (
    <FedDialoog titel="Taak op het bord" onClose={onClose}>
      <form onSubmit={bewaar} className="fs-form">
        <label>
          Wat moet er gebeuren?
          <input value={titel} onChange={(e) => setTitel(e.target.value)} required minLength={3} placeholder="bv. Verzekeringspolis vernieuwen" autoComplete="off" />
        </label>
        <label>
          Toelichting <small>(optioneel)</small>
          <textarea value={omschrijving} onChange={(e) => setOmschrijving(e.target.value)} rows={3} />
        </label>
        <div className="fs-form-rij">
          <label>
            Wie
            <select value={behandelaar} onChange={(e) => setBehandelaar(e.target.value)}>
              <option value="">Nog niemand</option>
              {wie.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.naam}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tegen
            <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </label>
        </div>
        <div className="fs-dlg-acties">
          <button type="button" className="fs-knop" onClick={onClose}>
            Annuleren
          </button>
          <button type="submit" className="fs-knop fs-knop-primair" disabled={bezig || titel.trim().length < 3}>
            {bezig ? 'Bezig…' : 'Op het bord zetten'}
          </button>
        </div>
      </form>
    </FedDialoog>
  )
}

const GROEPEN: { value: string; label: string; uitleg: string }[] = [
  { value: 'clubs', label: 'Alle clubs', uitleg: 'clubbeheerders en clubmedewerkers' },
  { value: 'scheidsrechters', label: 'Alle scheidsrechters', uitleg: 'iedereen met een scheidsrechtersaccount' },
  { value: 'coaches', label: 'Alle coaches en trainers', uitleg: 'wie die functie in zijn club heeft' },
  { value: 'federatie', label: 'De federatie zelf', uitleg: 'je collega’s' },
]

export function BerichtDialoog({ onClose }: { onClose: () => void }) {
  const [aan, setAan] = useState('clubs')
  const [titel, setTitel] = useState('')
  const [tekst, setTekst] = useState('')
  const [url, setUrl] = useState('')
  const [bezig, setBezig] = useState(false)

  const verstuur = async (e: React.FormEvent) => {
    e.preventDefault()
    setBezig(true)
    try {
      const d = await post('/api/federatie/bericht', { aan, titel, tekst, url })
      toast('success', `Bericht bezorgd aan ${Number(d.ontvangers ?? 0)} ${Number(d.ontvangers) === 1 ? 'persoon' : 'personen'}.`)
      onClose()
    } catch (err) {
      toast('error', (err as Error).message)
    } finally {
      setBezig(false)
    }
  }

  const groep = GROEPEN.find((g) => g.value === aan)
  return (
    <FedDialoog titel="Bericht sturen" onClose={onClose}>
      <form onSubmit={verstuur} className="fs-form">
        <label>
          Aan
          <select value={aan} onChange={(e) => setAan(e.target.value)}>
            {GROEPEN.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
          {groep && <small>{groep.uitleg}; als melding (🔔) en push.</small>}
        </label>
        <label>
          Titel
          <input value={titel} onChange={(e) => setTitel(e.target.value)} required minLength={3} maxLength={120} placeholder="bv. Inschrijvingen sluiten vrijdag" autoComplete="off" />
        </label>
        <label>
          Bericht <small>(optioneel)</small>
          <textarea value={tekst} onChange={(e) => setTekst(e.target.value)} rows={4} maxLength={1500} />
        </label>
        <label>
          Link <small>(optioneel, bv. /beheer/inschrijvingen of /nieuws/…)</small>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="/…" autoComplete="off" />
        </label>
        <div className="fs-dlg-acties">
          <button type="button" className="fs-knop" onClick={onClose}>
            Annuleren
          </button>
          <button type="submit" className="fs-knop fs-knop-primair" disabled={bezig || titel.trim().length < 3}>
            {bezig ? 'Bezig…' : 'Versturen'}
          </button>
        </div>
      </form>
    </FedDialoog>
  )
}
