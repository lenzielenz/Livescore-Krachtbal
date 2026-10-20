// Het draaiboek van de demoruimte: de presentatie in hoofdstukken. Elke stap opent een scherm als
// een bepaalde rol (één tik: rol wisselen + doorgaan). Puur — de pagina vult de wedstrijd-id's in
// uit de klaargezette demowereld (lib/demoruimte/klaarzetten.ts → demoWedstrijden).

export type DemoIds = { hoofd: number | null; dames: number | null; live: number | null; afgelopen: number | null; afgelast: number | null }
export type DemoStap = { rol: string; href: string | null; tekst: string }
export type Hoofdstuk = { sleutel: string; icoon: string; titel: string; verhaal: string; stappen: DemoStap[] }

export function draaiboek(ids: DemoIds): Hoofdstuk[] {
  const m = (id: number | null, pad: (id: number) => string) => (id == null ? null : pad(id))
  return [
    {
      sleutel: 'overzicht',
      icoon: '🏛️',
      titel: 'De federatie ziet alles',
      verhaal: 'Eén dashboard met wat er vandaag te doen is: nieuwe leden, afgelastingen, blessures, boetes, verplaatsingen, bladen die nog niet ingediend zijn.',
      stappen: [
        { rol: 'federatie', href: '/federatie', tekst: 'Dashboard van de federatie' },
        { rol: 'federatie', href: '/federatie/statistieken', tekst: 'Statistieken: leden, competitie, blessures, per club' },
      ],
    },
    {
      sleutel: 'leden',
      icoon: '🪪',
      titel: 'Leden registreren',
      verhaal: 'De club voert een lid in en dient in; de federatie keurt goed. Daarna mag het lid spelen en krijgt het een eigen login.',
      stappen: [
        { rol: 'clubbeheer', href: '/club/leden', tekst: 'Ledenlijst van Sint-Michiels (✅ ⏳ ✎)' },
        { rol: 'federatie', href: '/beheer/leden', tekst: 'Wachtrij van de federatie: twee nieuwe leden goedkeuren' },
        { rol: 'ouder', href: '/profiel', tekst: 'De ouder van een U14-speler: dossier en medische kaart' },
      ],
    },
    {
      sleutel: 'wedstrijddag',
      icoon: '🏟️',
      titel: 'De wedstrijddag',
      verhaal:
        'Sint-Michiels – Baasrode. Baasrode stond in de file: de coach schoof de aftrap zelf 15 minuten op en iedereen kreeg een melding. De selecties staan; nu controleert de scheidsrechter elke speler en geeft hij vrij. Dan tekent de tafel aan.',
      stappen: [
        { rol: 'coach', href: m(ids.dames, (id) => `/opstelling/${id}`) ?? '/club', tekst: 'Coach: selectie, rugnummers en kapitein (dameswedstrijd van straks)' },
        { rol: 'scheidsrechter', href: m(ids.hoofd, (id) => `/scheidsrechter/${id}`), tekst: 'Scheidsrechter: spelers controleren, keuring, vrijgeven' },
        { rol: 'tafel', href: m(ids.hoofd, (id) => `/scorekeeper/${id}`), tekst: 'Tafel: aantekenen — doelpunt, scorer, wissel' },
        { rol: 'supporter', href: m(ids.hoofd, (id) => `/match/${id}`), tekst: 'Supporter: live meevolgen' },
      ],
    },
    {
      sleutel: 'robuust',
      icoon: '🔋',
      titel: 'Als het toestel uitvalt',
      verhaal: 'De U14 loopt live, aangetekend op de tablet van de tafel. De batterij is leeg: de scheidsrechter neemt meteen over. Lukt ook dat niet: het noodblad, en achteraf de uitslag van papier.',
      stappen: [
        { rol: 'scheidsrechter', href: m(ids.live, (id) => `/scorekeeper/${id}`), tekst: 'Overnemen op een ander toestel' },
        { rol: 'scheidsrechter', href: m(ids.live, (id) => `/api/matchsheet/${id}/pdf?nood=1`), tekst: 'Het noodblad (PDF) om op papier verder te gaan' },
        { rol: 'federatie', href: m(ids.live, (id) => `/match/${id}`), tekst: 'Federatie: eindstand van papier ingeven' },
      ],
    },
    {
      sleutel: 'aftekenen',
      icoon: '✍️',
      titel: 'Blessure, aftekenen en indienen',
      verhaal: 'Zandberg – Baasrode is gedaan. Jens Aerts verzwikte zijn enkel: dat staat op het blad, de verzekeringsaangifte is klaar en hij vindt de documenten op zijn profiel.',
      stappen: [
        { rol: 'scheidsrechter', href: m(ids.afgelopen, (id) => `/aftekenen/${id}`), tekst: 'Kapiteins en scheidsrechter tekenen af, dan indienen' },
        { rol: 'speler', href: '/profiel', tekst: 'De speler: aangifte en getuigschrift invullen en terugsturen' },
        { rol: 'federatie', href: '/ongevallen', tekst: 'Federatie: ongevallendossiers' },
      ],
    },
    {
      sleutel: 'afgelasting',
      icoon: '⛈️',
      titel: 'Afgelasting',
      verhaal: "Het terrein van Lebbeke staat onder water. De scheidsrechter gelastte af met een foto; de federatie plant een nieuwe datum en iedereen hoort het.",
      stappen: [{ rol: 'federatie', href: '/beheer/afgelastingen', tekst: 'Foto bekijken en een nieuwe datum plannen' }],
    },
    {
      sleutel: 'boetes',
      icoon: '💶',
      titel: 'Boetes en scheidsrechterskosten',
      verhaal: 'De federatie zet zelf de boetelijst op. Het systeem stelt voor (forfait, blad te laat, te late aftrap); pas wat de federatie oplegt, ziet de club. De club meldt een betaling of betwist.',
      stappen: [
        { rol: 'federatie', href: '/beheer/boetes', tekst: 'Voorstellen beoordelen en opleggen' },
        { rol: 'clubbeheer', href: '/club/boetes', tekst: 'Club: openstaande boetes en scheidsrechterskosten' },
      ],
    },
    {
      sleutel: 'kalender',
      icoon: '🗓️',
      titel: 'Inschrijving en kalender',
      verhaal: 'De clubs schrijven hun ploegen in voor volgend seizoen, met hun wensen: thuisuur, heren en dames gekoppeld, weekends dat hun terrein niet vrij is. De federatie maakt er één logische kalender van.',
      stappen: [
        { rol: 'clubbeheer', href: '/club/inschrijving', tekst: 'Club: ploegen inschrijven met voorkeuren' },
        { rol: 'federatie', href: '/beheer/inschrijvingen', tekst: 'Federatie: verwerken en het kalendervoorstel maken' },
        { rol: 'federatie', href: '/beheer/planner', tekst: 'Planner: wedstrijden verslepen, verplaatsingsaanvraag beslissen' },
      ],
    },
    {
      sleutel: 'publiek',
      icoon: '📣',
      titel: 'Voor iedereen',
      verhaal: 'Wat het publiek ziet: live scores, rangschikkingen, wedstrijdpagina’s.',
      stappen: [
        { rol: 'publiek', href: '/live', tekst: 'Live-bord' },
        { rol: 'publiek', href: '/rangschikking', tekst: 'Rangschikking' },
      ],
    },
  ]
}
