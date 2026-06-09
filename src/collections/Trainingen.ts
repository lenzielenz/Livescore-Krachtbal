import type { CollectionConfig } from 'payload'

import { hasRole, isFederationLevel } from '../lib/access'
import { REEKS_OPTIONS } from '../lib/reeksen'

// Trainingssessies met aanwezigheidslijst: wie kwam (en dus hoeveel), het weer en de duur.
// Eén record = één training. Beheerd door admin/federatie en club-beheerders (coaches).
export const Trainingen: CollectionConfig = {
  slug: 'trainingen',
  labels: { singular: 'Training', plural: 'Trainingen' },
  admin: {
    useAsTitle: 'datum',
    defaultColumns: ['datum', 'club', 'duurMinuten', 'weer'],
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
      admin: { date: { pickerAppearance: 'dayAndTime', displayFormat: 'dd/MM/yyyy HH:mm', timeFormat: 'HH:mm' } },
    },
    {
      name: 'club',
      label: 'Club',
      type: 'relationship',
      relationTo: 'clubs',
      index: true,
      admin: { description: 'De club die trainde (uit het account afgeleid).' },
    },
    {
      name: 'reeks',
      label: 'Reeks / leeftijdsgroep',
      type: 'select',
      options: [...REEKS_OPTIONS],
      index: true,
      admin: {
        description: 'De leeftijdsgroep die trainde (U12, U14, dames, heren …). Leeg = clubbreed.',
      },
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
    {
      name: 'screenshot',
      label: 'Screenshot (WhatsApp-stemming)',
      type: 'textarea',
      admin: {
        description: 'Optionele screenshot van de WhatsApp-poll, als data-URL bewaard (overleeft een deploy).',
      },
    },
    { name: 'notitie', label: 'Notitie', type: 'textarea' },
  ],
}
