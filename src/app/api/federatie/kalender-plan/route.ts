import { federatieToegang, leesJson } from '@/lib/federatie-api'
import { kalenderAanmaken, maakKalenderPlan } from '@/lib/kalender-plan-server'

// Seizoenskalender met de voorkeuren van de clubs (vanuit /beheer/inschrijvingen):
//   POST { ronde, reeksen?: string[] }                 → voorstel + wat niet lukte (niets bewaard)
//   POST { ronde, reeksen?: string[], bevestig: true } → de wedstrijden worden aangemaakt
// Het voorstel is voorspelbaar: dezelfde invoer geeft dezelfde kalender.
export async function POST(req: Request) {
  const t = await federatieToegang(req)
  if (t.fout) return t.fout
  const body = (await leesJson(req)) ?? {}
  const ronde = Number(body.ronde)
  if (!Number.isFinite(ronde)) return Response.json({ error: 'Kies een inschrijvingsronde.' }, { status: 400 })
  const reeksen = Array.isArray(body.reeksen) ? body.reeksen.map(String) : undefined
  try {
    const plan = await maakKalenderPlan(t.payload, ronde, reeksen)
    if (!plan) return Response.json({ error: 'Ronde niet gevonden.' }, { status: 404 })
    if (body.bevestig === true) {
      if (plan.problemen.some((p) => p.ernst === 'hard' && p.soort === 'weekends')) {
        return Response.json({ error: 'Te weinig speelweekends voor deze reeksen — pas de ronde aan.' }, { status: 409 })
      }
      return Response.json({ ok: true, ...(await kalenderAanmaken(t.payload, plan)) })
    }
    return Response.json({ ok: true, plan })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
