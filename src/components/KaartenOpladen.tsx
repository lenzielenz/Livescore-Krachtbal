'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { toast } from '@/components/Toaster'
import { dateStrBE } from '@/lib/datetime'
import './kaarten-opladen.css'

type Resultaat =
  | { bestand: string; ok: true; playerId: number | null; naam: string; viaQr: boolean; status?: string; reden?: string | null; meldingen?: string[] }
  | { bestand: string; ok: false; fout: string }

// Ingevulde medische kaarten opladen (/api/medische-kaart/opladen). De QR op elke foto zegt bij welk lid
// de kaart hoort — niemand hoeft te kiezen. Twee vormen:
//   • stapel (club of federatie): veel foto's tegelijk, één keuringsdatum voor allemaal (optioneel);
//   • één lid (`voorLid`, de pagina achter de QR): één foto, rechtstreeks met de gsm-camera, datum verplicht.
export function KaartenOpladen({ voorLid, naam }: { voorLid?: number; naam?: string }) {
  const router = useRouter()
  const enkel = voorLid != null
  const [bestanden, setBestanden] = useState<File[]>([])
  const [datum, setDatum] = useState('')
  const [bezig, setBezig] = useState(false)
  const [resultaten, setResultaten] = useState<Resultaat[]>([])

  const opladen = async () => {
    setBezig(true)
    setResultaten([])
    try {
      const fd = new FormData()
      for (const b of bestanden) fd.append('bestanden', b)
      if (datum) fd.set('datum', datum)
      if (enkel) fd.set('voorLid', String(voorLid))
      const res = await fetch('/api/medische-kaart/opladen', { method: 'POST', body: fd, credentials: 'include' })
      const d = (await res.json().catch(() => ({}))) as { error?: string; resultaten?: Resultaat[] }
      if (!res.ok) return toast('error', d.error ?? 'Opladen mislukt.')
      const r = d.resultaten ?? []
      setResultaten(r)
      const goed = r.filter((x) => x.ok).length
      toast(goed === r.length ? 'success' : goed ? 'info' : 'error', `${goed} van ${r.length} kaart${r.length === 1 ? '' : 'en'} bewaard.`)
      if (goed) {
        setBestanden([])
        router.refresh()
      }
    } catch {
      toast('error', 'Geen verbinding.')
    } finally {
      setBezig(false)
    }
  }

  return (
    <div className="ko">
      <label className="ko-veld">
        <span>{enkel ? `Foto of scan van de ingevulde kaart${naam ? ` van ${naam}` : ''}` : "Foto's of scans van ingevulde kaarten"}</span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          multiple={!enkel}
          {...(enkel ? { capture: 'environment' as const } : {})}
          onChange={(e) => setBestanden([...(e.target.files ?? [])])}
        />
        <small>
          {enkel
            ? 'Neem de hele kaart in beeld; de QR-code moet scherp zijn.'
            : 'Selecteer er gerust tientallen tegelijk. De QR-code op elke kaart zegt bij welk lid ze hoort.'}
        </small>
      </label>
      <label className="ko-veld">
        <span>Datum van de keuring{enkel ? '' : ' (zelfde voor alle kaarten — leeg laten als ze verschillen)'}</span>
        <input type="date" value={datum} max={dateStrBE()} onChange={(e) => setDatum(e.target.value)} required={enkel} />
      </label>
      <button type="button" className="wb-btn wb-btn-primary" disabled={bezig || !bestanden.length || (enkel && !datum)} onClick={() => void opladen()}>
        {bezig ? 'Bezig met lezen…' : enkel ? 'Kaart opladen' : bestanden.length ? `${bestanden.length} kaart${bestanden.length === 1 ? '' : 'en'} opladen` : 'Kaarten opladen'}
      </button>
      {resultaten.length > 0 && (
        <ul className="ko-lijst">
          {resultaten.map((r, i) => (
            <li key={i} className={r.ok ? 'ko-ok' : 'ko-fout'}>
              <span className="ko-bestand">{r.bestand}</span>
              {r.ok ? (
                <>
                  <strong>
                    {r.status === 'nakijken' ? '📨' : '✅'} {r.naam || 'Lid nog toe te kennen'}
                    {r.viaQr ? ' · herkend via QR' : ''}
                    {r.status === 'nakijken' ? ' · ter nakijken' : r.status === 'goedgekeurd' ? ' · goedgekeurd' : ''}
                  </strong>
                  {r.status === 'nakijken' && r.reden && <span className="ko-let">{r.reden}</span>}
                  {r.meldingen?.map((m) => (
                    <span key={m} className="ko-let">
                      ⚠️ {m}
                    </span>
                  ))}
                </>
              ) : (
                <span>⚠️ {r.fout}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
