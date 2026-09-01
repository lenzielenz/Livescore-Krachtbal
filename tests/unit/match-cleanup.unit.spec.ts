import { describe, it, expect } from 'vitest'

import { leesbareFout, MATCH_VERPLICHTE_COLLECTIONS } from '@/lib/match-cleanup'

// Wat de gebruiker te lezen krijgt als het verwijderen misgaat.
//
// Aanleiding: op een telefoon verscheen letterlijk `Failed query: delete from "matches" where
// "matches"."id" = $1 / params: 5361`. Dat is de binnenkant van de database in een venstertje bij
// iemand die op een prullenbakje drukte.

describe('leesbareFout', () => {
  it('vervangt een databasefout door iets wat een mens kan lezen', () => {
    const uit = leesbareFout(new Error('Failed query: delete from "matches" where "matches"."id" = $1\nparams: 5361'))
    expect(uit).not.toMatch(/delete from|params:|\$1/)
    expect(uit).toMatch(/niet verwijderd/i)
  })

  it('herkent ook de andere manieren waarop een database klaagt', () => {
    for (const ruw of [
      'update or delete on table "matches" violates foreign key constraint',
      'null value in column "match_id" violates not-null constraint',
      'syntax error at or near "delete"',
    ]) {
      expect(leesbareFout(new Error(ruw))).toMatch(/fout van de app/i)
    }
  })

  it('laat een fout die wél voor de gebruiker bedoeld is ongemoeid', () => {
    // Anders verdwijnt "Enkel je eigen analyse-opname" achter een algemene tekst, en weet iemand
    // niet meer waaróm het niet mocht.
    expect(leesbareFout(new Error('Enkel je eigen analyse-opname of federatie/admin.')))
      .toBe('Enkel je eigen analyse-opname of federatie/admin.')
  })

  it('valt terug op iets zinnigs bij een lege of vreemde fout', () => {
    expect(leesbareFout(null)).toBe('Verwijderen mislukt.')
    expect(leesbareFout(new Error(''))).toBe('Verwijderen mislukt.')
    expect(leesbareFout('gewoon een tekst')).toBe('gewoon een tekst')
  })
})

describe('MATCH_VERPLICHTE_COLLECTIONS', () => {
  it('noemt elke collection één keer', () => {
    // Een dubbele naam is onschuldig maar verraadt dat er twee keer iets is bijgeplakt zonder te
    // kijken; de volledigheid zelf wordt tegen de échte collections gecontroleerd in de int-test.
    expect(new Set(MATCH_VERPLICHTE_COLLECTIONS).size).toBe(MATCH_VERPLICHTE_COLLECTIONS.length)
  })

  it('ruimt de videovoorstellen mee op', () => {
    // Deze ontbrak, en daardoor was elke video-analyse onverwijderbaar.
    expect(MATCH_VERPLICHTE_COLLECTIONS).toContain('cv-events')
  })

  it('spaart het verzekeringsdossier op elk pad', () => {
    // accidents.match is optioneel mét opzet: het dossier overleeft zijn wedstrijd. Vroeger
    // ruimde de knop in de app het wél mee op terwijl /admin het spaarde — dat verschil is weg.
    expect(MATCH_VERPLICHTE_COLLECTIONS).not.toContain('accidents')
  })
})
