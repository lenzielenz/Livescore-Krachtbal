import { hasRole, isFederationLevel } from '@/lib/access'
import { authUser } from '@/lib/api-auth'
import { FEDERATIE_URL_DEFAULT, haalFederatiePagina } from '@/lib/federatie-fetch'
import { parseUitslagen } from '@/lib/federatie-uitslagen'
import { getPayloadClient } from '@/lib/payload-client'
import { parseResultsHtml } from '@/lib/results-import'
import { pasUitslagenToe } from '@/lib/uitslagen-toepassen'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Uitslagen ophalen bij de federatie en op onze kalender toepassen.
// Standaard PREVIEW: er wordt niets weggeschreven tot je { commit: true } meegeeft.
// Enkel federatie/admin — dit raakt de officiële standen.
export async function POST(req: Request) {
  let body: { url?: string; commit?: boolean } = {}
  try {
    body = (await req.json()) as { url?: string; commit?: boolean }
  } catch {
    // Lege body = alles op de standaardwaarden (preview van de standaard-URL).
  }

  try {
    const payload = await getPayloadClient()
    const user = await authUser(payload, req)
    if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
    if (!isFederationLevel(user) && !hasRole(user, 'federatie')) {
      return Response.json({ error: 'Enkel federatie/admin mag uitslagen ophalen.' }, { status: 403 })
    }

    const url = (body.url ?? process.env.FEDERATIE_UITSLAGEN_URL ?? FEDERATIE_URL_DEFAULT).trim()
    const opgehaald = await haalFederatiePagina(url)
    if (opgehaald.status >= 400) {
      return Response.json({ error: `De federatiesite antwoordde met ${opgehaald.status}.` }, { status: 502 })
    }

    const rijen = parseUitslagen(opgehaald.html, parseResultsHtml)
    const rapport = await pasUitslagenToe(payload, rijen, { commit: body.commit === true })

    return Response.json({
      ok: true,
      url: opgehaald.url,
      commit: body.commit === true,
      gelezen: rijen.length,
      ...rapport,
      // Vond de parser niets, dan helpt een stukje van de pagina om te zien hoe ze er nu uitziet.
      // Publieke pagina, dus hier staat niets gevoeligs in.
      ...(rijen.length === 0 ? { fragment: eersteTabel(opgehaald.html) } : {}),
    })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}

/** Eerste stuk van de eerste tabel — genoeg om de opbouw te herkennen, kort genoeg om te lezen. */
function eersteTabel(html: string): string {
  const m = /<table[\s\S]{0,4000}/i.exec(html)
  return (m?.[0] ?? html.slice(0, 2000)).slice(0, 2000)
}
