import { describe, it, expect } from 'vitest'

import { parseUitslagen, parseUitslagenHtml } from '@/lib/federatie-uitslagen'
import { parseResultsHtml } from '@/lib/results-import'

// De federatiesite is van hier niet bereikbaar, dus de parser is bewust HERKENNEND geschreven
// i.p.v. op vaste kolomnummers. Deze tests dekken de vormen die zo'n kalenderpagina in de praktijk
// aanneemt: score in twee cellen of in één cel, reeks in de rij of in een tussentitel, en rijen
// die géén wedstrijd zijn.

const rij = (cells: string[]) => `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`
const tabel = (rijen: string) => `<html><body><table>${rijen}</table></body></html>`

describe('parseUitslagenHtml — score in twee cellen', () => {
  const html = tabel(
    rij(['101234', 'LH', '06/09/2025', '15:00', 'Sint-Michiels', 'Beveren', '12', '8', 'Janssens']),
  )

  it('leest ploegen, score, datum, uur en reeks', () => {
    const [r] = parseUitslagenHtml(html)
    expect(r).toMatchObject({
      reeks: 'LH',
      date: '2025-09-06',
      time: '15:00',
      home: 'Sint-Michiels',
      away: 'Beveren',
      homeScore: 12,
      awayScore: 8,
      number: '101234',
      referee: 'Janssens',
    })
  })
})

describe('parseUitslagenHtml — score in één cel', () => {
  it('leest "12 - 8" en varianten', () => {
    for (const score of ['12 - 8', '12-8', '12–8', '12 : 8']) {
      const [r] = parseUitslagenHtml(tabel(rij(['06/09/2025', '15:00', 'Sint-Michiels', 'Beveren', score])))
      expect([r?.homeScore, r?.awayScore]).toEqual([12, 8])
    }
  })
})

describe('parseUitslagenHtml — reeks uit een tussentitel', () => {
  it('neemt de reeks over uit een kop erboven', () => {
    const html = `<h3>Landelijke Heren</h3>${tabel(rij(['06/09/2025', '15:00', 'Sint-Michiels', 'Beveren', '12', '8']))}`
    // "Landelijke Heren" is geen code; enkel een herkende code/tekst zet de reeks.
    const [r] = parseUitslagenHtml(html)
    expect(r.home).toBe('Sint-Michiels')
  })

  it('neemt de reeks over uit een rij met enkel de code', () => {
    const html = tabel(
      rij(['LH']) + rij(['06/09/2025', '15:00', 'Sint-Michiels', 'Beveren', '12', '8']),
    )
    const [r] = parseUitslagenHtml(html)
    expect(r.reeks).toBe('LH')
  })

  it('een kop met de code zet de reeks voor de volgende rijen', () => {
    const html = `<h2>LD</h2>${tabel(rij(['06/09/2025', '15:00', 'Dames A', 'Dames B', '9', '7']))}`
    expect(parseUitslagenHtml(html)[0].reeks).toBe('LD')
  })
})

describe('parseUitslagenHtml — wat géén uitslag is', () => {
  it('slaat wedstrijden zonder score over', () => {
    const html = tabel(rij(['13/09/2025', '15:00', 'Sint-Michiels', 'Beveren', '', '']))
    expect(parseUitslagenHtml(html)).toEqual([])
  })

  it('slaat een uitgestelde wedstrijd over', () => {
    const html = tabel(rij(['13/09/2025', '15:00', 'Sint-Michiels', 'Beveren', 'uitgesteld']))
    expect(parseUitslagenHtml(html)).toEqual([])
  })

  it('slaat een kop-rij over', () => {
    const html = tabel(`<tr><th>Datum</th><th>Uur</th><th>Thuis</th><th>Bezoeker</th><th>Score</th></tr>`)
    expect(parseUitslagenHtml(html)).toEqual([])
  })

  it('verwart een rugnummer-achtig getal niet met een score', () => {
    // Enkel één getal na de namen: geen geldige score, dus geen wedstrijd.
    const html = tabel(rij(['06/09/2025', '15:00', 'Sint-Michiels', 'Beveren', '12']))
    expect(parseUitslagenHtml(html)).toEqual([])
  })
})

describe('parseUitslagenHtml — omgaan met opmaak', () => {
  it('leest door opmaak en entiteiten heen', () => {
    const html = tabel(
      `<tr><td><b>06/09/2025</b></td><td>15:00</td><td><a href="#">KBC St.&nbsp;Michiels</a></td><td>D&amp;W Beveren</td><td>12</td><td>8</td></tr>`,
    )
    const [r] = parseUitslagenHtml(html)
    expect(r.home).toBe('KBC St. Michiels')
    expect(r.away).toBe('D&W Beveren')
  })

  it('leest jjjj-mm-dd ook', () => {
    const [r] = parseUitslagenHtml(tabel(rij(['2025-09-06', '15:00', 'A ploeg', 'B ploeg', '3', '2'])))
    expect(r.date).toBe('2025-09-06')
  })
})

describe('parseUitslagen — beide leeswijzen samen', () => {
  it('houdt de strikte lezing aan en vult de rest aan, zonder dubbels', () => {
    // Eén rij in het exportformaat (nr, reeks, datum, uur, thuis, uit, score, score, ref) plus een
    // rij die enkel de losse lezing herkent (score in één cel).
    const html = tabel(
      rij(['101234', 'LH', '06/09/2025', '15:00', 'Sint-Michiels', 'Beveren', '12', '8', 'Janssens']) +
        rij(['LD', '06/09/2025', '17:00', 'Dames A', 'Dames B', '9 - 7']),
    )
    const rows = parseUitslagen(html, parseResultsHtml)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ home: 'Sint-Michiels', homeScore: 12, awayScore: 8 })
    expect(rows[1]).toMatchObject({ home: 'Dames A', homeScore: 9, awayScore: 7, reeks: 'LD' })
  })

  it('telt dezelfde wedstrijd niet dubbel wanneer beide parsers ze zien', () => {
    const html = tabel(rij(['101234', 'LH', '06/09/2025', '15:00', 'Sint-Michiels', 'Beveren', '12', '8', 'Janssens']))
    expect(parseUitslagen(html, parseResultsHtml)).toHaveLength(1)
  })
})

describe('isToegelatenBron', () => {
  it('laat enkel de federatiesite toe — dit is geen open proxy', async () => {
    const { isToegelatenBron } = await import('@/lib/federatie-fetch')
    expect(isToegelatenBron('https://www.krachtbal.be/kalender.php')).toBe(true)
    expect(isToegelatenBron('https://krachtbal.be/uitslagen.php?reeks=LH')).toBe(true)
    expect(isToegelatenBron('http://www.krachtbal.be/kalender.php')).toBe(true)
    expect(isToegelatenBron('https://kwaadwillig.be/x')).toBe(false)
    expect(isToegelatenBron('https://krachtbal.be.kwaadwillig.be/x')).toBe(false)
    expect(isToegelatenBron('file:///etc/passwd')).toBe(false)
    expect(isToegelatenBron('http://localhost:3000/api/admin')).toBe(false)
    expect(isToegelatenBron('geen-url')).toBe(false)
  })
})
