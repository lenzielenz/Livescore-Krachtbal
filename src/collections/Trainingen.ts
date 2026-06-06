import type { CollectionConfig } from 'payload'

import { hasRole, isFederationLevel } from '../lib/access'

// Trainingssessies met aanwezigheidslijst: wie kwam (en dus hoeveel), het weer en de duur.
// Eén record = één training. Beheerd door admin/federatie en club-beheerders (coaches).
export const Trainingen: CollectionConfig = {
  slug: 'trainingen',
  labels: { singular: 'Training', plural: 'Trainingen' },
  admin: {
    useAsTitle: 'datum',
    defaultColumns: ['datum', 'team', 'duurMinuten', 'weer'],
    group: 'Training',
  },
  access: {
    read: ({ req }) => Boolean(req.user),
    create: ({ req }) => isFederationLevel(req.user) || hasRole(req.user, 'club-beheerder'),
    update: ({ req }) => isFederationLevel(req.user) || hasRole(req.user, 'club-beheerder'),
    delete: ({ req }) => isFederationLevel(req.user) || hasRole(req.user, 'club-beheerder'),
  },
  fields: [
    {
      name: 'datum',
      label: 'Datum',
      type: 'date',
      required: true,
      defaultValue: () => new Date().toISOString(),
      admin: { date: { pickerAppearance: 'dayAndTime', displayFormat: 'dd/MM/yyyy HH:mm' } },
    },
    {
      name: 'team',
      label: 'Ploeg',
      type: 'relationship',
      relationTo: 'teams',
      index: true,
      admin: { description: 'Welke ploeg trainde (bepaalt de spelerslijst voor de aanwezigheid).' },
    },
    {
      type: 'row',
      fields: [
        { name: 'duurMinuten', label: 'Duur (minuten)', type: 'number', min: 0 },
        {
          name: 'weer',
          label: 'Weer',
          type: 'select',
          options: [
            { label: '☀️ Zonnig', value: 'zonnig' },
            { label: '⛅ Bewolkt', value: 'bewolkt' },
            { label: '🌧️ Regen', value: 'regen' },
            { label: '💨 Wind', value: 'wind' },
            { label: '❄️ Sneeuw', value: 'sneeuw' },
            { label: '🌫️ Mist', value: 'mist' },
          ],
        },
        { name: 'temperatuur', label: 'Temperatuur (°C)', type: 'number' },
      ],
    },
    {
      name: 'aanwezigen',
      label: 'Aanwezige spelers',
      type: 'relationship',
      relationTo: 'players',
      hasMany: true,
      admin: { description: 'De spelers die aanwezig waren. Het aantal volgt automatisch.' },
    },
    { name: 'notitie', label: 'Notitie', type: 'textarea' },
  ],
}
