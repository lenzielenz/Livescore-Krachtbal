'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'

import { Herstellink } from '@/components/Herstellink'
import { toast } from '@/components/Toaster'
import { KaartAanvragen } from '../../profiel/KaartAanvragen'
import { ledenCsv } from '@/lib/club-overzicht'
import { dateStrBE } from '@/lib/datetime'
import {
  clubMagBewerken,
  ontbreektVoorIndienen,
  registratieIcoon,
  type RegistratieInput,
} from '@/lib/registratie'

export type ClubLid = {
  id: number
  teamId: number
  naam: string
  voornaam: string
  achternaam: string
  birthDate: string
  geslacht: string
  soortLid: string
  shirtNumber: number
  medischeKeuringOp: string
  attestUrl: string | null
  registratieStatus: string
  afkeurReden: string
  vergunningsstatus: string
  medischAttest: boolean
  actief: boolean
  email: string
  /** Account gekoppeld aan dit dossier (eigen login), of null. */
  login: { id: number; email: string } | null
  /** E-mailadres van een ouder (jeugd) en diens account, dat het dossier van het kind ziet. */
  ouderEmail: string
  ouder: { id: number; email: string } | null
  /** Ligt er een aanvraag voor een medische kaart bij de federatie? */
  kaartOpen: boolean
  /** Vastspelen: hoe vaak hoger gespeeld, of vast in een hogere reeks (lib/competitieregels.ts). */
  knipjes: string | null
}

type Team = { id: number; naam: string; reeks: string }

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

const input = (l: ClubLid): RegistratieInput => ({
  voornaam: l.voornaam,
  achternaam: l.achternaam,
  birthDate: l.birthDate,
  geslacht: l.geslacht,
  soortLid: l.soortLid,
  medischeKeuringOp: l.medischeKeuringOp,
  email: l.email,
  heeftAttest: Boolean(l.attestUrl),
  registratieStatus: l.registratieStatus,
  vergunningsstatus: l.vergunningsstatus,
  medischAttest: l.medischAttest,
  actief: l.actief,
})

/** Bestaande leden van vóór de registratie hebben enkel een volledige naam: splits op de eerste spatie. */
const splitsNaam = (naam: string): [string, string] => {
  const i = naam.indexOf(' ')
  return i < 0 ? [naam, ''] : [naam.slice(0, i), naam.slice(i + 1)]
}

async function post(
  url: string,
  body: unknown,
): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  })
  return { ok: res.ok, data: (await res.json().catch(() => ({}))) as Record<string, unknown> }
}

