import type { CollectionConfig } from 'payload'

// Vanaf welke helft het balbezit wordt opgezet — bepaalt het aantal toegestane worpen.
export const SETUP_SIDE_OPTIONS = [
  { label: 'Eigen helft', value: 'own' },
  { label: 'Tegenhelft', value: 'opponent' },
] as const

// Hoe het balbezit eindigde. Wordt door de regellogica (fase 3) gezet; null = nog lopend.
export const POSSESSION_OUTCOME_OPTIONS = [
  { label: 'Doelpunt', value: 'goal' },
  { label: 'Eigen doelpunt', value: 'own_goal' },
  { label: 'Gevangen (balbezit draait om)', value: 'caught' },
  { label: 'Buiten zijlijn', value: 'out_side' },
  { label: 'Buiten achterlijn', value: 'out_back' },
  { label: 'Middellijn-fout (worp vóór de doelworp)', value: 'midline_fault' },
  { label: 'Voorwaartse pass (fout)', value: 'pass_fault' },
  { label: 'Worpen op (geen doelpunt)', value: 'throws_exhausted' },
] as const

export const Possessions: CollectionConfig = {
  slug: 'possessions',
  labels: {
    singular: 'Balbezit',
    plural: 'Balbezitten',
  },
  admin: {
    useAsTitle: 'id',
    defaultColumns: ['match', 'team', 'setupSide', 'endOutcome', 'startClock'],
    group: 'Wedstrijden',
    description: 'Afgeleid uit de worp-events; doorgaans niet handmatig bewerken.',
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
      name: 'team',
      label: 'Ploeg aan zet',
      type: 'relationship',
      relationTo: 'teams',
      required: true,
    },
    {
      name: 'setupSide',
      label: 'Opzet vanaf',
      type: 'select',
      options: [...SETUP_SIDE_OPTIONS],
      required: true,
    },
    {
      name: 'throwsAllowed',
      label: 'Toegestane worpen',
      type: 'number',
      min: 1,
      admin: {
        description: 'Afgeleid uit categorie + opzetpunt.',
      },
    },
    {
      // Vertrekpunt van het balbezit (genormaliseerd) — origin voor de afstand van de 1e worp.
      type: 'row',
      fields: [
        {
          name: 'setupX',
          label: 'Vertrekpunt X (0..1)',
          type: 'number',
          min: 0,
          max: 1,
        },
        {
          name: 'setupY',
          label: 'Vertrekpunt Y (0..1)',
          type: 'number',
          min: 0,
          max: 1,
        },
      ],
    },
    {
      // Speelrichting van deze ploeg in dit balbezit: 'up' = naar y=1, 'down' = naar y=0.
      name: 'dir',
      label: 'Speelrichting',
      type: 'select',
      options: [
        { label: 'Omhoog (naar uitdoel)', value: 'up' },
        { label: 'Omlaag (naar thuisdoel)', value: 'down' },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'startHalf',
          label: 'Helft',
          type: 'number',
          min: 1,
          max: 2,
        },
        {
          name: 'startClock',
          label: 'Starttijd (klok, sec)',
          type: 'number',
          min: 0,
        },
      ],
    },
    {
      name: 'freeThrow',
      label: 'Vrije worp',
      type: 'checkbox',
      defaultValue: false,
      admin: { description: 'Eén worp; daarna gaat het spel verder.' },
    },
    {
      name: 'endOutcome',
      label: 'Einduitkomst',
      type: 'select',
      options: [...POSSESSION_OUTCOME_OPTIONS],
      admin: {
        description: 'Leeg = balbezit nog lopend.',
      },
    },
  ],
}
