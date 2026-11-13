import { isFederationLevel } from '@/lib/access'
import { authUser } from '@/lib/api-auth'
import { dateStrBE } from '@/lib/datetime'
import { hasFunctionGrant } from '@/lib/function-grants'
import { filterUitParams } from '@/lib/leden-register'
import { ledenZoeken, registerCsv, type Sortering } from '@/lib/leden-register-server'
import { getPayloadClient } from '@/lib/payload-client'

// Het ledenregister van de federatie (lib/leden-register.ts): zoeken, filteren en bladeren op de
// server. GET ?zoek=&club=&ploeg=&toon=&keuring=&categorie=&geslacht=&pagina=&sort=
// Met formaat=csv: hetzelfde filter als bestand (alle pagina's), zonder medische bestanden.
// Enkel de federatie/admin of een toekenning voor 'beheer/leden'.
const SORTEN = new Set<Sortering>(['naam', '-naam', 'keuring', '-gewijzigd'])

export async function GET(req: Request) {
  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
  if (!isFederationLevel(user) && !(await hasFunctionGrant(payload, user.id, 'beheer/leden'))) {
    return Response.json({ error: 'Enkel de federatie.' }, { status: 403 })
  }
  const url = new URL(req.url)
  const params = Object.fromEntries(url.searchParams.entries())
  const filter = filterUitParams(params)
  const sort = SORTEN.has(params.sort as Sortering) ? (params.sort as Sortering) : 'naam'
  if (params.formaat === 'csv') {
    const r = await ledenZoeken(payload, filter, { perPagina: 100_000, sort })
    return new Response(registerCsv(r.rijen), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="ledenregister-${dateStrBE()}.csv"`,
      },
    })
  }
  const r = await ledenZoeken(payload, filter, { pagina: Number(params.pagina) || 1, perPagina: Math.min(Number(params.per) || 50, 200), sort })
  return Response.json(r)
}
