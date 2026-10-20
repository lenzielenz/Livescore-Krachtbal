import type { Payload } from 'payload'

import { knipjesTekst, vastspelenVoorClub } from '@/lib/competitieregels'
import { formatDateBE } from '@/lib/datetime'
import { KEURING_GELDIG_DAGEN, keuringGeldig, registratieIcoon } from '@/lib/registratie'
import { registratieInput } from '@/lib/registratie-server'
import { KaartAanvragen } from './KaartAanvragen'
import { KeuringInvoeren } from './KeuringInvoeren'

const STATUS: Record<string, string> = { aangevraagd: '⏳ bij de federatie', verstuurd: '✅ verstuurd', geweigerd: '✗ geweigerd' }

// "Mijn spelersdossier" op /profiel: wat de club en de federatie over jou weten, je keuring invoeren en
// je medische kaart aanvragen. Voor een account dat aan een spelersdossier gekoppeld is (dat doet de
// club, of het gebeurt vanzelf bij de goedkeuring) — en met `ouder` voor elk kind van een ouder
// (lib/ouders.ts): dan staat het dossier van het kind er, met dezelfde knoppen.
export async function MijnDossier({ payload, playerId, ouder }: { payload: Payload; playerId: number; ouder?: boolean }) {
  const p = await payload.findByID({ collection: 'players', id: playerId, depth: 1, overrideAccess: true }).catch(() => null)
  if (!p) return null
  const team = p.team && typeof p.team === 'object' ? p.team : null
  const ic = registratieIcoon(registratieInput(p as unknown as Record<string, unknown>))
  const keuring = p.medischeKeuringOp ? String(p.medischeKeuringOp) : null
  const geldigTot = keuring ? new Date(new Date(keuring).getTime() + KEURING_GELDIG_DAGEN * 86_400_000) : null
  const aanvragen = await payload.find({
    collection: 'medische-kaart-aanvragen',
    where: { player: { equals: playerId } },
    sort: '-createdAt',
    limit: 3,
    depth: 0,
    overrideAccess: true,
  })
  const open = aanvragen.docs.some((a) => a.status === 'aangevraagd')
  const clubId = team?.club != null ? Number(typeof team.club === 'object' ? team.club.id : team.club) : null
  const knipjes = clubId != null ? knipjesTekst((await vastspelenVoorClub(payload, clubId).catch(() => null))?.get(playerId)) : null

  return (
    <section className="wb-card" style={{ marginBottom: 16 }}>
      <h2>{ouder ? `👪 Dossier van ${String(p.voornaam || p.name || '')}` : '🪪 Mijn spelersdossier'}</h2>
      <p className="wb-sub">
        {String(p.name ?? '')}
        {team ? ` · ${String(team.name ?? '')}${team.reeks ? ` (${team.reeks})` : ''}` : ''}
      </p>
      <ul className="wb-rows" style={{ marginTop: 8 }}>
        <li className="wb-row" style={{ cursor: 'default' }}>
          <span className="nm">Status</span>
          <strong>
            {ic.icoon} {ic.label}
          </strong>
        </li>
        <li className="wb-row" style={{ cursor: 'default' }}>
          <span className="nm">Medische keuring</span>
          <strong>
            {keuring
              ? `${formatDateBE(keuring)} — ${keuringGeldig(keuring) ? `geldig tot ${formatDateBE(geldigTot!)}` : 'verlopen'}`
              : 'nog geen'}
          </strong>
        </li>
        {knipjes && (
          <li className="wb-row" style={{ cursor: 'default' }}>
            <span className="nm">Hoger spelen (knipjes)</span>
            <strong>{knipjes}</strong>
          </li>
        )}
        {aanvragen.docs.map((a) => (
          <li key={a.id} className="wb-row" style={{ cursor: 'default' }}>
            <span className="nm">
              Medische kaart {a.via === 'club' ? '(aangevraagd door de club)' : a.via === 'ouder' ? '(aangevraagd door een ouder)' : '(door het lid aangevraagd)'} ·{' '}
              {formatDateBE(String(a.createdAt))}
            </span>
            <strong>
              {STATUS[String(a.status)] ?? a.status}
              {a.opmerking ? ` — ${a.opmerking}` : ''}
            </strong>
          </li>
        ))}
      </ul>
      {p.soortLid !== 'lid' && (
        <div className="pf-dossier-acties">
          <KaartAanvragen open={open} playerId={ouder ? playerId : undefined} voor={ouder ? 'kind' : 'zelf'} />
          <KeuringInvoeren playerId={ouder ? playerId : undefined} heeftAttest={p.medischAttestBestand != null} />
        </div>
      )}
    </section>
  )
}
