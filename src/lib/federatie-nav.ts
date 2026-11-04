import { verborgenInDemo } from './omgeving'

// De navigatie van het federatieplatform (zijbalk + zoekpalet). Eén bron van waarheid voor álle
// federatietools: wat er in de zijbalk staat, wat Ctrl+K vindt en waar de tellers (open taken)
// terechtkomen. Puur — geen React, geen DB — zodat de indeling getest kan worden. De iconen zijn
// namen; de component koppelt ze aan lucide (components/fed-shell/FedIcon.tsx).
//
// Indeling volgt de werkwijze van de federatie, niet de techniek: eerst wat vandaag aandacht vraagt,
// dan het seizoen opbouwen, de wedstrijddag volgen, tucht en geld, mensen, en tot slot de uitslagen.

export type FedIcon =
  | 'dashboard'
  | 'kalender'
  | 'inschrijvingen'
  | 'planner'
  | 'verplaatsen'
  | 'weekend'
  | 'afgelast'
  | 'import'
  | 'bladen'
  | 'scheidsrechters'
  | 'aantekenaars'
  | 'ongevallen'
  | 'klachten'
  | 'boetes'
  | 'knipjes'
  | 'clubs'
  | 'leden'
  | 'statistieken'
  | 'referendum'
  | 'reglement'
  | 'beker'
  | 'stadion'
  | 'accounts'
  | 'rechten'
  | 'admin'

export type FedNavItem = {
  /** Stabiele sleutel (ook voor testen en voor het onthouden van ingeklapte groepen). */
  key: string
  label: string
  /** Eén zin in gewone taal: tooltip in de zijbalk en ondertitel in het zoekpalet. */
  hint: string
  href: string
  icon: FedIcon
  /** Enkel voor admins (de federatie zelf ziet dit item niet). */
  adminOnly?: boolean
  /** Extra zoektermen voor het palet ("kaart" vindt Ledenkeuring). */
  zoek?: string[]
  /** Extra paden die dit item als actief markeren (een detailpagina van hetzelfde luik). */
  ook?: string[]
}

export type FedNavGroup = {
  key: string
  titel: string
  items: FedNavItem[]
}