function LidFormulier({
  lid,
  teams,
  standaardTeam,
  onKlaar,
  emailVanaf,
}: {
  lid: ClubLid | null
  teams: Team[]
  standaardTeam: number
  onKlaar: () => void
  emailVanaf?: number
}) {
  const [vn0, an0] = lid
    ? lid.voornaam || lid.achternaam
      ? [lid.voornaam, lid.achternaam]
      : splitsNaam(lid.naam)
    : ['', '']
  const [v, setV] = useState({
    teamId: lid?.teamId ?? standaardTeam,
    voornaam: vn0,
    achternaam: an0,
    birthDate: lid?.birthDate ?? '',
    geslacht: lid?.geslacht ?? '',
    soortLid: lid?.soortLid ?? 'speler',
    shirtNumber: lid ? String(lid.shirtNumber) : '',
    medischeKeuringOp: lid?.medischeKeuringOp ?? '',
    email: lid?.email ?? '',
    ouderEmail: lid?.ouderEmail ?? '',
  })
  const [bestand, setBestand] = useState<File | null>(null)
  const [bezig, setBezig] = useState(false)
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) =>
    setV((o) => ({ ...o, [k]: e.target.value }))

  const bewaar = async () => {
    setBezig(true)
    try {
      const r = await post('/api/club/leden', { actie: 'opslaan', playerId: lid?.id ?? null, ...v })
      if (!r.ok) {
        toast('error', String(r.data.error ?? 'Bewaren mislukt.'))
        return
      }
      if (bestand) {
        const fd = new FormData()
        fd.set('playerId', String(r.data.id))
        fd.set('bestand', bestand)
        const res = await fetch('/api/club/leden/attest', {
          method: 'POST',
          body: fd,
          credentials: 'include',
        })
        const d = (await res.json().catch(() => ({}))) as { error?: string }
        if (!res.ok) {
          toast('error', `Lid bewaard, maar het attest niet: ${d.error ?? 'fout'}`)
          onKlaar()
          return
        }
      }
      toast('success', lid ? 'Lid bijgewerkt.' : 'Lid toegevoegd.')
      onKlaar()
    } finally {
      setBezig(false)
    }
  }

  const speler = v.soortLid !== 'lid'
  return (
    <div className="cl-form">
      <div className="cl-grid">
        <label>
          Voornaam
          <input value={v.voornaam} onChange={set('voornaam')} autoComplete="off" />
        </label>
        <label>
          Naam
          <input value={v.achternaam} onChange={set('achternaam')} autoComplete="off" />
        </label>
        <label>
          Geboortedatum
          <input type="date" value={v.birthDate} onChange={set('birthDate')} />
        </label>
        <label>
          Geslacht
          <select value={v.geslacht} onChange={set('geslacht')}>
            <option value="">Kies…</option>
            <option value="m">Man</option>
            <option value="v">Vrouw</option>
          </select>
        </label>
        <label>
          E-mailadres{emailVanaf != null ? ` (verplicht vanaf ${emailVanaf} jaar)` : ''}
          <input
            type="email"
            value={v.email}
            onChange={set('email')}
            autoComplete="off"
            placeholder="voor de eigen login"
          />
        </label>
        <label>
          E-mailadres ouder (jeugd)
          <input
            type="email"
            value={v.ouderEmail}
            onChange={set('ouderEmail')}
            autoComplete="off"
            placeholder="ouder ziet het dossier en voert de keuring in"
          />
        </label>
        <label>
          Soort
          <select value={v.soortLid} onChange={set('soortLid')}>
            <option value="speler">Speler (met vergunning)</option>
            <option value="lid">Gewoon lid</option>
          </select>
        </label>
        <label>
          Ploeg
          <select
            value={v.teamId}
            onChange={(e) => setV((o) => ({ ...o, teamId: Number(e.target.value) }))}
          >
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.naam}
                {t.reeks ? ` · ${t.reeks}` : ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          Rugnummer
          <input
            inputMode="numeric"
            value={v.shirtNumber}
            onChange={set('shirtNumber')}
            placeholder="vanzelf"
          />
        </label>
        {speler && (
          <label>
            Datum medische keuring
            <input type="date" value={v.medischeKeuringOp} onChange={set('medischeKeuringOp')} />
          </label>
        )}
        {speler && (
          <label className="cl-wide">
            Doktersattest (PDF of foto)
            {lid?.attestUrl ? ' — er is er al één; kies een nieuw om te vervangen' : ''}
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              onChange={(e) => setBestand(e.target.files?.[0] ?? null)}
            />
          </label>
        )}
      </div>
      <div className="cl-form-acties">
        <button type="button" className="cl-btn cl-btn-primary" disabled={bezig} onClick={bewaar}>
          {bezig ? 'Bezig…' : lid ? 'Bewaren' : 'Lid toevoegen'}
        </button>
        <button type="button" className="cl-btn" disabled={bezig} onClick={onKlaar}>
          Annuleren
        </button>
      </div>
    </div>
  )
}

