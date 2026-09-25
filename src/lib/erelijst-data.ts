import type { Payload } from 'payload'

import type { KampioenenSeizoenInput, BekerwinnaarsSeizoenInput, ReferendumPrijsInput } from './erelijst'

// Haalt en vormt de drie archiefcollections om naar de invoervorm die src/lib/erelijst.ts verwacht.
// Gedeeld door de erelijst-overzichtspagina en de club-detailpagina, zodat beide exact dezelfde
// (letterlijke) namen zien om op te matchen.
export async function fetchErelijstData(payload: Payload): Promise<{
  kampioenenSeizoenen: KampioenenSeizoenInput[]
  bekerwinnaarsSeizoenen: BekerwinnaarsSeizoenInput[]
  referendumPrijzen: ReferendumPrijsInput[]
}> {
  const [kampioenenRes, bekerwinnaarsRes, referendumRes] = await Promise.all([
    payload.find({ collection: 'kampioenen', sort: '-seizoenKey', limit: 100, depth: 0 }).catch(() => ({ docs: [] as Record<string, unknown>[] })),
    payload.find({ collection: 'bekerwinnaars', sort: '-seizoenKey', limit: 100, depth: 0 }).catch(() => ({ docs: [] as Record<string, unknown>[] })),
    payload.find({ collection: 'referendum-awards', limit: 20, depth: 0 }).catch(() => ({ docs: [] as Record<string, unknown>[] })),
  ])

  const kampioenenSeizoenen: KampioenenSeizoenInput[] = kampioenenRes.docs.map((d) => ({
    seizoen: String(d.seizoen ?? ''),
    reeksen: (d.reeksen as { reeksNaam: string; kampioen: string }[] | undefined) ?? [],
  }))
  const bekerwinnaarsSeizoenen: BekerwinnaarsSeizoenInput[] = bekerwinnaarsRes.docs.map((d) => ({
    seizoen: String(d.seizoen ?? ''),
    winnaars: (d.winnaars as { categorie: string; ploeg: string }[] | undefined) ?? [],
  }))
  const referendumPrijzen: ReferendumPrijsInput[] = referendumRes.docs.map((d) => ({
    prijs: String(d.prijs ?? ''),
    winnaars: (d.winnaars as { jaar: string; naam: string; club: string }[] | undefined) ?? [],
  }))

  return { kampioenenSeizoenen, bekerwinnaarsSeizoenen, referendumPrijzen }
}