export const FED_NAV: FedNavGroup[] = [
  {
    key: 'overzicht',
    titel: 'Overzicht',
    items: [
      { key: 'dashboard', label: 'Dashboard', hint: 'Wat vandaag aandacht vraagt', href: '/federatie', icon: 'dashboard', zoek: ['start', 'taken', 'overzicht'] },
    ],
  },
  {
    key: 'competitie',
    titel: 'Competitie',
    items: [
      { key: 'kalender', label: 'Kalender opmaken', hint: 'Per reeks heen en terug, met vrije weekends', href: '/beheer/kalender', icon: 'kalender', zoek: ['reeks', 'speelkalender'] },
      { key: 'inschrijvingen', label: 'Inschrijvingen', hint: 'Ronde openen, inschrijvingen van de clubs verwerken, seizoenskalender maken', href: '/beheer/inschrijvingen', icon: 'inschrijvingen', zoek: ['seizoenskalender', 'voorkeuren'] },
      { key: 'planner', label: 'Planner', hint: 'Wedstrijden per weekend verslepen; verplaatsingsaanvragen beslissen', href: '/beheer/planner', icon: 'planner', zoek: ['slepen', 'verplaatsingsaanvraag', 'botsing'] },
      { key: 'wedstrijden', label: 'Wedstrijden', hint: 'Datum en uur aanpassen; opstellingen, bladen en live wedstrijden opvolgen', href: '/beheer/wedstrijden', icon: 'verplaatsen', zoek: ['verplaatsen', 'uur', 'datum', 'live', 'afsluiten'] },
      { key: 'weekend', label: 'Speelweekend verplaatsen', hint: 'Een uitgesteld weekend in één keer naar een ander weekend', href: '/beheer/weekend', icon: 'weekend', zoek: ['uitgesteld', 'week 43'] },
      { key: 'afgelastingen', label: 'Afgelastingen', hint: "Door de scheidsrechter afgelast, met foto's; nieuwe datum plannen", href: '/beheer/afgelastingen', icon: 'afgelast', zoek: ['weer', 'foto'] },
      { key: 'planning', label: 'Planning importeren', hint: 'Kalender of reeksindeling uit een bestand', href: '/beheer/planning', icon: 'import', zoek: ['csv', 'excel', 'bestand', 'seizoensplanning'] },
    ],
  },
  {
    key: 'wedstrijddag',
    titel: 'Wedstrijddag',
    items: [
      { key: 'bladen', label: 'Wedstrijdbladen', hint: 'Elk ingediend blad met de PDF; zoeken op ploeg, reeks en status', href: '/wedstrijdbladen', icon: 'bladen', zoek: ['pdf', 'blad', 'uitslag'] },
      { key: 'scheidsrechters', label: 'Scheidsrechters', hint: 'Per speeldag toewijzen, met automatisch invullen', href: '/beheer/scheidsrechters', icon: 'scheidsrechters', zoek: ['toewijzen', 'fluiten'] },
      { key: 'aantekenaars', label: 'Aantekenaars', hint: 'Wie de wedstrijden aan de tafel mag aantekenen', href: '/beheer/aantekenaars', icon: 'aantekenaars', zoek: ['tafel', 'score'] },
      { key: 'ongevallen', label: 'Blessures & ongevallen', hint: 'Aangiften en getuigschriften van spelers behandelen', href: '/ongevallen', icon: 'ongevallen', zoek: ['blessure', 'ongeval', 'getuigschrift', 'verzekering'] },
    ],
  },
  {
    key: 'tucht',
    titel: 'Tucht & geld',
    items: [
      { key: 'klachten', label: 'Klachten', hint: 'Klachten van clubs over een blad: heropenen of afwijzen', href: '/beheer/klachten', icon: 'klachten', zoek: ['protest'] },
      { key: 'boetes', label: 'Boetes', hint: 'Voorstellen beoordelen, opleggen en betalingen bevestigen', href: '/beheer/boetes', icon: 'boetes', zoek: ['forfait', 'betaling', 'sanctie'] },
      { key: 'knipjes', label: 'Knipjes', hint: 'Sancties en schorsingen', href: '/knipjes', icon: 'knipjes', zoek: ['schorsing', 'sanctie'] },
    ],
  },
  {
    key: 'mensen',
    titel: 'Clubs & leden',
    items: [
      { key: 'clubs', label: 'Clubs & logins', hint: 'Club aanmaken, clubbeheerder uitnodigen', href: '/beheer/clubs', icon: 'clubs', zoek: ['uitnodigen', 'beheerder'] },
      { key: 'leden', label: 'Ledenkeuring', hint: 'Aanvragen van clubs goedkeuren of afkeuren; medische kaarten', href: '/beheer/leden', icon: 'leden', zoek: ['keuring', 'spelers', 'registratie', 'kaart', 'herinnering'] },
    ],
  },
  {
    key: 'seizoen',
    titel: 'Seizoen',
    items: [
      { key: 'statistieken', label: 'Statistieken', hint: 'Leden, jeugd, forfaits en scheidsrechters, per club', href: '/federatie/statistieken', icon: 'statistieken', zoek: ['cijfers', 'rapport'] },
      { key: 'referendum', label: 'Speler van het jaar', hint: 'Stemronde openen, sluiten en uitslag bekendmaken', href: '/federatie/referendum', icon: 'referendum', zoek: ['referendum', 'stemmen', 'erelijst', 'rha', 'rda'] },
      { key: 'reglement', label: 'Reglement & regels', hint: 'Versies, verslagen, vastspelen en eindrondes', href: '/federatie/reglement', icon: 'reglement', zoek: ['regels', 'eindronde', 'versie'] },
      { key: 'bekerfinale', label: 'Bekerfinale', hint: 'Finaledag voorbereiden', href: '/bekerfinale', icon: 'beker', zoek: ['beker', 'finale'] },
      { key: 'stadion', label: 'Vlotheid stadion', hint: 'Hoe vlot het virtuele stadion draait', href: '/federatie/stadion', icon: 'stadion', zoek: ['virtueel'] },
    ],
  },
  {
    key: 'systeem',
    titel: 'Systeem',
    items: [
      { key: 'accounts', label: 'Accounts', hint: 'Gebruikersaccounts beheren', href: '/beheer/accounts', icon: 'accounts', adminOnly: true, zoek: ['gebruikers', 'wachtwoord'] },
      { key: 'rechten', label: 'Functies toekennen', hint: 'Wie welke functie heeft', href: '/beheer/rechten', icon: 'rechten', zoek: ['rollen', 'functies'] },
      { key: 'admin', label: 'Beheerpaneel', hint: 'Het volledige databeheer (admin)', href: '/admin', icon: 'admin', adminOnly: true, zoek: ['payload', 'database'] },
    ],
  },
]

