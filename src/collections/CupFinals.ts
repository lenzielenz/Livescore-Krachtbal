import type { CollectionConfig } from 'payload'

import { isFederationLevel } from '../lib/access'
import { BEKERFINALE_TAKEN, VERANTWOORDELIJKE_OPTIONS } from '../lib/bekerfinale-checklist'

// Bekerfinale-organisatie (formulier_12): een checklist-module voor de OC/Federatie/SRC.
// Bij het aanmaken wordt de standaard takenlijst voorgesteld; taken kunnen aangepast en
// afgevinkt worden. Vooral organisatorisch — los van de live-scoring.
export const CupFinals: CollectionConfig = {
  slug: 'cupfinals',
  labels: { singular: 'Bekerfinale', plural: 'Bekerfinales' },
  admin: {
    useAsTitle: 'titel',
    defaultColumns: ['titel', 'datum', 'locatie'],
    group: 'Federatie',
  },
  access: {
    read: () => true,
    create: ({ req }) => isFederationLevel(req.user),
    update: ({ req }) => isFederationLevel(req.user),
    delete: ({ req }) => isFederationLevel(req.user),
  },
  hooks: {
    // Vul bij het aanmaken de standaard takenlijst in als er nog geen checklist is.
    beforeChange: [
      ({ data, operation }) => {
        if (operation === 'create' && (!data.checklist || data.checklist.length === 0)) {
          data.checklist = BEKERFINALE_TAKEN.map((t) => ({
            taak: t.taak,
            verantwoordelijke: t.verantwoordelijke,
            gedaan: false,
          }))
        }
        return data
      },
    ],
  },
  fields: [
    { name: 'titel', label: 'Titel', type: 'text', required: true, admin: { description: 'Bv. "Bekerfinales 2025-2026".' } },
    {
      type: 'row',
      fields: [
        { name: 'datum', label: 'Datum', type: 'date' },
        { name: 'locatie', label: 'Locatie', type: 'text' },
      ],
    },
    {
      name: 'checklist',
      label: 'Takenlijst',
      type: 'array',
      admin: { description: 'Wordt bij aanmaken voorgevuld met de standaardtaken.' },
      fields: [
        { name: 'taak', label: 'Taak', type: 'text', required: true },
        {
          name: 'verantwoordelijke',
          label: 'Verantwoordelijke',
          type: 'select',
          options: [...VERANTWOORDELIJKE_OPTIONS],
          defaultValue: 'OC',
        },
        { name: 'gedaan', label: 'Klaar', type: 'checkbox', defaultValue: false },
        { name: 'opmerking', label: 'Opmerking', type: 'text' },
      ],
    },
  ],
}
