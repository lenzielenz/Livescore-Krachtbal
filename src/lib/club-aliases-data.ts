// Historische naamvarianten die voor de erelijst-statistieken als dezelfde club moeten tellen. Een
// club heette door de jaren heen vaak anders (fusie, sponsornaam, koninklijke titel), maar het
// archief (kampioenen/bekerwinnaars/referendum) noteert telkens letterlijk hoe ze op dat moment
// heette. Voeg hier nieuwe groepen toe naarmate ze opduiken — de rest van de erelijst-laag
// (leaderboard, clubpagina, grafiek, logo-koppeling) leidt de samentelling hier automatisch uit af.
//
// `canoniek` is de naam die getoond wordt (en waarnaar gelinkt wordt); `aliassen` zijn alle andere
// letterlijke archiefnamen voor diezelfde club. Groepen hieronder zijn beperkt tot gevallen die
// zeker zijn: officieel bevestigd (club-contacts-data.ts, de huidige clublijst van krachtbal.be),
// of overduidelijke schrijfwijze-/typfoutvarianten en team-suffixen (A/B/C/I) van exact dezelfde
// naam. Twijfelgevallen (andere naamwortel, wel dezelfde plaats, geen harde bevestiging) staan hier
// bewust NIET in — die horen eerst bevestigd te worden voor ze meetellen in de erelijst-cijfers.
export interface ClubAliasGroep {
  canoniek: string
  aliassen: string[]
}

export const CLUB_ALIASSEN: ClubAliasGroep[] = [
  {
    canoniek: 'KBC St. Michiels',
    aliassen: ['Royal KBC St. Michiels', 'Robland St. Michiels', 'St. Michiels', 'KBC Sint Michiels', 'KRB St. Michiels'],
  },
  {
    canoniek: 'KSVV Inter Assebroek',
    aliassen: [
      'KSVV Inter Assebroek B',
      'Inter Assebroek',
      'Inter Cera Assebroek',
      'Inter DVV Assebroek',
      'Inter KBC Assebroek',
      'Inter KSVV Assebroek',
      'KBC Inter Assebroek',
    ],
  },
  {
    canoniek: 't Klaverken Buggenhout',
    aliassen: [
      'Klaverken Buggenhout',
      "'t Klaverken Buggenhout",
      't Klaverken Buggenhout A',
      't Klaverken Buggenhout B',
      't Klaverken Buggenhout C',
      'Simibu Buggenhout',
      'Buggenhout',
      'Buggenhout A',
      'Klaverken Buggenhout B',
      'Klaverken Buggenhout C',
    ],
  },
  {
    canoniek: 't Botterken Baasrode',
    aliassen: ['Botterken Baasrode'],
  },
  {
    canoniek: 'KBC Male',
    aliassen: ['KBC Maele', 'KBC Male A', 'KBC Male B'],
  },
  {
    canoniek: 'Osiris Aalst',
    aliassen: ['Aalst', 'Osiris Aalst / Kad'],
  },
  {
    canoniek: 'KBC Aalter',
    aliassen: ['Aalter', 'KBC Aalter B'],
  },
  {
    canoniek: 'KBC Adinkerke',
    aliassen: ['Adinkerke'],
  },
  {
    canoniek: 'Atlas Varsenare',
    aliassen: ['Atas Varsenare', 'Atlas Varsenare A', 'Varsenare A'],
  },
  {
    canoniek: 'HO Beitem',
    aliassen: ['Beitem', 'H.O. Beitem'],
  },
  {
    canoniek: 'Molenkracht Bree',
    aliassen: ['Bree A'],
  },
  {
    canoniek: "Buffalo's Sijsele",
    aliassen: ['Buffalo s Sijsele'],
  },
  {
    canoniek: 'D&W Koekelare',
    aliassen: ['DW Koekelare', 'DW Koekelare B'],
  },
  {
    canoniek: 'Den Hoorn Moerkerke',
    aliassen: ['Den Hoorn'],
  },
  {
    canoniek: 'Noordster Dudzele',
    aliassen: ['Dudzele'],
  },
  {
    canoniek: 'Avanti Lissewege',
    aliassen: ['Avant Lissewege', 'Avanti Lisseweg', 'Avanti Lissewege A'],
  },
  {
    canoniek: 'Juvenalo',
    aliassen: ['Juvenalo I'],
  },
  {
    canoniek: 'KBC Hamont',
    aliassen: ['KBC Hamont A'],
  },
  {
    canoniek: 'KBC Heist',
    aliassen: ['KBC Heist A'],
  },
  {
    canoniek: 'KBC Knokke Heist',
    aliassen: ['KBC Knokke', 'Knokke', 'Real Knokke'],
  },
  {
    canoniek: 'KRB Jabbeke',
    aliassen: ['Jabbeke', 'KB Jabbeke', 'KBC Jabbeke', 'KG Jabbeke', 'KRB Jabbeke A', 'Kröger Girls Jabbeke'],
  },
  {
    canoniek: 'KBK Ichtegem',
    aliassen: ['KBK Ichtegem A'],
  },
  {
    canoniek: 'KRB Loppem',
    aliassen: ['KBC Loppem', 'KRB Loppem A'],
  },
  {
    canoniek: 'KBC Maldegem-Donk',
    aliassen: ['KBC Maldegem'],
  },
  {
    canoniek: 'KBC Malderen',
    aliassen: ['Malderen'],
  },
  {
    canoniek: 'KBC Oostkamp',
    aliassen: ['Oostkamp'],
  },
  {
    canoniek: 'KBC St. Rita',
    aliassen: ['KBC St. Rita I'],
  },
  {
    canoniek: 'Houtland Torhout',
    aliassen: ['KRB Houtland'],
  },
  {
    canoniek: 'PJ Kaulille',
    aliassen: ['Kaulille', 'Kaulille A', 'PJ Kaulille C'],
  },
  {
    canoniek: 'Lozen Bocholt',
    aliassen: ['Heeskracht Bocholt', 'Lozen Bocholt A'],
  },
  {
    canoniek: 'Lede',
    aliassen: ['Lede A'],
  },
  {
    canoniek: 'Z.A.K. Beveren',
    aliassen: ['Z.A.K Beveren'],
  },
  {
    canoniek: 'Krachtbal Snellegem',
    aliassen: ['MEZ Snellege', 'MEZ Snellegem', 'Snellegem'],
  },
]
