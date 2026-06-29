import type { CollectionConfig } from 'payload'

import { hasRole, isFederationLevel } from '../lib/access'

// Oefeningenbibliotheek: herbruikbare drills die coaches kunnen raadplegen en beheren.
// Naast de ingebouwde systeemdrills (training-plan.ts) kunnen clubs eigen oefeningen aanmaken.
export const Oefeningen: CollectionConfig = {
  slug: 'oefeningen',
  labels: { singular: 'Oefening', plural: 'Oefeningen' },
  admin: {
    useAsTitle: 'naam',
    defaultColumns: ['naam', 'domein', 'duurMinuten', 'club'],
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
    { name: 'naam', label: 'Naam', type: 'text', required: true },
    {
      name: 'domein',
      label: 'Domein',
      type: 'select',
      options: [
        { label: 'Worpkracht', value: 'worpkracht' },
        { label: 'Aanloop', value: 'aanloop' },
        { label: 'Snelheid', value: 'snelheid' },
        { label: 'Wendbaarheid', value: 'wendbaarheid' },
        { label: 'Afwerking', value: 'afwerking' },
        { label: 'Core & balans', value: 'core' },
        { label: 'Conditie', value: 'conditie' },
        { label: 'Warming-up', value: 'warming-up' },
        { label: 'Cooling-down', value: 'cooling-down' },
      ],
    },
    { name: 'beschrijving', label: 'Uitvoering', type: 'textarea' },
    { name: 'progressie', label: 'Progressie / opbouw', type: 'textarea' },
    { name: 'duurMinuten', label: 'Richtduur (min)', type: 'number', min: 1, max: 120 },
    { name: 'materiaal', label: 'Materiaal', type: 'text' },
    {
      name: 'club',
      label: 'Club (leeg = voor alle clubs)',
      type: 'relationship',
      relationTo: 'clubs',
      required: false,
    },
  ],
}
