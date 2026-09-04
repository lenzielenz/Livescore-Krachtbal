'use client'

import { useFormFields } from '@payloadcms/ui'
import type { DefaultCellComponentProps } from 'payload'

import { aantekenaarTekst, sanitizeAantekenaars, sanitizeAfsluiter } from '@/lib/aantekenaars'

// Het auditspoor van een tornooiwedstrijd leesbaar maken in de Payload-admin.
//
// De ruwe json-kolom toont daar anders een blok `[{"id":42,"naam":…}]`, en dat is precies niet wat
// een beheerder zoekt: hij wil in één blik zien wie deze wedstrijd invulde. Twee weergaven — een
// regel in de lijst en een tabelletje op het formulier. Beide lezen dezelfde pure regels als de
// publieke vermelding (src/lib/aantekenaars.ts), zodat de admin en het scorebord nooit iets anders
// beweren.

const datum = (ms: number) =>
  ms > 0
    ? new Date(ms).toLocaleString('nl-BE', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Brussels',
      })
    : '—'

/** Kolom in de wedstrijdenlijst: één regel, "Aangetekend door …". */
export function AantekenaarCel(props: DefaultCellComponentProps) {
  const lijst = sanitizeAantekenaars(props.cellData)
  const afsluiter = sanitizeAfsluiter((props.rowData as { afgeslotenDoor?: unknown } | undefined)?.afgeslotenDoor)
  const tekst = aantekenaarTekst(lijst, afsluiter)
  if (!tekst) return <span style={{ opacity: 0.5 }}>—</span>
  return <span>{tekst}</span>
}

/** Formulierveld: wie er meetekende, met rol, aantal acties en wanneer. */
export function AantekenaarVeld() {
  const ruwLijst = useFormFields(([fields]) => fields?.aantekenaars?.value)
  const ruwAfsluiter = useFormFields(([fields]) => fields?.afgeslotenDoor?.value)
  const lijst = sanitizeAantekenaars(ruwLijst)
  const afsluiter = sanitizeAfsluiter(ruwAfsluiter)

  return (
    <div className="field-type" style={{ marginBottom: 16 }}>
      <label className="field-label">Aangetekend door</label>
      {lijst.length === 0 ? (
        <div style={{ padding: '8px 12px', opacity: 0.7 }}>
          Nog niemand. Het spoor wordt automatisch geboekt bij elke aantekenactie; wedstrijden van
          vóór die invoering hebben er geen.
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ textAlign: 'left', opacity: 0.6 }}>
              <th style={{ padding: '4px 8px' }}>Naam</th>
              <th style={{ padding: '4px 8px' }}>Rol</th>
              <th style={{ padding: '4px 8px' }}>Acties</th>
              <th style={{ padding: '4px 8px' }}>Eerste</th>
              <th style={{ padding: '4px 8px' }}>Laatste</th>
            </tr>
          </thead>
          <tbody>
            {lijst.map((a) => (
              <tr key={a.id} style={{ borderTop: '1px solid rgba(128,128,128,0.25)' }}>
                <td style={{ padding: '4px 8px', fontWeight: 600 }}>
                  {a.naam}
                  {afsluiter?.id === a.id && <span style={{ opacity: 0.6 }}> · sloot af</span>}
                </td>
                <td style={{ padding: '4px 8px' }}>{a.rol}</td>
                <td style={{ padding: '4px 8px' }}>{a.acties}</td>
                <td style={{ padding: '4px 8px' }}>{datum(a.eerste)}</td>
                <td style={{ padding: '4px 8px' }}>{datum(a.laatste)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

/** Eigen veld voor het eindsignaal: één regel in plaats van een json-blok. */
export function AfsluiterVeld() {
  const afsluiter = sanitizeAfsluiter(useFormFields(([fields]) => fields?.afgeslotenDoor?.value))
  return (
    <div className="field-type" style={{ marginBottom: 16 }}>
      <label className="field-label">Afgesloten door</label>
      <div style={{ padding: '8px 12px', opacity: afsluiter ? 1 : 0.7 }}>
        {afsluiter ? `${afsluiter.naam} — ${datum(afsluiter.op)}` : 'Nog niet afgesloten.'}
      </div>
    </div>
  )
}
