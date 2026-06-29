import type { CollectionConfig } from 'payload'

import { hasRole, isFederationLevel } from '../lib/access'

// Sessiesjablonen: herbruikbare trainingsstructuren opgebouwd uit oefeningen.
// Een sjabloon kan worden opgeslagen per club of gedeeld met alle clubs.
export const Sessiesjablonen: CollectionConfig = {
  slug: 'sessiesjablonen',
  labels: { singular: 'Sessiesjabloon', plural: 'Sessiesjablonen' },
  admin: {
    useAsTitle: 'naam',
    defaultColumns: ['naam', 'fase', 'duurTotaal', 'club'],
    group: 'Training',
  },
  access: {
    read: ({ req }) => Boolean(req.user),
    create: ({ req }) =>
      isFederationLevel(req.user) || hasRole(req.user, 'club-beheerder', 'club-medewerker'),
    update: ({ req }) =>
      isFederationLevel(req.user) || hasRole(req.user, 'club-beheerder', 'club-medewerker'),
    delete: ({ req }) =>
      isFederationLevel(req.user) || hasRole(req.user, 'club-beheerder'),
  },
  fields: [
    { name: 'naam', label: 'Naam sjabloon', type: 'text', required: true },
    {
      name: 'fase',
      label: 'Seizoensfase',
      type: 'select',
      options: [
        { label: 'Voorbereiding', value: 'voorbereiding' },
        { label: 'Competitie', value: 'competitie' },
        { label: 'Uitloop', value: 'uitloop' },
        { label: 'Algemeen', value: 'algemeen' },
      ],
    },
    { name: 'duurTotaal', label: 'Totale duur (min)', type: 'number', min: 10, max: 180 },
    {
      name: 'oefeningen',
      label: 'Blokken',
      type: 'array',
      fields: [
        {
          name: 'oefening',
          label: 'Oefening',
          type: 'relationship',
          relationTo: 'oefeningen',
          required: true,
        },
        { name: 'duurMinuten', label: 'Duur (min)', type: 'number', min: 1, max: 60 },
        { name: 'sets', label: 'Sets / ronden', type: 'number', min: 1, max: 20 },
        { name: 'notitie', label: 'Notitie bij dit blok', type: 'textarea' },
      ],
    },
    { name: 'beschrijving', label: 'Toelichting', type: 'textarea' },
    {
      name: 'club',
      label: 'Club (leeg = voor alle clubs)',
      type: 'relationship',
      relationTo: 'clubs',
    },
  ],
}
