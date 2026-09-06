import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { brusselsNoonUtc, formatDateBE, formatTimeBE, shiftDateStr } from '@/lib/datetime'
import { seasonFromDate } from '@/lib/seasons'

// Robin, 2026-09-06: "de tijden zijn niet gelijk met het seizoen en de pronostiek."
//
// Oorzaak: `toLocaleDateString('nl-BE', …)` zonder tijdzone leest de kalender van de máchine.
// Op Railway is dat UTC, in de browser die van de bezoeker. Dezelfde wedstrijd stond daardoor
// op /live op 20:00 (via de Belgische helpers) en op de pronostiek- en scorekeeper-pagina op
// 18:00. Deze test bewaakt dat elke datum- en uurweergave door de helpers loopt.

describe('Belgische tijd, overal', () => {
  // 12 september 2026 om 20:00 Belgische tijd = 18:00 UTC (zomertijd, UTC+2).
  const avondwedstrijd = new Date('2026-09-12T18:00:00.000Z')

  it('toont het uur in Belgische tijd, niet in UTC', () => {
    expect(formatTimeBE(avondwedstrijd)).toBe('20:00')
  })

  it('houdt een avondwedstrijd op de juiste dag', () => {
    // 31 december 23:30 Belgische tijd = 22:30 UTC — zelfde dag. Maar 1 januari 00:30 BE is
    // 31 december 23:30 UTC: zonder tijdzone verschuift zo'n wedstrijd een dag én een jaar.
    const nieuwjaarsnacht = new Date('2025-12-31T23:30:00.000Z') // = 1 jan 2026, 00:30 BE
    expect(formatDateBE(nieuwjaarsnacht, { day: '2-digit', month: '2-digit', year: 'numeric' })).toBe(
      '01/01/2026',
    )
  })
})

describe('seasonFromDate', () => {
  it('rekent op de Belgische kalender, niet op UTC', () => {
    // 1 juli 2026 om 00:30 Belgische tijd = 30 juni 22:30 UTC. Op de UTC-kalender is dat nog
    // juni (vorig seizoen), op de Belgische al juli (nieuw seizoen). De server rekende het
    // eerste, een Belgische bezoeker zag het tweede.
    expect(seasonFromDate(new Date('2026-06-30T22:30:00.000Z'))).toBe('2026-2027')
  })

  it('houdt juni bij het aflopende seizoen', () => {
    expect(seasonFromDate(new Date('2026-06-30T12:00:00.000Z'))).toBe('2025-2026')
  })

  it('houdt juli en later bij het nieuwe seizoen', () => {
    expect(seasonFromDate(new Date('2026-07-01T12:00:00.000Z'))).toBe('2026-2027')
    expect(seasonFromDate(new Date('2026-12-24T12:00:00.000Z'))).toBe('2026-2027')
    expect(seasonFromDate(new Date('2027-03-01T12:00:00.000Z'))).toBe('2026-2027')
  })
})

