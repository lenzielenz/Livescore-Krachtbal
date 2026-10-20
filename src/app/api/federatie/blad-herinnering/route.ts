import { clubStaf, meld } from '@/lib/meldingen'
import { federatieToegang, leesJson } from '@/lib/federatie-api'

// De federatie herinnert aan bladen die nog af te tekenen zijn: POST { matchIds: [...] }. Per blad
// gaat er een melding naar de staf van beide clubs en naar de scheidsrechter (zijn account).
const relId = (v: unknown): number | null => {
  const id = v && typeof v === 'object' ? (v as { id?: unknown }).id : v
  return id == null || !Number.isFinite(Number(id)) ? null : Number(id)
}

export async function POST(req: Request) {
  const t = await federatieToegang(req)
  if (t.fout) return t.fout
  const body = (await leesJson(req)) ?? {}
  const ids = (Array.isArray(body.matchIds) ? body.matchIds : []).map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 500)
  if (!ids.length) return Response.json({ error: 'Kies minstens één blad.' }, { status: 400 })
  let verstuurd = 0
  for (const matchId of ids) {
    const sheet = (await t.payload.find({ collection: 'matchsheets', where: { match: { equals: matchId } }, depth: 0, limit: 1, overrideAccess: true })).docs[0]
    if (!sheet || sheet.status !== 'af_te_tekenen') continue
    const match = await t.payload.findByID({ collection: 'matches', id: matchId, depth: 1, overrideAccess: true }).catch(() => null)
    if (!match) continue
    const club = (tm: unknown) => (tm && typeof tm === 'object' ? relId((tm as { club?: unknown }).club) : null)
    const naam = (tm: unknown) => (tm && typeof tm === 'object' ? String((tm as { name?: unknown }).name ?? '') : '')
    const ref = relId(sheet.assignedReferee)
    const refAccounts = ref == null ? [] : (await t.payload.find({ collection: 'users', where: { official: { equals: ref } }, depth: 0, limit: 5, overrideAccess: true })).docs.map((u) => Number(u.id))
    const n = await meld(t.payload, [...(await clubStaf(t.payload, club(match.homeTeam))), ...(await clubStaf(t.payload, club(match.awayTeam))), ...refAccounts], {
      titel: `✍️ Wedstrijdblad nog af te tekenen: ${naam(match.homeTeam)} – ${naam(match.awayTeam)}`,
      tekst: 'Herinnering van de federatie: beide kapiteins en de scheidsrechter tekenen af. Na de laatste handtekening gaat het blad vanzelf naar de federatie en de clubs.',
      url: `/aftekenen/${matchId}`,
    })
    if (n > 0) verstuurd++
  }
  return Response.json({ ok: true, verstuurd })
}