/** Paden waar de shell zich terugtrekt: dit zijn luiken van een coach of club, ook al staan ze onder /beheer. */
const BUITEN_SHELL = ['/beheer/training', '/beheer/club-team', '/beheer/spelers']

/** Hoort deze pagina in het federatieplatform, of is het een ander luik dat toevallig onder /beheer staat? */
export function inShell(pad: string): boolean {
  return !BUITEN_SHELL.some((p) => pad === p || pad.startsWith(`${p}/`))
}

/** De zijbalk voor deze gebruiker: admin-items enkel voor admins, demo-verborgen luiken weg, lege groepen weg. */
export function navVoor({ isAdmin }: { isAdmin: boolean }): FedNavGroup[] {
  return FED_NAV.map((g) => ({
    ...g,
    items: g.items.filter((i) => (isAdmin || !i.adminOnly) && !verborgenInDemo(i.href)),
  })).filter((g) => g.items.length > 0)
}

const zonderQuery = (href: string) => href.split(/[?#]/)[0]

/** Welk item hoort bij dit pad? Het langste passende pad wint, zodat /federatie (dashboard) niet
 *  oplicht op /federatie/reglement. Geen match → null (bv. een pagina die niet in het menu staat). */
export function actiefItem(groepen: FedNavGroup[], pad: string): FedNavItem | null {
  let beste: FedNavItem | null = null
  let besteLengte = -1
  for (const g of groepen) {
    for (const i of g.items) {
      for (const kandidaat of [i.href, ...(i.ook ?? [])]) {
        const p = zonderQuery(kandidaat)
        const raak = pad === p || pad.startsWith(`${p}/`)
        if (raak && p.length > besteLengte) {
          beste = i
          besteLengte = p.length
        }
      }
    }
  }
  return beste
}

/** De groep waar dit item in staat (voor de kruimel: "Competitie › Planner"). */
export function groepVan(groepen: FedNavGroup[], item: FedNavItem | null): FedNavGroup | null {
  if (!item) return null
  return groepen.find((g) => g.items.some((i) => i.key === item.key)) ?? null
}

/** Tellers per menu-item uit de open taken: de taak-href (zonder ?filter of #anker) bepaalt het item. */
export function tellersPerItem(groepen: FedNavGroup[], taken: { href: string; aantal: number }[]): Record<string, number> {
  const perPad = new Map<string, number>()
  for (const t of taken) {
    if (t.aantal <= 0) continue
    const p = zonderQuery(t.href)
    perPad.set(p, (perPad.get(p) ?? 0) + t.aantal)
  }
  const uit: Record<string, number> = {}
  for (const g of groepen) {
    for (const i of g.items) {
      const n = perPad.get(zonderQuery(i.href))
      if (n) uit[i.key] = n
    }
  }
  return uit
}

const plat = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

/** Zoekpalet (Ctrl+K): items waarvan label, uitleg, groep of zoektermen alle getypte woorden bevatten.
 *  Labels die met de zoekterm beginnen staan bovenaan. Lege zoekterm → alles, in menuvolgorde. */
export function zoekItems(groepen: FedNavGroup[], zoekterm: string): { item: FedNavItem; groep: FedNavGroup }[] {
  const woorden = plat(zoekterm).split(/\s+/).filter(Boolean)
  const alle = groepen.flatMap((groep) => groep.items.map((item) => ({ item, groep })))
  if (woorden.length === 0) return alle
  const raak = alle.filter(({ item, groep }) => {
    const hooi = plat([item.label, item.hint, groep.titel, ...(item.zoek ?? [])].join(' '))
    return woorden.every((w) => hooi.includes(w))
  })
  const begint = (x: { item: FedNavItem }) => (plat(x.item.label).startsWith(woorden[0]) ? 0 : 1)
  return raak.map((x, n) => ({ x, n })).sort((a, b) => begint(a.x) - begint(b.x) || a.n - b.n).map(({ x }) => x)
}
