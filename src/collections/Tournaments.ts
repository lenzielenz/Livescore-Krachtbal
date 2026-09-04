import type { CollectionConfig } from 'payload'

import { isFederationLevel } from '../lib/access'

import { CATEGORY_OPTIONS } from '../lib/categories'

export const TOURNAMENT_STATUS_OPTIONS = [
  { label: 'Bezig', value: 'live' },
  { label: 'Afgelopen', value: 'finished' },
] as const

export const TOURNAMENT_METHOD_OPTIONS = [
  { label: 'Manueel (jij kiest de loting)', value: 'manual' },
  { label: 'Toggle (automatische loting)', value: 'auto' },
] as const

export const TOURNAMENT_FORMAT_OPTIONS = [
  { label: 'Knock-out (afvalrace)', value: 'knockout' },
  { label: 'Iedereen tegen elkaar (rangschikking)', value: 'roundrobin' },
] as const

// Een tornooi (enkele afvalrace met kleine finale). De ploegen zijn ad-hoc namen — geen
// geregistreerde Teams/Players nodig. De categorie bepaalt de spelregels (helftduur). De
// wedstrijden van het schema staan in de aparte collectie `tournament-matches`.
export const Tournaments: CollectionConfig = {
  slug: 'tournaments',
  labels: { singular: 'Tornooi', plural: 'Tornooien' },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'category', 'status'],
    group: 'Wedstrijden',
  },
  access: {
    read: () => true,
    /**
     * Zonder deze drie regels valt Payload terug op "elke ingelogde gebruiker mag schrijven", en
     * de admin staat open voor iedereen met een account. Bij deze collectie is dat bijzonder
     * zwaar: de beforeDelete-hook hieronder wist het VOLLEDIGE wedstrijdschema mee, dus één
     * DELETE door een willekeurig lid vaagt midden op een tornooidag alle standen, doelpunten én
     * het aantekenspoor weg. Elke server-weg naar deze collectie draait met overrideAccess (zie
     * lib/tournament-engine.ts), dus dit sluit enkel de handmatige deur.
     */
    create: ({ req }) => isFederationLevel(req.user),
    update: ({ req }) => isFederationLevel(req.user),
    delete: ({ req }) => isFederationLevel(req.user),
  },
  hooks: {
    // Het hele schema mee opruimen wanneer een tornooi verwijderd wordt.
    beforeDelete: [
      async ({ req, id }) => {
        await req.payload
          .delete({ collection: 'tournament-matches', where: { tournament: { equals: id } }, req, overrideAccess: true })
          .catch(() => undefined)
      },
    ],
  },
  fields: [
    { name: 'name', label: 'Naam', type: 'text', required: true, admin: { description: 'Bv. "Paastornooi U14 2026".' } },
    {
      // Hoofdgroep die meerdere reeksen bundelt (bv. "Beker van Brugge" met U12 t/m dames &
      // heren). Alle tornooien met dezelfde groepsnaam delen één publieke groepspagina en één
      // zelfaanpassend kantinescherm voor de hele dag.
      name: 'groep',
      label: 'Hoofdgroep (tornooidag)',
      type: 'text',
      index: true,
      admin: { description: 'Bv. "Beker van Brugge". Reeksen met dezelfde groepsnaam horen bij dezelfde tornooidag en delen één kantinescherm.' },
    },
    {
      // De club die de tornooidag organiseert: haar logo en clubkleuren bepalen de look van het
      // groep-kantinescherm (en de groepspagina).
      name: 'hostClub',
      label: 'Organiserende club',
      type: 'relationship',
      relationTo: 'clubs',
      admin: { description: 'Logo en clubkleuren van deze club kleuren het kantinescherm van de tornooidag.' },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'category',
          label: 'Leeftijdscategorie',
          type: 'select',
          options: CATEGORY_OPTIONS,
          required: true,
          admin: { description: 'Bepaalt de spelregels (helftduur). U12/U14/U16 = 2×20 min, rest 2×25 min.' },
        },
        {
          name: 'status',
          label: 'Status',
          type: 'select',
          options: [...TOURNAMENT_STATUS_OPTIONS],
          defaultValue: 'live',
          required: true,
        },
        {
          name: 'method',
          label: 'Lotingsmethode',
          type: 'select',
          options: [...TOURNAMENT_METHOD_OPTIONS],
          defaultValue: 'auto',
        },
        {
          name: 'format',
          label: 'Formaat',
          type: 'select',
          options: [...TOURNAMENT_FORMAT_OPTIONS],
          defaultValue: 'knockout',
          admin: { description: 'Knock-out = afvalrace met finale. Iedereen tegen elkaar = poule met punten (winst 4, gelijk 3, verlies 2).' },
        },
      ],
    },
    {
      name: 'toonOpLive',
      label: 'Tonen op de live-pagina',
      type: 'checkbox',
      defaultValue: false,
      admin: { description: 'Toon de (lopende) wedstrijden van deze beker bovenaan de live-pagina.' },
    },
    {
      name: 'teamCount',
      label: 'Aantal ploegen',
      type: 'number',
      min: 2,
      admin: { readOnly: true, description: 'Vastgelegd bij het aanmaken.' },
    },
    {
      // Wedstrijdduur van deze categorie: minuten per helft (2×N). Leeg = de standaard van de
      // leeftijdscategorie (2×20 jeugd, 2×25 vanaf U18). Werkt door in klok, aantekentafel en
      // dagprogramma voor álle wedstrijden van dit tornooi.
      name: 'halfMinutes',
      label: 'Minuten per helft',
      type: 'number',
      min: 1,
      max: 60,
      admin: { description: 'Bv. 10 voor 2×10 min. Leeg = standaard van de categorie.' },
    },
    {
      // Aantal velden op de tornooidag: het dagprogramma toont per veld een veldoverzicht en
      // elke wedstrijd kan aan een veld toegewezen worden. Bij een tornooidag met meerdere
      // reeksen geldt de waarde van de éérste reeks die er een instelde (zelfde patroon als
      // de organiserende club).
      name: 'veldCount',
      label: 'Aantal velden',
      type: 'number',
      min: 1,
      max: 12,
      admin: { description: 'Hoeveel velden liggen er op deze tornooidag?' },
    },
    {
      // Expliciete koppeling ploegnaam → club, ingegeven bij het aanmaken. Zo is het clublogo
      // betrouwbaar (i.p.v. naamherkenning) en is de club gekoppeld (basis om info te bezorgen).
      // Vorm: [{ name: string, clubId: number }].
      name: 'teamClubs',
      type: 'json',
      admin: { hidden: true },
    },
    {
      // Koppeling ploegnaam → echte ploeg (Teams), ingegeven bij het aanmaken. Hierdoor kan de
      // tornooi-aantekentafel exact hetzelfde aantekenblad als een gewone wedstrijd gebruiken —
      // met de echte spelerslijst (scorerkeuze, wissels). Vorm: [{ name: string, teamId: number }].
      name: 'teamTeams',
      type: 'json',
      admin: { hidden: true },
    },
  ],
}
