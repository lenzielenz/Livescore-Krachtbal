'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { toast } from '@/components/Toaster'
import type { AttestRij } from '@/lib/attest-server'
import { formatDateBE } from '@/lib/datetime'

const VIA: Record<string, string> = { club: 'door de club', lid: 'door het lid of een ouder', publiek: 'via de publieke link', federatie: 'door de federatie' }
const vak = (v: boolean | null | undefined) => (v === true ? '☑ aangekruist' : v === false ? '☐ leeg' : '? onduidelijk')

export function AttestenNakijken({ lijst, vandaag, alleenLezen }: { lijst: AttestRij[]; vandaag: string; alleenLezen: boolean }) {
  return (
    <ul className="an-lijst">
      {lijst.map((a) => (
        <Attest key={a.id} a={a} vandaag={vandaag} alleenLezen={alleenLezen} />
      ))}
    </ul>
  )
}

type Gevonden = { id: number; naam: string; club: string; categorie: string }

function Attest({ a, vandaag, alleenLezen }: { a: AttestRij; vandaag: string; alleenLezen: boolean }) {
  const router = useRouter()
  const [lid, setLid] = useState<{ id: number; naam: string } | null>(a.lid ?? a.voorstel)
  const [zoek, setZoek] = useState(a.opgegeven?.naam ?? '')
  const [gevonden, setGevonden] = useState<Gevonden[]>([])
  const [datum, setDatum] = useState(a.keuringOp ?? vandaag)
  const [nietHoger, setNietHoger] = useState(a.vakjes?.nietHoger === true)
  const [reden, setReden] = useState('')
  const [afkeuren, setAfkeuren] = useState(false)
  const [bezig, setBezig] = useState(false)
  const moetZoeken = !a.lid

  useEffect(() => {
    if (!moetZoeken || zoek.trim().length < 2) {
      setGevonden([])
      return
    }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/federatie/leden?zoek=${encodeURIComponent(zoek.trim())}&per=8`, { credentials: 'include' })
      const j = (await res.json().catch(() => null)) as { rijen?: Gevonden[] } | null
      setGevonden(j?.rijen ?? [])
    }, 250)
    return () => clearTimeout(t)
  }, [zoek, moetZoeken])

  const beslis = async (body: Record<string, unknown>) => {
    setBezig(true)
    try {
      const res = await fetch('/api/federatie/attesten', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: a.id, ...body }),
      })
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) return toast('error', j.error ?? 'Bewaren mislukt.')
      toast('success', body.besluit === 'goedkeuren' ? 'Goedgekeurd: de keuring staat in het dossier.' : 'Afgekeurd; het lid en de club krijgen een melding.')
      router.refresh()
    } finally {
      setBezig(false)
    }
  }

  return (
    <li className="an-kaart">
      <a className="an-beeld" href={a.url ?? '#'} target="_blank" rel="noopener" aria-label="Attest openen">
        {/* eslint-disable-next-line @next/next/no-img-element -- medisch bestand achter access-control, niet via de image-optimizer */}
        {a.url && !a.pdf ? <img src={a.url} alt="Opgeladen attest" loading="lazy" /> : <span>📄 PDF openen</span>}
      </a>
      <div className="an-info">
        <div className="an-kop">
          <strong>{a.lid ? a.lid.naam : a.opgegeven?.naam ? `Blanco: ${a.opgegeven.naam}` : 'Blanco attest'}</strong>
          {a.lid?.club && <span className="an-dim"> · {a.lid.club}</span>}
        </div>
        <p className="an-dim">
          {formatDateBE(a.op)} · {VIA[a.via ?? ''] ?? 'opgeladen'}
          {a.opgegeven?.geboortedatum ? ` · geboren ${formatDateBE(a.opgegeven.geboortedatum)}` : ''}
          {a.opgegeven?.club ? ` · club volgens de uploader: ${a.opgegeven.club}` : ''}
          {a.opgegeven?.email ? ` · ${a.opgegeven.email}` : ''}
        </p>
        {a.reden && <p className="an-reden">{a.reden}</p>}
        {a.afkeurReden && <p className="an-reden an-af">Afgekeurd: {a.afkeurReden}</p>}
        <p className="an-dim">
          Gelezen: geschikt {a.vakjes ? vak(a.vakjes.geschikt) : '— niet gelezen'} · mag niet hoger {a.vakjes ? vak(a.vakjes.nietHoger) : '— niet gelezen'}
        </p>

        {!alleenLezen && (
          <div className="an-beslis">
            {moetZoeken && (
              <div className="an-zoek">
                <label>
                  Lid
                  <input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek op naam" />
                </label>
                {lid && (
                  <p className="an-gekozen">
                    ✓ Gekozen: {lid.naam}
                    {a.voorstel?.id === lid.id ? ' (zelfde naam en geboortedatum)' : ''}
                  </p>
                )}
                {gevonden.length > 0 && (
                  <ul>
                    {gevonden.map((g) => (
                      <li key={g.id}>
                        <button type="button" onClick={() => setLid({ id: g.id, naam: g.naam })} aria-pressed={lid?.id === g.id}>
                          {g.naam} <span className="an-dim">{[g.club, g.categorie].filter(Boolean).join(' · ')}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <div className="an-rij">
              <label>
                Datum van de keuring
                <input type="date" value={datum} max={vandaag} onChange={(e) => setDatum(e.target.value)} />
              </label>
              <label className="an-vink">
                <input type="checkbox" checked={nietHoger} onChange={(e) => setNietHoger(e.target.checked)} /> Mag niet 1 categorie hoger spelen
              </label>
            </div>
            {afkeuren ? (
              <div className="an-rij">
                <label style={{ flex: 1 }}>
                  Waarom niet in orde?
                  <input value={reden} onChange={(e) => setReden(e.target.value)} placeholder="bv. geen stempel van de arts" />
                </label>
                <button type="button" className="wb-btn an-rood" disabled={bezig || reden.trim().length < 5} onClick={() => beslis({ besluit: 'afkeuren', reden })}>
                  Afkeuren
                </button>
                <button type="button" className="wb-btn" onClick={() => setAfkeuren(false)}>
                  Terug
                </button>
              </div>
            ) : (
              <div className="an-rij">
                <button
                  type="button"
                  className="wb-btn wb-btn-primary"
                  disabled={bezig || !lid || !datum}
                  onClick={() => beslis({ besluit: 'goedkeuren', playerId: lid?.id, keuringOp: datum, nietHoger })}
                >
                  ✓ Goedkeuren{lid && moetZoeken ? ` voor ${lid.naam}` : ''}
                </button>
                <button type="button" className="wb-btn" onClick={() => setAfkeuren(true)}>
                  ✕ Niet in orde…
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </li>
  )
}
