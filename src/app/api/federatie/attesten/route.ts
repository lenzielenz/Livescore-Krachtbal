import { attestBeslissen } from '@/lib/attest-server'
import { federatieToegang, leesJson } from '@/lib/federatie-api'

// De federatie beslist over een medisch attest dat niet vanzelf goedgekeurd werd (/beheer/attesten).
//   POST { id, besluit: 'goedkeuren', playerId?, keuringOp?, nietHoger? }  — playerId enkel bij een blanco attest
//   POST { id, besluit: 'afkeuren', reden }
// Het lid, de ouders en de club krijgen een melding; wie zonder login een e-mailadres gaf, een mail.
export async function POST(req: Request) {
  const t = await federatieToegang(req)
  if (t.fout) return t.fout
  const b = await leesJson(req)
  const id = Number(b?.id)
  if (!Number.isSafeInteger(id)) return Response.json({ error: 'Welk attest?' }, { status: 400 })
  const r =
    b?.besluit === 'goedkeuren'
      ? await attestBeslissen(t.payload, Number(t.user.id), {
          id,
          besluit: 'goedkeuren',
          playerId: b.playerId != null ? Number(b.playerId) : null,
          keuringOp: typeof b.keuringOp === 'string' ? b.keuringOp : null,
          nietHoger: b.nietHoger === true,
        })
      : b?.besluit === 'afkeuren'
        ? await attestBeslissen(t.payload, Number(t.user.id), { id, besluit: 'afkeuren', reden: String(b.reden ?? '') })
        : { ok: false as const, status: 400, error: 'Kies goedkeuren of afkeuren.' }
  return r.ok ? Response.json({ ok: true }) : Response.json({ error: r.error }, { status: r.status })
}