describe('shiftDateStr', () => {
  it('verschuift kalenderdagen zonder tijdzone', () => {
    expect(shiftDateStr('2026-09-12', 1)).toBe('2026-09-13')
    expect(shiftDateStr('2026-09-12', -1)).toBe('2026-09-11')
  })

  it('gaat correct over maand- en jaargrenzen', () => {
    expect(shiftDateStr('2026-09-30', 1)).toBe('2026-10-01')
    expect(shiftDateStr('2026-12-31', 1)).toBe('2027-01-01')
    expect(shiftDateStr('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('struikelt niet over de overgang naar wintertijd', () => {
    // In de nacht van 25 op 26 oktober 2026 gaat de klok een uur terug. Wie met uren rekent,
    // verliest daar een dag; met kalenderdagen gebeurt er niets.
    expect(shiftDateStr('2026-10-25', 1)).toBe('2026-10-26')
  })

  it('laat rommel met rust', () => {
    expect(shiftDateStr('geen-datum', 1)).toBe('geen-datum')
  })
})

describe('brusselsNoonUtc', () => {
  it('geeft de Belgische middag, ook rond de zomertijdgrens', () => {
    // Zomertijd (UTC+2): 12:00 BE = 10:00 UTC. Wintertijd (UTC+1): 12:00 BE = 11:00 UTC.
    expect(brusselsNoonUtc('2026-09-12').toISOString()).toBe('2026-09-12T10:00:00.000Z')
    expect(brusselsNoonUtc('2026-12-12').toISOString()).toBe('2026-12-12T11:00:00.000Z')
  })

  it('valt altijd binnen de bedoelde Belgische dag', () => {
    for (const dag of ['2026-01-01', '2026-03-29', '2026-06-21', '2026-10-25', '2026-12-31']) {
      expect(formatDateBE(brusselsNoonUtc(dag), { year: 'numeric', month: '2-digit', day: '2-digit' })).toBe(
        dag.split('-').reverse().join('/'),
      )
    }
  })
})

describe('geen enkele datumweergave omzeilt de tijdzone', () => {
  // De vangrail. Zonder deze test sluipt er bij de volgende pagina gewoon weer een kale
  // toLocaleDateString in, en lopen twee schermen opnieuw uiteen — precies de melding.
  const ROOT = join(process.cwd(), 'src')

  /** Alle .ts/.tsx onder src, als paden relatief aan src. */
  function bronbestanden(map = ROOT, prefix = ''): string[] {
    const uit: string[] = []
    for (const item of readdirSync(map, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${item.name}` : item.name
      if (item.isDirectory()) uit.push(...bronbestanden(join(map, item.name), rel))
      else if (/\.tsx?$/.test(item.name)) uit.push(rel)
    }
    return uit
  }

  // Plekken waar de lokale tijd van de machine wél de bedoeling is.
  const TOEGESTAAN = new Set([
    // Het ZIP-formaat schrijft per specificatie lokale tijd in zijn header.
    'lib/zip.ts',
    // <input type="datetime-local"> toont en leest de tijd van het toestel; de waarde wordt
    // daarna omgerekend. Hier zou een vaste zone het invoerveld juist verkeerd vullen.
    'app/(frontend)/analyse/NieuweAnalyseMatch.tsx',
    'app/(frontend)/tornooi/[id]/BracketBoard.tsx',
    'app/(frontend)/tornooi/[id]/TornooiBeheer.tsx',
    'app/(frontend)/beheer/training/aanwezigheid/AanwezigheidPanel.tsx',
    // Persoonlijke dagteller op het eigen toestel: de dag van de gebruiker is hier de juiste dag.
    'app/(frontend)/analyse/coach/voeding/CalorieTracker.tsx',
    'lib/calorie-tracker.ts',
  ])

  /** De volledige argumentenlijst van een oproep, hoeveel regels ze ook beslaat. */
  function argumenten(src: string, openIdx: number): string {
    let diepte = 0
    for (let i = openIdx; i < src.length; i += 1) {
      if (src[i] === '(') diepte += 1
      else if (src[i] === ')') {
        diepte -= 1
        if (diepte === 0) return src.slice(openIdx + 1, i)
      }
    }
    return ''
  }

  it('formatteert nergens een datum zonder Europe/Brussels', () => {
    const overtreders: string[] = []
    for (const rel of bronbestanden()) {
      if (rel === 'lib/datetime.ts' || TOEGESTAAN.has(rel)) continue
      const src = readFileSync(join(ROOT, rel), 'utf8')
      const call = /\.toLocale(Date|Time)?String\s*\(/g
      let m: RegExpExecArray | null
      while ((m = call.exec(src)) !== null) {
        const open = src.indexOf('(', m.index)
        const args = argumenten(src, open)
        if (!args.includes("'nl-BE'")) continue
        // De tijdzone mag verderop in hetzelfde opties-object staan, ook tien regels lager.
        if (args.includes('timeZone')) continue
        // `getal.toLocaleString('nl-BE')` zonder opties is een getal (kcal, punten), geen datum.
        const heeftOpties = /(day|month|year|weekday|hour|minute|second|dateStyle|timeStyle)\s*:/.test(args)
        if (!heeftOpties && !m[1]) continue
        const regel = src.slice(0, m.index).split('\n').length
        overtreders.push(`${rel}:${regel} → ${src.slice(m.index, m.index + 80).split('\n')[0]}`)
      }
    }
    expect(overtreders).toEqual([])
  })

  it('leidt "vandaag" nergens uit de UTC-datum af', () => {
    // `new Date().toISOString().slice(0, 10)` is de UTC-dag: na 22:00 Belgische zomertijd staat
    // daar al morgen. Gebruik dateStrBE().
    const overtreders: string[] = []
    for (const rel of bronbestanden()) {
      if (rel === 'lib/datetime.ts' || TOEGESTAAN.has(rel)) continue
      const src = readFileSync(join(ROOT, rel), 'utf8')
      src.split('\n').forEach((regel, i) => {
        if (/new Date\(\)\s*\.toISOString\(\)\s*\.slice\(\s*0\s*,\s*10\s*\)/.test(regel)) {
          overtreders.push(`${rel}:${i + 1} → ${regel.trim().slice(0, 90)}`)
        }
      })
    }
    expect(overtreders).toEqual([])
  })
})
