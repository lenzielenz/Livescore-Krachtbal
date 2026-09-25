import { describe, it, expect } from 'vitest'

import { telClubTrofeeen, telLaureaten, zoekErelijst, seizoenNaarJaar, telPrijzenPerJaar, telPerGroep, canoniekeClubNaam, canoniekeReeksNaam } from '@/lib/erelijst'
import type { KampioenenSeizoenInput, BekerwinnaarsSeizoenInput, ReferendumPrijsInput } from '@/lib/erelijst'

const kampioenen: KampioenenSeizoenInput[] = [
  { seizoen: '2024-2025', reeksen: [{ reeksNaam: 'Hogere Heren', kampioen: 'KBC Male' }, { reeksNaam: 'Hogere Dames', kampioen: 'KRB Jabbeke' }] },
  { seizoen: '2023-2024', reeksen: [{ reeksNaam: 'Hogere Heren', kampioen: 'KBC Male' }] },
  { seizoen: '2020-2021', reeksen: [{ reeksNaam: 'Alle reeksen', kampioen: 'Geen kampioenen' }] },
]

const bekerwinnaars: BekerwinnaarsSeizoenInput[] = [
  { seizoen: '2024-2025', winnaars: [{ categorie: 'Heren', ploeg: 'KBC Male' }, { categorie: 'Dames', ploeg: 'KRB Jabbeke' }] },
  { seizoen: '1970-1971', winnaars: [{ categorie: '(geen gegevens beschikbaar)', ploeg: '(geen gegevens)' }] },
]

const referendum: ReferendumPrijsInput[] = [
  {
    prijs: 'Speler van het jaar',
    winnaars: [
      { jaar: '2025', naam: 'Jason De Vooght', club: 'KBC St. Michiels' },
      { jaar: '2024', naam: 'Jason De Vooght', club: 'KBC St. Michiels' },
      { jaar: '2021', naam: 'Geen', club: 'COVID-19' },
    ],
  },
  {
    prijs: 'Belofte van het jaar (jongens)',
    winnaars: [{ jaar: '2025', naam: 'Kobe Sevenhant', club: 'KBC Male' }],
  },
  {
    prijs: 'Speelster van het jaar',
    winnaars: [{ jaar: '2006', naam: 'Nathalie Lievens & Kristel Braem', club: 'KBK Ichtegem & KB Moerdamme' }],
  },
]

