import { federatieToegang, leesJson } from '@/lib/federatie-api'
import { meld } from '@/lib/meldingen'

// Een bericht van de federatie aan een hele groep in één keer (vanuit "Snel doen"), enkel de federatie:
//   POST { aan: 'clubs' | 'scheidsrechters' | 'coaches' | 'federatie', titel, tekst?, url? } → { ok, ontvangers }
// Gaat als melding (🔔 + push) naar elk account in die groep — dezelfde weg als de herinneringen.
//   clubs           = clubbeheerders en clubmedewerkers
//   scheidsrechters = accounts met de rol scheidsrechter
//   coaches         = accounts met de clubfunctie coach of trainer
//   federatie       = de collega's van de federatie (en admins)
const GROEPEN = ['clubs', 'scheidsrechters', 'coaches', 'federatie'] as const
type Groep = (typeof GROEPEN)[number]

const WHERE: Record<Groep, Record<string, unknown>> = {
  clubs: { or: [{ roles: { contains: 'club-beheerder' } }, { roles: { contains: 'club-medewerker' } }] },
  scheidsrechters: { roles: { contains: 'scheidsrechter' } },
  coaches: { or: [{ clubFuncties: { contains: 'coach' } }, { clubFuncties: { contains: 'trainer' } }] },
  federatie: { or: [{ roles: { contains: 'federatie' } }, { roles: { contains: 'admin' } }] },
}

export async function POST(req: Request) {
  const t = await federatieToegang(req)
  if (t.fout) return t.fout
  const body = await leesJson(req)
  if (!body) return Response.json({ error: 'Ongeldige aanvraag.' }, { status: 400 })
  const aan = String(body.aan ?? '') as Groep
  if (!GROEPEN.includes(aan)) return Response.json({ error: 'Kies aan wie het bericht gaat.' }, { status: 400 })
  const titel = String(body.titel ?? '').replace(/\s+/g, ' ').trim().slice(0, 120)
  const tekst = String(body.tekst ?? '').trim().slice(0, 1500)
  const url = String(body.url ?? '').trim()
  if (titel.length < 3) return Response.json({ error: 'Geef het bericht een titel.' }, { status: 400 })
  if (url && !/^\/[^\s]*$/.test(url) && !/^https?:\/\/\S+$/.test(url)) return Response.json({ error: 'De link moet een pad (/…) of een volledig adres zijn.' }, { status: 400 })

  const res = await t.payload.find({ collection: 'users', where: WHERE[aan] as never, depth: 0, limit: 2000, pagination: false, overrideAccess: true })
  const ids = res.docs.map((u) => Number(u.id)).filter((id) => id !== Number(t.user.id))
  const ontvangers = await meld(t.payload, ids, { titel: `📣 ${titel}`, tekst: tekst || undefined, url: url || undefined })
  return Response.json({ ok: true, ontvangers })
}
