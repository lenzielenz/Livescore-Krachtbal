// Eén bron van waarheid voor de drie operationele profielen (clubs,
// scheidsrechters, federatie). Gebruikt door:
//  - het "Meer"-menu in de header (alleen de instappunten: hubLabel → hubHref)
//  - de startpagina ("Aan de slag"-sectie)
//  - de profielpagina's zelf, die via <ProfileTools> "de rest" tonen
// Zo blijft alles automatisch uitgelijnd.
export type ProfileTool = { href: string; label: string; adminOnly?: boolean }

export type ProfileKey = 'clubs' | 'scheidsrechters' | 'federatie'

export type Profile = {
  key: ProfileKey
  badge: string
  title: string // sectietitel, bv. "Voor clubs"
  hubLabel: string // label in het Meer-menu, bv. "Mijn club"
  hubHref: string // instappunt: waar je "de rest" vindt
  intro: string
  tools: ProfileTool[] // de rest, getoond op de profielpagina + startpagina
}

export const PROFILES: Profile[] = [
  {
    key: 'clubs',
    badge: '👥',
    title: 'Voor clubs',
    hubLabel: 'Mijn club',
    hubHref: '/club',
    intro: 'Wedstrijd voorbereiden, aantekenen aan het veld en de schermen bedienen.',
    tools: [
      // Aantekenen gebeurt per wedstrijd vanuit "Mijn club" (de knop op elke wedstrijd), niet via
      // een aparte lijst van álle clubs — dat zorgde voor verwarring over welke je moest nemen.
      { href: '/club/voorspel', label: '🔮 Pronostiek' },
      { href: '/kantine', label: '🍻 Kantinescherm' },
      { href: '/cast', label: '📺 Schermen naar tv' },
      { href: '/club/veldscherm', label: '🏟️ Veldscherm' },
      { href: '/club/leden', label: '🪪 Leden & registratie' },
      { href: '/referendum', label: '🏅 Referendum' },
      { href: '/beheer/spelers', label: '➕ Spelers toevoegen' },
      { href: '/beheer/training/aanwezigheid', label: '✅ Aanwezigheidslijst' },
    ],
  },
  {
    key: 'scheidsrechters',
    badge: '🟨',
    title: 'Voor scheidsrechters',
    hubLabel: 'Scheidsrechters',
    hubHref: '/scheidsrechter/portaal',
    intro: 'Je wedstrijdblad vrijgeven met je QR en je onkostennota opmaken.',
    tools: [
      { href: '/scheidsrechter/portaal', label: '🟨 Mijn QR-portaal' },
      { href: '/vergoedingen', label: '💶 Vergoedingen' },
    ],
  },
  {
    key: 'federatie',
    badge: '🏛️',
    title: 'Voor de federatie',
    hubLabel: 'Federatie',
    hubHref: '/federatie',
    intro: 'Reglement, seizoensplanning en het volledige beheer.',
    tools: [
      { href: '/admin', label: '⚙️ Beheer (admin)', adminOnly: true },
      { href: '/beheer/accounts', label: '👤 Accounts', adminOnly: true },
      { href: '/beheer/leden', label: '🩺 Ledenkeuring' },
      { href: '/beheer/clubs', label: '🏟️ Clubs & logins' },
      { href: '/beheer/scheidsrechters', label: '🧑‍⚖️ Scheidsrechters toewijzen' },
      { href: '/beheer/wedstrijden', label: '🔁 Wedstrijden verplaatsen' },
      { href: '/beheer/kalender', label: '🗓️ Kalender opmaken' },
      { href: '/federatie/referendum', label: '🏅 Referendum' },
      { href: '/federatie/reglement', label: '📖 Reglement & regels' },
      { href: '/federatie/statistieken', label: '📊 Statistieken' },
      { href: '/beheer/aantekenaars', label: '✏️ Aantekenaars' },
      { href: '/beheer/planning', label: '📅 Seizoensplanning' },
      { href: '/beheer/rechten', label: '🔑 Functies toekennen' },
      { href: '/reglement', label: '📖 Reglement' },
      { href: '/knipjes', label: '✂️ Knipjes' },
      { href: '/bekerfinale', label: '🏆 Bekerfinale' },
      { href: '/federatie/stadion', label: '🏟️ Vlotheid stadion' },
    ],
  },
]

export function getProfile(key: ProfileKey): Profile {
  return PROFILES.find((p) => p.key === key)!
}