describe('canoniekeClubNaam', () => {
  it('zet een gekende historische alias om naar de canonieke naam', () => {
    expect(canoniekeClubNaam('Robland St. Michiels')).toBe('KBC St. Michiels')
    expect(canoniekeClubNaam('Royal KBC St. Michiels')).toBe('KBC St. Michiels')
    expect(canoniekeClubNaam('St. Michiels')).toBe('KBC St. Michiels')
    expect(canoniekeClubNaam('KBC Sint Michiels')).toBe('KBC St. Michiels')
    expect(canoniekeClubNaam('KSVV Inter Assebroek B')).toBe('KSVV Inter Assebroek')
    expect(canoniekeClubNaam('Inter Assebroek')).toBe('KSVV Inter Assebroek')
    expect(canoniekeClubNaam('Klaverken Buggenhout')).toBe('t Klaverken Buggenhout')
    expect(canoniekeClubNaam('t Klaverken Buggenhout A')).toBe('t Klaverken Buggenhout')
    expect(canoniekeClubNaam('t Klaverken Buggenhout B')).toBe('t Klaverken Buggenhout')
    expect(canoniekeClubNaam('t Klaverken Buggenhout C')).toBe('t Klaverken Buggenhout')
    expect(canoniekeClubNaam("'t Klaverken Buggenhout")).toBe('t Klaverken Buggenhout')
    expect(canoniekeClubNaam('Simibu Buggenhout')).toBe('t Klaverken Buggenhout')
    expect(canoniekeClubNaam('Botterken Baasrode')).toBe('t Botterken Baasrode')
    expect(canoniekeClubNaam('KBC Maele')).toBe('KBC Male')
    expect(canoniekeClubNaam('KBC Male A')).toBe('KBC Male')
    expect(canoniekeClubNaam('KRB St. Michiels')).toBe('KBC St. Michiels')
    expect(canoniekeClubNaam('Inter KBC Assebroek')).toBe('KSVV Inter Assebroek')
    expect(canoniekeClubNaam('Inter Cera Assebroek')).toBe('KSVV Inter Assebroek')
    expect(canoniekeClubNaam('Buggenhout')).toBe('t Klaverken Buggenhout')
    expect(canoniekeClubNaam('Klaverken Buggenhout B')).toBe('t Klaverken Buggenhout')
  })

  it('groepeert overige historische clubnamen (locatie/sponsor-varianten) onder hun huidige naam', () => {
    expect(canoniekeClubNaam('Aalst')).toBe('Osiris Aalst')
    expect(canoniekeClubNaam('Osiris Aalst / Kad')).toBe('Osiris Aalst')
    expect(canoniekeClubNaam('Aalter')).toBe('KBC Aalter')
    expect(canoniekeClubNaam('Adinkerke')).toBe('KBC Adinkerke')
    expect(canoniekeClubNaam('Atas Varsenare')).toBe('Atlas Varsenare')
    expect(canoniekeClubNaam('Varsenare A')).toBe('Atlas Varsenare')
    expect(canoniekeClubNaam('H.O. Beitem')).toBe('HO Beitem')
    expect(canoniekeClubNaam('Beitem')).toBe('HO Beitem')
    expect(canoniekeClubNaam('Buffalo s Sijsele')).toBe("Buffalo's Sijsele")
    expect(canoniekeClubNaam('DW Koekelare')).toBe('D&W Koekelare')
    expect(canoniekeClubNaam('Den Hoorn')).toBe('Den Hoorn Moerkerke')
    expect(canoniekeClubNaam('Dudzele')).toBe('Noordster Dudzele')
    expect(canoniekeClubNaam('Avant Lissewege')).toBe('Avanti Lissewege')
    expect(canoniekeClubNaam('Juvenalo I')).toBe('Juvenalo')
    expect(canoniekeClubNaam('KBC Knokke')).toBe('KBC Knokke Heist')
    expect(canoniekeClubNaam('Real Knokke')).toBe('KBC Knokke Heist')
    expect(canoniekeClubNaam('Jabbeke')).toBe('KRB Jabbeke')
    expect(canoniekeClubNaam('KG Jabbeke')).toBe('KRB Jabbeke')
    expect(canoniekeClubNaam('Kröger Girls Jabbeke')).toBe('KRB Jabbeke')
    expect(canoniekeClubNaam('KBK Ichtegem A')).toBe('KBK Ichtegem')
    expect(canoniekeClubNaam('KBC Loppem')).toBe('KRB Loppem')
    expect(canoniekeClubNaam('KBC Maldegem')).toBe('KBC Maldegem-Donk')
    expect(canoniekeClubNaam('Malderen')).toBe('KBC Malderen')
    expect(canoniekeClubNaam('Oostkamp')).toBe('KBC Oostkamp')
    expect(canoniekeClubNaam('KBC St. Rita I')).toBe('KBC St. Rita')
    expect(canoniekeClubNaam('KRB Houtland')).toBe('Houtland Torhout')
    expect(canoniekeClubNaam('Kaulille')).toBe('PJ Kaulille')
    expect(canoniekeClubNaam('Heeskracht Bocholt')).toBe('Lozen Bocholt')
    expect(canoniekeClubNaam('Lede A')).toBe('Lede')
    expect(canoniekeClubNaam('Z.A.K Beveren')).toBe('Z.A.K. Beveren')
    expect(canoniekeClubNaam('MEZ Snellegem')).toBe('Krachtbal Snellegem')
    expect(canoniekeClubNaam('Snellegem')).toBe('Krachtbal Snellegem')
  })

  it('laat een naam zonder gekende alias ongewijzigd', () => {
    expect(canoniekeClubNaam('KBC Male')).toBe('KBC Male')
  })
})

