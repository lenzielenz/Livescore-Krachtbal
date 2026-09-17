import { formatTimeBE } from '@/lib/datetime'
import type { FieldScreenTheme } from '@/lib/field-screens'
import { reeksNaam } from '@/lib/reeksen'
import type { DagWedstrijd } from '@/lib/field-screens-data'

// Wachtscherm voor een veld zonder gekoppelde wedstrijd: de dagplanning van de club (alle
// thuiswedstrijden van vandaag) + een grote koppelcode. Een aantekenaar leest die code van de tv
// af en voert ze in bij het starten van een wedstrijd (zie SimpleScorekeeper.tsx) — dan springt
// dit scherm vanzelf naar het volledige scorebord (FieldScreenSync.tsx pollt de wissel).
// `theme`: 'light' voor een veld in de volle zon — donker is anders nauwelijks af te lezen.
export function VeldWachtscherm({
  clubName,
  veldNaam,
  code,
  matches,
  statusLabel,
  theme = 'dark',
}: {
  clubName: string
  veldNaam: string
  code: string | null
  matches: DagWedstrijd[]
  statusLabel: (status: string) => string
  theme?: FieldScreenTheme
}) {
  return (
    <div className={`vc${theme === 'light' ? ' vc-light' : ''}`}>
      <div className="vc-head">
        <div className="vc-brand">Krachtbal <span className="vc-brand-accent">Live</span></div>
        <div className="vc-veld">{clubName} — {veldNaam}</div>
      </div>

      <div className="vc-code-card">
        <div className="vc-code-label">Koppelcode voor dit veld</div>
        <div className="vc-code">{code ?? '——————'}</div>
        <p className="vc-code-hint">Start je een wedstrijd? Voer deze code in op het aantekenscherm.</p>
      </div>

      <div className="vc-plan">
        <div className="vc-plan-title">Vandaag bij {clubName}</div>
        {matches.length === 0 ? (
          <p className="vc-plan-empty">Geen thuiswedstrijden vandaag.</p>
        ) : (
          <ul className="vc-plan-list">
            {matches.map((m) => (
              <li key={m.id} className={`vc-plan-row status-${m.status}`}>
                <span className="vc-plan-time">{formatTimeBE(m.time)}</span>
                <span className="vc-plan-opp">{clubName} – {m.opponent}</span>
                {m.reeks && <span className="vc-plan-reeks">{reeksNaam(m.reeks)}</span>}
                <span className="vc-plan-status">{statusLabel(m.status)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
