import type { CollectionConfig } from 'payload'

import { hasRole, isFederationLevel } from '../lib/access'

// Trainingsmetingen per speler: snelheid (vooruit/achteruit) en werpafstand per aanloop (4/9/18 m).
// Eén record = één meting op één datum. Voedt de progressie-grafieken in /beheer/training.
// Beheerd door admin/federatie en club-beheerders (coaches loggen hun eigen spelers).
export const Trainingmetingen: CollectionConfig = {
  slug: 'trainingmetingen',
  labels: { singular: 'Trainingmeting', plural: 'Trainingmetingen' },
  admin: {
    useAsTitle: 'datum',
    defaultColumns: ['speler', 'datum', 'snelheidVooruit', 'snelheidAchteruit', 'worp4', 'worp9', 'worp18'],
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
      name: 'speler',
      label: 'Speler',
      type: 'relationship',
      relationTo: 'players',
      required: true,
      index: true,
    },
    {
      name: 'datum',
      label: 'Datum',
      type: 'date',
      required: true,
      defaultValue: () => new Date().toISOString(),
      admin: { date: { pickerAppearance: 'dayOnly', displayFormat: 'dd/MM/yyyy' } },
    },
    {
      type: 'row',
      fields: [
        { name: 'snelheidVooruit', label: 'Snelheid vooruit (m/s)', type: 'number', min: 0 },
        { name: 'snelheidAchteruit', label: 'Snelheid achteruit (m/s)', type: 'number', min: 0 },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'worp4', label: 'Werpafstand aanloop 4 m (m)', type: 'number', min: 0 },
        { name: 'worp9', label: 'Werpafstand aanloop 9 m (m)', type: 'number', min: 0 },
        { name: 'worp18', label: 'Werpafstand aanloop 18 m (m)', type: 'number', min: 0 },
      ],
    },
    { name: 'notitie', label: 'Notitie', type: 'textarea' },
  ],
}