export function ClubLeden({
  teams,
  leden,
  emailVanaf,
  magLinks,
}: {
  teams: Team[]
  leden: ClubLid[]
  emailVanaf: number
  magLinks: boolean
}) {
  const router = useRouter()
  const [zoek, setZoek] = useState('')
  const [filter, setFilter] = useState<'alle' | 'todo' | 'wacht' | 'ok'>('alle')
  const [gekozen, setGekozen] = useState<Set<number>>(new Set())
  const [bewerk, setBewerk] = useState<number | 'nieuw' | null>(null)
  const [bezig, setBezig] = useState(false)

  const klaar = () => {
    setBewerk(null)
    router.refresh()
  }

  const perPloeg = useMemo(() => {
    const q = norm(zoek.trim())
    const map = new Map<number, ClubLid[]>()
    for (const l of leden) {
      const ic = registratieIcoon(input(l), undefined, emailVanaf)
      if (filter === 'todo' && ic.toon !== 'todo' && ic.toon !== 'fout') continue
      if (filter === 'wacht' && ic.toon !== 'wacht') continue
      if (filter === 'ok' && ic.toon !== 'ok') continue
      if (q && !norm(l.naam).includes(q)) continue
      const arr = map.get(l.teamId) ?? []
      arr.push(l)
      map.set(l.teamId, arr)
    }
    return teams
      .map((t) => ({ team: t, leden: map.get(t.id) ?? [] }))
      .filter((g) => g.leden.length > 0)
  }, [leden, teams, zoek, filter])

  const tel = useMemo(() => {
    const c = { ok: 0, wacht: 0, todo: 0 }
    for (const l of leden) {
      const t = registratieIcoon(input(l), undefined, emailVanaf).toon
      if (t === 'ok') c.ok += 1
      else if (t === 'wacht') c.wacht += 1
      else if (t === 'todo' || t === 'fout') c.todo += 1
    }
    return c
  }, [leden])

  // Indienbaar = volledig en niet al bij de federatie. Wie al speelgerechtigd is, dien je enkel
  // opnieuw in na een nieuwe keuring (dan is de datum veranderd); die staat dan niet als ✅.
  const indienbaar = (l: ClubLid) =>
    clubMagBewerken(l.registratieStatus) &&
    ontbreektVoorIndienen(input(l), undefined, emailVanaf).length === 0 &&
    registratieIcoon(input(l), undefined, emailVanaf).toon !== 'ok'
  const klaarVoorIndienen = leden.filter(indienbaar)

  const dienIn = async (ids: number[]) => {
    if (!ids.length) return
    setBezig(true)
    try {
      const r = await post('/api/club/leden', { actie: 'indienen', playerIds: ids })
      if (!r.ok) {
        toast('error', String(r.data.error ?? 'Indienen mislukt.'))
        return
      }
      const n = (r.data.ingediend as unknown[] | undefined)?.length ?? 0
      const over = (r.data.overgeslagen as { naam: string; reden: string }[] | undefined) ?? []
      toast(
        over.length ? 'info' : 'success',
        `${n} ${n === 1 ? 'lid' : 'leden'} ingediend bij de federatie.${over.length ? ` Niet ingediend: ${over.map((o) => `${o.naam} (${o.reden})`).join('; ')}` : ''}`,
      )
      setGekozen(new Set())
      router.refresh()
    } finally {
      setBezig(false)
    }
  }

  // Het volledige ledenbestand als CSV (Excel), zonder medische gegevens — zie lib/club-overzicht.ts.
  const exporteer = () => {
    const ploegNaam = new Map(teams.map((t) => [t.id, t.naam]))
    const csv = ledenCsv(
      leden.map((l) => ({
        naam: l.naam,
        voornaam: l.voornaam,
        achternaam: l.achternaam,
        ploeg: ploegNaam.get(l.teamId) ?? '',
        rugnummer: l.shirtNumber || null,
        geboortedatum: l.birthDate,
        geslacht: l.geslacht,
        soortLid: l.soortLid,
        status: registratieIcoon(input(l), undefined, emailVanaf).label,
        email: l.email,
        ouderEmail: l.ouderEmail,
        login: Boolean(l.login),
      })),
    )
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `ledenbestand-${dateStrBE()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const toggle = (id: number) =>
    setGekozen((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  return (
    <div className="cl-wrap">
      <div className="cl-tellers">
        <button
          type="button"
          className={`cl-teller ${filter === 'ok' ? 'on' : ''}`}
          onClick={() => setFilter(filter === 'ok' ? 'alle' : 'ok')}
        >
          <strong>✅ {tel.ok}</strong> mag spelen
        </button>
        <button
          type="button"
          className={`cl-teller ${filter === 'wacht' ? 'on' : ''}`}
          onClick={() => setFilter(filter === 'wacht' ? 'alle' : 'wacht')}
        >
          <strong>⏳ {tel.wacht}</strong> bij de federatie
        </button>
        <button
          type="button"
          className={`cl-teller ${filter === 'todo' ? 'on' : ''}`}
          onClick={() => setFilter(filter === 'todo' ? 'alle' : 'todo')}
        >
          <strong>✎ {tel.todo}</strong> te doen
        </button>
      </div>

      <div className="cl-toolbar">
        <input
          className="acc-search"
          type="search"
          value={zoek}
          onChange={(e) => setZoek(e.target.value)}
          placeholder="Zoek een lid…"
          aria-label="Zoek een lid"
        />
        <button type="button" className="cl-btn cl-btn-primary" onClick={() => setBewerk('nieuw')}>
          + Lid toevoegen
        </button>
        <button
          type="button"
          className="cl-btn cl-btn-send"
          disabled={bezig || (gekozen.size === 0 && klaarVoorIndienen.length === 0)}
          onClick={() => dienIn(gekozen.size ? [...gekozen] : klaarVoorIndienen.map((l) => l.id))}
          title={gekozen.size ? 'Dien de aangevinkte leden in' : 'Dien alle volledige leden in'}
        >
          📤 Indienen bij federatie ({gekozen.size || klaarVoorIndienen.length})
        </button>
        <button type="button" className="cl-btn" onClick={exporteer} disabled={leden.length === 0} title="Download het ledenbestand voor Excel">
          ⬇ Exporteer ({leden.length})
        </button>
      </div>

      {bewerk === 'nieuw' && (
        <LidFormulier
          lid={null}
          teams={teams}
          standaardTeam={teams[0]?.id ?? 0}
          onKlaar={klaar}
          emailVanaf={emailVanaf}
        />
      )}

      {perPloeg.length === 0 ? (
        <p className="empty">Geen leden gevonden.</p>
      ) : (
        <div className="cl-ploegen">
          {perPloeg.map(({ team, leden: lijst }) => (
            <section key={team.id} className="cl-ploeg">
              <h2 className="acc-group-head">
                {team.naam} {team.reeks && <span className="acc-count">{team.reeks}</span>}{' '}
                <span className="acc-count">· {lijst.length}</span>
              </h2>
              {lijst.map((l) => {
                const ic = registratieIcoon(input(l), undefined, emailVanaf)
                const kan = indienbaar(l)
                return (
                  <div key={l.id} className={`cl-rij cl-${ic.toon}`}>
                    <div className="cl-rij-hoofd">
                      <input
                        type="checkbox"
                        checked={gekozen.has(l.id)}
                        disabled={!kan}
                        onChange={() => toggle(l.id)}
                        aria-label={`Kies ${l.naam} om in te dienen`}
                      />
                      <span className="cl-icoon" title={ic.label} aria-label={ic.label}>
                        {ic.icoon}
                      </span>
                      <span className="cl-id">
                        <span className="cl-naam">
                          #{l.shirtNumber} {l.naam}
                        </span>
                        <span className="cl-sub">
                          {ic.label}
                          {l.registratieStatus === 'afgekeurd' && l.afkeurReden
                            ? ` — ${l.afkeurReden}`
                            : ''}
                        </span>
                        {l.knipjes && <span className="cl-sub">{l.knipjes}</span>}
                      </span>
                      {l.attestUrl && (
                        <a
                          className="cl-link"
                          href={l.attestUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          📄 attest
                        </a>
                      )}
                      {/* Eigen login van het lid: klaar na goedkeuring als er een e-mailadres is. De
                          club-beheerder kan de (nieuwe) link doorgeven. */}
                      {l.login ? (
                        magLinks ? (
                          <Herstellink
                            userId={l.login.id}
                            email={l.login.email}
                            chipClassName="cl-btn"
                          />
                        ) : (
                          <span className="cl-sub">🔑 login</span>
                        )
                      ) : l.email ? (
                        <span
                          className="cl-sub"
                          title="De login wordt aangemaakt bij de goedkeuring"
                        >
                          ✉️ {l.email}
                        </span>
                      ) : null}
                      {/* De ouder van een jeugdspeler heeft een login met het dossier van het kind. */}
                      {l.ouder ? (
                        magLinks ? (
                          <Herstellink userId={l.ouder.id} email={l.ouder.email} chipClassName="cl-btn" label="👪 ouder" />
                        ) : (
                          <span className="cl-sub">👪 {l.ouder.email}</span>
                        )
                      ) : null}
                      {l.soortLid !== 'lid' && (
                        <KaartAanvragen open={l.kaartOpen} playerId={l.id} klein />
                      )}
                      {clubMagBewerken(l.registratieStatus) && (
                        <button
                          type="button"
                          className="cl-btn"
                          onClick={() => setBewerk(bewerk === l.id ? null : l.id)}
                        >
                          {bewerk === l.id ? 'Sluiten' : 'Bewerken'}
                        </button>
                      )}
                    </div>
                    {bewerk === l.id && (
                      <LidFormulier
                        lid={l}
                        teams={teams}
                        standaardTeam={l.teamId}
                        onKlaar={klaar}
                      />
                    )}
                  </div>
                )
              })}
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
