// Historische naamvarianten die voor de erelijst-statistieken als dezelfde club moeten tellen. Een
// club heette door de jaren heen vaak anders (fusie, sponsornaam, koninklijke titel), maar het
// archief (kampioenen/bekerwinnaars/referendum) noteert telkens letterlijk hoe ze op dat moment
// heette. Voeg hier nieuwe groepen toe naarmate ze opduiken — de rest van de erelijst-laag
// (leaderboard, clubpagina, grafiek, logo-koppeling) leidt de samentelling hier automatisch uit af.
//
// `canoniek` is de naam die getoond wordt (en waarnaar gelinkt wordt); `aliassen` zijn alle andere
// letterlijke archiefnamen voor diezelfde club.
export interface ClubAliasGroep {
  canoniek: string
  aliassen: string[]
}

export const CLUB_ALIASSEN: ClubAliasGroep[] = [
  {
    canoniek: 'KBC St. Michiels',
    aliassen: ['Royal KBC St. Michiels', 'Robland St. Michiels', 'St. Michiels', 'KBC Sint Michiels'],
  },
]
