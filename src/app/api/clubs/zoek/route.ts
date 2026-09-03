import { hasRole, isFederationLevel } from '@/lib/access'
import { authUser } from '@/lib/api-auth'
import { competitionWhere } from '@/lib/analyse-access'
import { getPayloadClient } from '@/lib/payload-client'

// Clubs zoeken op naam, voor het beheerformulier dat een ploeg onder de juiste club hangt.
//
// Waarom zoeken en geen keuzelijst. Er staan meer dan vierduizend competitieclubs in de database
// (jaren aan imports). Een lijst daarvan is niet te overzien op een gsm, en elke cap die je erop
// zet, snijdt precies de club weg die je nodig hebt: bij een cap van 1000 op alfabet houdt de lijst
// ergens in de P op, en alles daarna is onbereikbaar. Zoeken heeft die grens niet.

const LIMIET = 20

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get('q')?.trim() ?? ''

  try {
    const payload = await getPayloadClient()
    const user = await authUser(payload, req)
    if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
    if (!isFederationLevel(user) && !hasRole(user, 'federatie')) {
      return Response.json({ error: 'Enkel federatie/admin.' }, { status: 403 })
    }

    // Eén letter levert honderden clubs op die je toch niet doorleest; vanaf twee wordt het nuttig.
    if (q.length < 2) return Response.json({ clubs: [], hint: 'Typ minstens twee letters.' })

    const res = await payload.find({
      collection: 'clubs',
      where: { and: [competitionWhere(), { name: { contains: q } }] },
      sort: 'name',
      depth: 0,
      limit: LIMIET + 1,
      select: { name: true },
    })

    const clubs = res.docs.slice(0, LIMIET).map((c) => ({
      id: (c as { id: number }).id,
      naam: String((c as { name?: unknown }).name ?? ''),
    }))
    return Response.json({
      clubs,
      // Zodat het formulier "verfijn je zoekterm" kan tonen i.p.v. de indruk te wekken dat dit
      // alles is wat er bestaat.
      meer: res.docs.length > LIMIET,
      totaal: res.totalDocs,
    })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