describe('telClubTrofeeen', () => {
  it('telt titels, bekers én referendumprijzen van haar spelers per club, en sorteert op totaal', () => {
    const result = telClubTrofeeen(kampioenen, bekerwinnaars, referendum)
    const male = result.find((r) => r.naam === 'KBC Male')!
    expect(male.titels).toBe(2)
    expect(male.bekers).toBe(1)
    expect(male.referendumprijzen).toBe(1)
    expect(male.totaal).toBe(4)
    // KBC Male (4) moet vóór KRB Jabbeke (2) staan.
    expect(result[0].naam).toBe('KBC Male')
  })

  it('neemt een club op die enkel via referendumlaureaten prijzen heeft, zonder titel of beker', () => {
    const result = telClubTrofeeen(kampioenen, bekerwinnaars, referendum)
    const michiels = result.find((r) => r.naam === 'KBC St. Michiels')!
    expect(michiels.titels).toBe(0)
    expect(michiels.bekers).toBe(0)
    expect(michiels.referendumprijzen).toBe(2)
    expect(michiels.totaal).toBe(2)
  })

  it('telt historische naamvarianten (aliassen) samen onder de canonieke naam', () => {
    const kampioenenMetAlias: KampioenenSeizoenInput[] = [
      { seizoen: '1970-1971', reeksen: [{ reeksNaam: 'Scholieren A', kampioen: 'Robland St. Michiels' }] },
      { seizoen: '1966-1967', reeksen: [{ reeksNaam: 'Jeugdreeks A', kampioen: 'St. Michiels' }] },
    ]
    const result = telClubTrofeeen(kampioenenMetAlias, [], referendum)
    const michiels = result.find((r) => r.naam === 'KBC St. Michiels')!
    expect(michiels.titels).toBe(2)
    expect(michiels.referendumprijzen).toBe(2)
    expect(michiels.totaal).toBe(4)
    expect(result.some((r) => r.naam === 'Robland St. Michiels')).toBe(false)
    expect(result.some((r) => r.naam === 'St. Michiels')).toBe(false)
  })

  it('negeert placeholder-winnaars (COVID, ontbrekende data)', () => {
    const result = telClubTrofeeen(kampioenen, bekerwinnaars, referendum)
    expect(result.some((r) => r.naam === 'Geen kampioenen')).toBe(false)
    expect(result.some((r) => r.naam === '(geen gegevens)')).toBe(false)
    expect(result.some((r) => r.naam === 'COVID-19')).toBe(false)
  })
})

describe('telLaureaten', () => {
  it('telt referendum-prijzen per persoon en houdt bij welke prijzen', () => {
    const result = telLaureaten(referendum)
    const jason = result.find((r) => r.naam === 'Jason De Vooght')!
    expect(jason.aantal).toBe(2)
    expect(jason.prijzen).toEqual(['Speler van het jaar'])
  })

  it('negeert COVID-placeholders', () => {
    const result = telLaureaten(referendum)
    expect(result.some((r) => r.naam === 'Geen')).toBe(false)
  })

  it('splitst een gedeelde prijs ("X & Y") in twee aparte laureaten, elk met +1', () => {
    const result = telLaureaten(referendum)
    expect(result.some((r) => r.naam === 'Nathalie Lievens & Kristel Braem')).toBe(false)
    const nathalie = result.find((r) => r.naam === 'Nathalie Lievens')!
    const kristel = result.find((r) => r.naam === 'Kristel Braem')!
    expect(nathalie.aantal).toBe(1)
    expect(nathalie.prijzen).toEqual(['Speelster van het jaar'])
    expect(kristel.aantal).toBe(1)
    expect(kristel.prijzen).toEqual(['Speelster van het jaar'])
  })
})

describe('seizoenNaarJaar', () => {
  it('pakt het laatste jaartal uit een seizoensstring', () => {
    expect(seizoenNaarJaar('2024-2025')).toBe(2025)
  })

  it('werkt ook op een los kalenderjaar', () => {
    expect(seizoenNaarJaar('2025')).toBe(2025)
  })

  it('geeft 0 bij een string zonder jaartal', () => {
    expect(seizoenNaarJaar('onbekend')).toBe(0)
  })
})

describe('telPrijzenPerJaar', () => {
  it('telt titels, bekers en referendumprijzen per jaar, vult stille jaren op met nul en houdt het jaardetail bij', () => {
    const result = telPrijzenPerJaar(
      [{ seizoen: '2022-2023', reeksNaam: 'Hogere Heren' }, { seizoen: '2024-2025', reeksNaam: 'Hogere Heren' }],
      [{ seizoen: '2024-2025', categorie: 'Heren' }],
      [{ jaar: '2025', naam: 'Jason De Vooght', prijs: 'Speler van het jaar' }],
    )
    // 2023, 2024, 2025 — 2024 heeft geen titel/beker/referendumprijs, moet toch als nul-jaar verschijnen.
    expect(result.map((r) => r.jaar)).toEqual([2023, 2024, 2025])
    expect(result.find((r) => r.jaar === 2023)).toEqual({
      jaar: 2023,
      titels: 1,
      bekers: 0,
      referendumprijzen: 0,
      titelDetails: ['Hogere Heren'],
      bekerDetails: [],
      referendumDetails: [],
    })
    expect(result.find((r) => r.jaar === 2024)).toEqual({
      jaar: 2024,
      titels: 0,
      bekers: 0,
      referendumprijzen: 0,
      titelDetails: [],
      bekerDetails: [],
      referendumDetails: [],
    })
    expect(result.find((r) => r.jaar === 2025)).toEqual({
      jaar: 2025,
      titels: 1,
      bekers: 1,
      referendumprijzen: 1,
      titelDetails: ['Hogere Heren'],
      bekerDetails: ['Heren'],
      referendumDetails: [{ naam: 'Jason De Vooght', prijs: 'Speler van het jaar' }],
    })
  })

  it('geeft een lege lijst zonder enige titel, beker of referendumprijs', () => {
    expect(telPrijzenPerJaar([], [], [])).toEqual([])
  })
})

