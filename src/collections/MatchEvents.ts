import type { CollectionConfig } from 'payload'

export const MATCH_EVENT_TYPE_OPTIONS = [
  { label: 'Time-out (ploeg)', value: 'timeout' },
  { label: 'Scheidsrechter-onderbreking', value: 'referee_stop' },
  { label: 'Start helft', value: 'half_start' },
  { label: 'Einde helft', value: 'half_end' },
  { label: 'Vervanging (wissel)', value: 'substitution' },
  { label: 'Pass (bal doorgegeven)', value: 'pass' },
] as const

// Niet-worp-gebeurtenissen voor de tijdlijn: time-outs (tellen mee in quotum, 2 p/ploeg
// p/helft), scheidsrechter-onderbrekingen (stoppen klok, tellen niet mee), helft-grenzen en
// vervangingen (wie eruit/erin, leesbaar in de notitie — voor het officiële wedstrijdblad).
export const MatchEvents: CollectionConfig = {
  slug: 'match-events',
  labels: {
    singular: 'Wedstrijdgebeurtenis',
    plural: 'Wedstrijdgebeurtenissen',
  },
  admin: {
    useAsTitle: 'id',
    defaultColumns: ['match', 'type', 'team', 'half', 'gameClock'],
    group: 'Wedstrijden',
  },
  access: {
    read: () => true,
  },
  fields: [
    {
      name: 'match',
      label: 'Wedstrijd',
      type: 'relationship',
      relationTo: 'matches',
      required: true,
      index: true,
    },
    {
      name: 'type',
      label: 'Type',
      type: 'select',
      options: [...MATCH_EVENT_TYPE_OPTIONS],
      required: true,
    },
    {
      // Bij een time-out of vervanging: welke ploeg. Leeg voor SR-onderbreking/helft-grenzen.
      name: 'team',
      label: 'Ploeg',
      type: 'relationship',
      relationTo: 'teams',
      admin: {
        condition: (_, siblingData) => siblingData?.type === 'timeout' || siblingData?.type === 'substitution',
      },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'half',
          label: 'Helft',
          type: 'number',
          required: true,
          min: 1,
          max: 2,
        },
        {
          name: 'gameClock',
          label: 'Klok (sec)',
          type: 'number',
          required: true,
          min: 0,
        },
      ],
    },
    // ── Pass (§6.10) ────────────────────────────────────────────────────────────────────────
    // Een pass verbruikt geen werpbeurt; hij verlegt de werpplaats naar waar de vanger staat.
    // Daarom hangt hij aan een balbezit en houdt hij zijn eigen plaats bij. Net als een worp is
    // dit een immutable feit: corrigeren = verwijderen (undo) en opnieuw registreren.
    {
      name: 'possession',
      label: 'Balbezit',
      type: 'relationship',
      relationTo: 'possessions',
      index: true,
      admin: { condition: (_, siblingData) => siblingData?.type === 'pass' },
    },
    {
      name: 'player',
      label: 'Speler (vanger van de pass)',
      type: 'relationship',
      relationTo: 'players',
      admin: { condition: (_, siblingData) => siblingData?.type === 'pass' },
    },
    {
      type: 'row',
      admin: { condition: (_, siblingData) => siblingData?.type === 'pass' },
      fields: [
        { name: 'x', label: 'Plaats X (0-1)', type: 'number', min: 0, max: 1 },
        { name: 'y', label: 'Plaats Y (0-1)', type: 'number', min: 0, max: 1 },
      ],
    },
    {
      name: 'forward',
      label: 'Voorwaartse pass (fout — opzet tegenpartij)',
      type: 'checkbox',
      defaultValue: false,
      admin: { condition: (_, siblingData) => siblingData?.type === 'pass' },
    },
    {
      // Aantal worpen dat in dit balbezit al genomen was toen de pass gebeurde. Daarmee weten we
      // of de pass ná de laatste worp kwam — en dus of hij de werpplaats bepaalt.
      name: 'afterThrows',
      label: 'Na hoeveel worpen',
      type: 'number',
      min: 0,
      admin: { condition: (_, siblingData) => siblingData?.type === 'pass' },
    },
    {
      name: 'note',
      label: 'Notitie',
      type: 'text',
    },
    {
      // Audit-trail: welke gebruiker deze gebeurtenis registreerde.
      name: 'createdBy',
      label: 'Geregistreerd door',
      type: 'relationship',
      relationTo: 'users',
      admin: { readOnly: true, position: 'sidebar' },
    },
  ],
}
