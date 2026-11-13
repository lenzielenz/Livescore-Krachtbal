import { hasRole, isFederationLevel } from '@/lib/access'
import { authUser, isAssignedReferee } from '@/lib/api-auth'
import { forfaitMelden } from '@/lib/forfait'
import { getPayloadClient } from '@/lib/payload-client'

// Forfait MELDEN vooraf door de club (RCVK item 34, lib/forfait.ts): POST { kant: 'thuis' | 'uit', reden }.
// Enkel de staf/coach van die ploeg of de federatie. Iedereen wordt verwittigd; het boetevoorstel volgt.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const matchId = Number((await params).id)
  if (!Number.isInteger(matchId) || matchId <= 0) return Response.json({ error: 'Ongeldige wedstrijd.' }, { status: 400 })
  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as { kant?: unknown; reden?: unknown }
  try {
    const r = await forfaitMelden(payload, user, matchId, body)
    return r.ok ? Response.json(r) : Response.json({ error: r.error }, { status: r.status })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
import { generateForfaitPdf } from '@/lib/submit/pdf-vergoeding'
import { buildForfaitData } from '@/lib/vergoeding-data'

// Onkostenblad forfait (formulier_3): €13/wedstrijd + km × km-tarief (Settings.kmTarief), per wedstrijd bij FF.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const payload = await getPayloadClient()
    const user = await authUser(payload, req)
    if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
    if (!isFederationLevel(user) && !hasRole(user, 'scheidsrechter')) {
      return Response.json({ error: 'Enkel scheidsrechter/federatie.' }, { status: 403 })
    }
    // Een scheidsrechter mag enkel het forfaitblad van een EIGEN toegewezen wedstrijd genereren.
    if (!isFederationLevel(user) && !(await isAssignedReferee(payload, user, id))) {
      return Response.json({ error: 'Je bent niet de toegewezen scheidsrechter van deze wedstrijd.' }, { status: 403 })
    }

    const data = await buildForfaitData(payload, id)
    if (!data) return Response.json({ error: 'Wedstrijd niet gevonden.' }, { status: 404 })

    const pdf = await generateForfaitPdf(data)
    return new Response(Buffer.from(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="forfait-onkostenblad-${id}.pdf"`,
      },
    })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
