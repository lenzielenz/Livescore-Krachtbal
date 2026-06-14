import type { CollectionConfig } from 'payload'

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
