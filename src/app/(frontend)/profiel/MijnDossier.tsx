import type { Payload } from 'payload'

import { knipjesTekst, vastspelenVoorClub } from '@/lib/competitieregels'
import { formatDateBE } from '@/lib/datetime'
import { keuringGeldig, registratieIcoon, seizoenEinde } from '@/lib/registratie'
import { registratieInput } from '@/lib/registratie-server'
import { KaartAanvragen } from './KaartAanvragen'
import { kaartCode } from '@/lib/medische-kaart-code'
import { AttestOpladenKnop } from './AttestOpladenKnop'
import '@/components/attest-bezorgen.css'

const STATUS: Record<string, string> = { aangevraagd: '⏳ bij de federatie', verstuurd: '✅ verstuurd', geweigerd: '✗ geweigerd' }

// "Mijn spelersdossier" op /profiel: wat de club en de federatie over jou weten, je medisch attest (met je
// eigen QR-code) afdrukken en bezorgen, en hoe het ervoor staat. Voor een account dat aan een spelersdossier gekoppeld is (dat doet de
// club, of het gebeurt vanzelf bij de goedkeuring) — en met `ouder` voor elk kind van een ouder
// (lib/ouders.ts): dan staat het dossier van het kind er, met dezelfde knoppen.
export async function MijnDossier({ payload, playerId, ouder }: { payload: Payload; playerId: number; ouder?: boolean }) {
  const p = await payload.findByID({ collection: 'players', id: playerId, depth: 1, overrideAccess: true }).catch(() => null)
  if (!p) return null
  const team = p.team && typeof p.team === 'object' ? p.team : null
  const ic = registratieIcoon(registratieInput(p as unknown as Record<string, unknown>))
  const keuring = p.medischeKeuringOp ? String(p.medischeKeuringOp) : null
  // Geldig het hele seizoen van de keuring: tot en met 30 juni (seizoenEinde is 1 juli, exclusief).
  const geldigTot = keuring ? new Date(seizoenEinde(new Date(keuring)) - 86_400_000) : null
  const aanvragen = await payload.find({
    collection: 'medische-kaart-aanvragen',
    where: { player: { equals: playerId } },
    sort: '-createdAt',
    limit: 3,
    depth: 0,
    overrideAccess: true,
  })
  const open = aanvragen.docs.some((a) => a.status === 'aangevraagd')
  // Het laatst bezorgde attest en hoe het ervoor staat (lib/attest.ts): goedgekeurd, bij de federatie, afgekeurd.
  const laatste = (
    await payload.find({ collection: 'medische-attesten', where: { player: { equals: playerId } }, sort: '-createdAt', limit: 1, depth: 0, overrideAccess: true })
  ).docs[0] as { status?: string; reden?: string | null; afkeurReden?: string | null; createdAt?: string } | undefined
  const attestTekst = !laatste
    ? 'nog geen attest bezorgd'
    : laatste.status === 'nakijken'
      ? `⏳ bij de federatie ter nakijken${laatste.reden ? ` — ${laatste.reden}` : ''}`
      : laatste.status === 'afgekeurd'
        ? `✗ afgekeurd${laatste.afkeurReden ? `: ${laatste.afkeurReden}` : ''} — bezorg een nieuw attest`
        : `✅ goedgekeurd (${formatDateBE(String(laatste.createdAt))})`
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
        <li className="wb-row" style={{ cursor: 'default' }}>
          <span className="nm">Medisch attest</span>
          <strong>{attestTekst}</strong>
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
          {/* Elk lid heeft zijn eigen attest met QR-code: afdrukken, laten invullen, bezorgen. */}
          <a className="wb-btn" href={`/api/medische-kaart/pdf?ids=${playerId}`} target="_blank" rel="noopener">
            🖨️ Attest afdrukken
          </a>
          <AttestOpladenKnop code={kaartCode(playerId)} naam={String(p.voornaam || p.name || '')} />
        </div>
      )}
    </section>
  )
}
