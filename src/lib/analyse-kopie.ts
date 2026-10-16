import type { Payload } from 'payload'

import { reeksCategorie, type Reeks } from '@/lib/reeksen'
import type { Club, Team } from '@/payload-types'

// Analyse-kopie van een echte competitieploeg: hergebruik de eigen analyse-ploeg met dezelfde
// naam + reeks, of maak ze aan (met een eigen analyse-club onder de echte clubnaam, kleuren en
// logo mee overgenomen). Zo blijft de opname volledig los van het live-platform — de echte
// wedstrijd, ploegen en spelers worden nooit aangeraakt — maar oogt ze wel als de echte affiche,
// en zijn de spelers die je ooit toevoegde er bij een volgende opname tegen dezelfde club weer.
export async function analyseKopieVan(
  payload: Payload,
  echt: Team,
  reeks: string,
  eigenaar: number,
): Promise<number> {
  const naam = String(echt.name ?? '').trim() || 'Ploeg'
  const bestaand = await payload
    .find({
      collection: 'teams',
      where: {
        and: [
          { analyseOnly: { equals: true } },
          { analyseOwner: { equals: eigenaar } },
          { name: { equals: naam } },
          { reeks: { equals: reeks } },
        ],
      },
      depth: 0,
      limit: 1,
    })
    .catch(() => ({ docs: [] as { id: number }[] }))
  if (bestaand.docs[0]) return bestaand.docs[0].id

  // Eigen analyse-club onder de echte clubnaam (of de ploegnaam als de club onbekend is).
  const echteClub = echt.club && typeof echt.club === 'object' ? (echt.club as Club) : null
  const clubNaam = String(echteClub?.name ?? '').trim() || naam
  const clubRes = await payload
    .find({
      collection: 'clubs',
      where: {
        and: [
          { analyseOnly: { equals: true } },
          { analyseOwner: { equals: eigenaar } },
          { name: { equals: clubNaam } },
        ],
      },
      depth: 0,
      limit: 1,
    })
    .catch(() => ({ docs: [] as { id: number }[] }))
  let clubId = clubRes.docs[0]?.id
  if (!clubId) {
    const nieuweClub = await payload.create({
      collection: 'clubs',
      data: {
        name: clubNaam,
        ...(typeof echteClub?.logoUrl === 'string' && echteClub.logoUrl ? { logoUrl: echteClub.logoUrl } : {}),
        ...(typeof echteClub?.colorPrimary === 'string' && echteClub.colorPrimary ? { colorPrimary: echteClub.colorPrimary } : {}),
        ...(typeof echteClub?.colorSecondary === 'string' && echteClub.colorSecondary ? { colorSecondary: echteClub.colorSecondary } : {}),
        analyseOnly: true,
        analyseOwner: eigenaar,
      },
      overrideAccess: true,
    })
    clubId = (nieuweClub as { id: number }).id
  }

  const nieuw = await payload.create({
    collection: 'teams',
    data: {
      name: naam,
      reeks: reeks as NonNullable<Team['reeks']>,
      category: reeksCategorie(reeks as Reeks),
      club: clubId,
      analyseOnly: true,
      analyseOwner: eigenaar,
    },
    overrideAccess: true,
  })
  return (nieuw as { id: number }).id
}
