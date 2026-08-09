import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, it, expect } from 'vitest'

import { colIndex, dateStyleIndexes, excelSerialToText, isDateFormatCode, readXlsx, unzip } from '@/lib/xlsx-read'

// De fixture is een écht .xlsx-bestand (door een onafhankelijke ZIP-schrijver gemaakt), met
// gedeelde strings, een eigen datumopmaak en een cel met datum + uur in één getal.
const fixture = readFileSync(path.join(process.cwd(), 'tests/fixtures/speelplan.xlsx'))

describe('unzip', () => {
  it('haalt de onderdelen van een xlsx eruit', () => {
    const files = unzip(fixture)
    expect(files.has('xl/workbook.xml')).toBe(true)
    expect(files.has('xl/worksheets/sheet1.xml')).toBe(true)
    expect(files.get('xl/sharedStrings.xml')!.toString('utf8')).toContain('KBK Temse')
  })
  it('weigert iets dat geen zip is', () => {
    expect(() => unzip(Buffer.from('dit is gewoon tekst'))).toThrow(/geldig ZIP/i)
  })
})

describe('colIndex', () => {
  it('vertaalt kolomletters naar een index', () => {
    expect(colIndex('A1')).toBe(0)
    expect(colIndex('F12')).toBe(5)
    expect(colIndex('AA3')).toBe(26)
    expect(colIndex('BC100')).toBe(54)
  })
})

describe('excelSerialToText', () => {
  it('rekent hele dagen om', () => {
    expect(excelSerialToText(46278)).toBe('2026-09-13')
  })
  it('houdt het uur erbij als dat er is', () => {
    expect(excelSerialToText(46285 + 11.25 / 24)).toBe('2026-09-20 11:15')
  })
})

describe('isDateFormatCode', () => {
  it('herkent datum- en tijdopmaak', () => {
    expect(isDateFormatCode('dd/mm/yyyy')).toBe(true)
    expect(isDateFormatCode('hh:mm')).toBe(true)
  })
  it('trapt niet in letters die enkel in vaste tekst staan', () => {
    expect(isDateFormatCode('0.00 "dm"')).toBe(false)
    expect(isDateFormatCode('#,##0')).toBe(false)
  })
})

describe('dateStyleIndexes', () => {
  it('vindt de stijlen met een datumopmaak', () => {
    const xml =
      '<styleSheet><numFmts><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts>' +
      '<cellXfs><xf numFmtId="0"/><xf numFmtId="164"/><xf numFmtId="14"/><xf numFmtId="3"/></cellXfs></styleSheet>'
    const set = dateStyleIndexes(xml)
    expect([...set].sort()).toEqual([1, 2]) // eigen datumopmaak + ingebouwde 14
  })
})

describe('readXlsx', () => {
  const sheets = readXlsx(fixture)

  it('leest het blad met zijn naam', () => {
    expect(sheets).toHaveLength(1)
    expect(sheets[0].name).toBe('Speelplan')
  })

  it('geeft de koprij en alle wedstrijdrijen terug', () => {
    const { rows } = sheets[0]
    expect(rows).toHaveLength(5)
    expect(rows[0]).toEqual(['Nr', 'Reeks', 'Datum', 'Uur', 'Thuisploeg', 'Bezoekers'])
  })

  it('zet datumgetallen om naar leesbare datums', () => {
    const { rows } = sheets[0]
    expect(rows[1][2]).toBe('2026-09-13')
    expect(rows[1][3]).toBe('14:00')
    expect(rows[1][4]).toBe('KBK Temse')
  })

  it('houdt het uur erbij wanneer het in de datumcel zit', () => {
    expect(sheets[0].rows[4][2]).toBe('2026-09-20 11:15')
  })

  it('vult ontbrekende cellen aan als lege tekst i.p.v. ze te laten wegschuiven', () => {
    const rij = sheets[0].rows[4]
    expect(rij[3]).toBe('') // lege uur-cel
    expect(rij[5]).toBe('KBK Temse B') // bezoekers staat nog op de juiste plaats
  })
})
