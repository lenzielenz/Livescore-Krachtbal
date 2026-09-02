import type { Payload } from 'payload'

import { opdrachtVoor, zaadVoor, type Opdracht } from './foto-opdrachten'

// Hoe ver staat een deelnemer in zijn eigen reeks foto-opdrachten?
//
// Het antwoord komt uit de ingestuurde foto's zelf: elke foto draagt het nummer van de opdracht
// die ze beantwoordde, dus de volgende is die van het hoogste nummer + 1. Er wordt nergens een
// teller bijgehouden die kan gaan afwijken.
//
// Dat lost meteen op wat er met de vorige aanpak mis was. Die zette de voortgang in de
// localStorage van één toestel: wie halverwege de dag op zijn tablet keek begon opnieuw vooraan,
// wie zijn browsergeschiedenis wiste ook, en twee toestellen van dezelfde supporter liepen naast
// elkaar aan verschillende rijtjes.

/** Hoeveel opdrachten deze deelnemer op deze tornooidag al ingestuurd heeft. */
export async function volbrachtVoor(
  payload: Payload,
  groep: string,
  deelnemerId: number | string,
): Promise<number> {
  const res = await payload
    .find({
      collection: 'tornooi-fotos',
      where: {
        and: [
          { groep: { equals: groep } },
          { uploader: { equals: deelnemerId } },
          // Foto's van vóór deze aanpak dragen geen nummer. Ze expliciet uitsluiten is nodig:
          // bij een aflopende sortering komt NULL in Postgres bovenaan, en dan zou een oude foto
          // zich voordoen als "de verste".
          { opdrachtNr: { greater_than_equal: 0 } },
        ],
      },
      sort: '-opdrachtNr',
      depth: 0,
      limit: 1,
      overrideAccess: true,
    })
    .catch(() => ({ docs: [] as { opdrachtNr?: number | null }[] }))

  const hoogste = (res.docs as { opdrachtNr?: number | null }[])[0]?.opdrachtNr
  return typeof hoogste === 'number' && hoogste >= 0 ? Math.floor(hoogste) + 1 : 0
}

/** De opdracht die nu aan de beurt is voor deze deelnemer, plus haar nummer in de reeks. */
export async function huidigeOpdracht(
  payload: Payload,
  groep: string,
  deelnemerId: number | string,
): Promise<Opdracht & { volbracht: number }> {
  const volbracht = await volbrachtVoor(payload, groep, deelnemerId)
  return { ...opdrachtVoor(zaadVoor(deelnemerId, groep), volbracht), volbracht }
}