describe('telPerGroep', () => {
  it('telt hoe vaak elke waarde voorkomt, gesorteerd op aantal', () => {
    const result = telPerGroep(['Hogere Heren', 'Hogere Dames', 'Hogere Heren', 'Hogere Heren', 'Hogere Dames'])
    expect(result).toEqual([
      { naam: 'Hogere Heren', aantal: 3 },
      { naam: 'Hogere Dames', aantal: 2 },
    ])
  })

  it('geeft een lege lijst bij een lege input', () => {
    expect(telPerGroep([])).toEqual([])
  })
})

describe('canoniekeReeksNaam', () => {
  it('normaliseert verschillende ordinaal-schrijfwijzen naar dezelfde vorm', () => {
    expect(canoniekeReeksNaam('1e nationale heren')).toBe('1ste Nationale Heren')
    expect(canoniekeReeksNaam('Eerste nationale dames')).toBe('1ste Nationale Dames')
    expect(canoniekeReeksNaam('Eerste Nationale Dames')).toBe('1ste Nationale Dames')
    expect(canoniekeReeksNaam('1e nationale dames')).toBe('1ste Nationale Dames')
    expect(canoniekeReeksNaam('2e nationale heren')).toBe('2de Nationale Heren')
  })

  it('ontvouwt de "1N"-afkorting naar "1ste Nationale" zodat ze samensmelt met de voluit geschreven vorm', () => {
    expect(canoniekeReeksNaam('1N Dames reserven')).toBe('1ste Nationale Dames Reserven')
    expect(canoniekeReeksNaam('Eerste nationale dames reserven')).toBe('1ste Nationale Dames Reserven')
  })

  it('normaliseert hoofdlettergebruik van gekende woorden', () => {
    expect(canoniekeReeksNaam('U18 meisjes')).toBe('U18 Meisjes')
    expect(canoniekeReeksNaam('1e NATIONALE A')).toBe('1ste Nationale A')
  })

  it('laat onbekende woorden (oude afdelingen, jeugdcategorieën) ongewijzigd', () => {
    expect(canoniekeReeksNaam('Scholieren A')).toBe('Scholieren A')
    expect(canoniekeReeksNaam('Miniemen Meisjes')).toBe('Miniemen Meisjes')
  })

  it('houdt geslacht apart — voegt nooit een gok toe die er niet stond', () => {
    expect(canoniekeReeksNaam('Eerste Nationale Reserven')).toBe('1ste Nationale Reserven')
    expect(canoniekeReeksNaam('Eerste Nationale Reserven')).not.toBe(canoniekeReeksNaam('1N Dames reserven'))
  })
})

describe('zoekErelijst', () => {
  it('geeft leeg resultaat bij lege query', () => {
    expect(zoekErelijst('', kampioenen, bekerwinnaars, referendum)).toEqual([])
  })

  it('vindt een club doorheen kampioenen én bekerwinnaars, hoofdletterongevoelig', () => {
    const result = zoekErelijst('kbc male', kampioenen, bekerwinnaars, referendum)
    expect(result.some((r) => r.type === 'kampioen' && r.naam === 'KBC Male')).toBe(true)
    expect(result.some((r) => r.type === 'beker' && r.naam === 'KBC Male')).toBe(true)
    expect(result.some((r) => r.type === 'referendum')).toBe(false)
  })

  it('vindt een speler in het referendumarchief op deelstring', () => {
    const result = zoekErelijst('vooght', kampioenen, bekerwinnaars, referendum)
    expect(result).toHaveLength(2)
    expect(result.every((r) => r.type === 'referendum')).toBe(true)
  })

  it('sorteert resultaten van recent naar oud', () => {
    const result = zoekErelijst('KBC Male', kampioenen, bekerwinnaars, referendum)
    const jaartallen = result.map((r) => (r.type === 'referendum' ? r.jaar : r.seizoen))
    // "2024-2025" (kampioen + beker) moet vóór "2023-2024" komen.
    expect(jaartallen[0]).toBe('2024-2025')
    expect(jaartallen[jaartallen.length - 1]).toBe('2023-2024')
  })

  it('negeert placeholders in zoekresultaten', () => {
    const result = zoekErelijst('geen gegevens', kampioenen, bekerwinnaars, referendum)
    expect(result).toEqual([])
  })
})
