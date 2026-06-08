import type { CollectionConfig } from 'payload'

export const THROW_TYPE_OPTIONS = [
  { label: 'Nekworp (+1)', value: 'nek' },
  { label: 'Rugworp (+2)', value: 'rug' },
] as const

export const THROW_OUTCOME_OPTIONS = [
  { label: 'In het veld (doorspelen)', value: 'in_field' },
  { label: 'Doelpunt', value: 'goal' },
  { label: 'Gevangen', value: 'caught' },
  { label: 'Buiten zijlijn', value: 'out_side' },
  { label: 'Buiten achterlijn', value: 'out_back' },
] as const

export const ZONE_OPTIONS = [
  { label: 'Links', value: 'links' },
  { label: 'Midden', value: 'midden' },
  { label: 'Rechts', value: 'rechts' },
] as const

// DECISION: Throws zijn immutable (event-sourcing). Eenmaal aangemaakt nooit bewerken;
// corrigeren = de worp verwijderen (undo) en opnieuw aanmaken. Score, balbezit, worpteller,
// kruisjes en statistieken worden allemaal hieruit afgeleid — nooit los opgeslagen.
export const Throws: CollectionConfig = {
  slug: 'throws',
  labels: {
    singular: 'Worp',
    plural: 'Worpen',
  },
  admin: {
    useAsTitle: 'id',
    defaultColumns: ['match', 'team', 'player', 'throwNumber', 'type', 'outcome'],
    group: 'Wedstrijden',
    description: 'Immutable worp-events. Niet bewerken — enkel aanmaken of verwijderen (undo).',
  },
  access: {
    read: () => true,
    // Immutability code-enforced: bestaande worpen mogen nooit gewijzigd worden.
    update: () => false,
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
      name: 'possession',
      label: 'Balbezit',
      type: 'relationship',
      relationTo: 'possessions',
      required: true,
      index: true,
    },
    {
      type: 'row',
      fields: [
        {
          name: 'team',
          label: 'Ploeg',
          type: 'relationship',
          relationTo: 'teams',
          required: true,
        },
        {
          name: 'player',
          label: 'Speler',
          type: 'relationship',
          relationTo: 'players',
          required: true,
        },
        {
          // Speler van de tegenploeg die de bal ving (enkel bij een gevangen worp).
          name: 'caughtBy',
          label: 'Gevangen door',
          type: 'relationship',
          relationTo: 'players',
        },
        {
          // Speler van de tegenploeg die de bal naar de achterman tikte vóór de vangst (optioneel,
          // enkel bij een diepe gevangen worp). Voedt de verdedigende statistiek.
          name: 'tappedBy',
          label: 'Getikt door',
          type: 'relationship',
          relationTo: 'players',
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'throwNumber',
          label: 'Worpnummer (in balbezit)',
          type: 'number',
          required: true,
          min: 1,
        },
        {
          name: 'type',
          label: 'Type worp',
          type: 'select',
          options: [...THROW_TYPE_OPTIONS],
          defaultValue: 'nek',
          required: true,
        },
        {
          name: 'outcome',
          label: 'Uitkomst',
          type: 'select',
          options: [...THROW_OUTCOME_OPTIONS],
          required: true,
        },
      ],
    },
    {
      // Landingspunt op het veldschema, genormaliseerd 0..1 (x = breedte, y = lengte).
      // De aantekenaar tikt dit aan; afstand en zone worden hieruit afgeleid en mee bewaard.
      type: 'row',
      fields: [
        {
          name: 'landingX',
          label: 'Landingspunt X (0..1)',
          type: 'number',
          required: true,
          min: 0,
          max: 1,
        },
        {
          name: 'landingY',
          label: 'Landingspunt Y (0..1)',
          type: 'number',
          required: true,
          min: 0,
          max: 1,
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'distance',
          label: 'Afstand (m, hemelsbreed)',
          type: 'number',
          min: 0,
          admin: {
            description: 'Afgeleid uit het landingspunt en het vertrekpunt.',
          },
        },
        {
          name: 'zone',
          label: 'Zone',
          type: 'select',
          options: [...ZONE_OPTIONS],
        },
      ],
    },
    {
      // Enkel relevant bij outcome = out_back: raakte iemand de bal vóór hij buiten ging?
      // Zo ja → geen kruisje. (Systeem vraagt dit aan de aantekenaar.)
      name: 'touchedBeforeOut',
      label: 'Aangeraakt vóór buiten (achterlijn)',
      type: 'checkbox',
      defaultValue: false,
    },
    {
      // Audit-trail: welke gebruiker registreerde deze worp (accountability bij betwiste scores).
      name: 'createdBy',
      label: 'Geregistreerd door',
      type: 'relationship',
      relationTo: 'users',
      admin: { readOnly: true, position: 'sidebar' },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'period',
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
  ],
}
