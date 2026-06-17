import type { CollectionConfig } from 'payload'

import { hasRole, isFederationLevel } from '../lib/access'

// Trainingsdoelen per speler: een streefwaarde voor een meetwaarde (bv. worp 18 m ≥ 22 m).
// De voortgang (huidige beste vs doel) wordt afgeleid uit de trainingmetingen — niet opgeslagen.
export const Trainingdoelen: CollectionConfig = {
  slug: 'trainingdoelen',
  labels: { singular: 'Trainingsdoel', plural: 'Trainingsdoelen' },
  admin: { useAsTitle: 'metriek', defaultColumns: ['speler', 'metriek', 'doel'], group: 'Training' },
  access: {
    read: ({ req }) => Boolean(req.user),
    create: ({ req }) => isFederationLevel(req.user) || hasRole(req.user, 'club-beheerder', 'club-medewerker'),
    update: ({ req }) => isFederationLevel(req.user) || hasRole(req.user, 'club-beheerder', 'club-medewerker'),
    delete: ({ req }) => isFederationLevel(req.user) || hasRole(req.user, 'club-beheerder', 'club-medewerker'),
  },
  fields: [
    { name: 'speler', label: 'Speler', type: 'relationship', relationTo: 'players', required: true, index: true },
    {
      name: 'metriek',
      label: 'Meetwaarde',
      type: 'select',
      required: true,
      options: [
        { label: 'Snelheid vooruit (18 m)', value: 'snelheidVooruit' },
        { label: 'Snelheid achteruit (18 m)', value: 'snelheidAchteruit' },
        { label: 'Worp 4 m', value: 'worp4' },
        { label: 'Worp 9 m', value: 'worp9' },
        { label: 'Worp 18 m', value: 'worp18' },
      ],
    },
    { name: 'doel', label: 'Streefwaarde', type: 'number', required: true, min: 0 },
    { name: 'notitie', label: 'Notitie', type: 'textarea' },
  ],
}
