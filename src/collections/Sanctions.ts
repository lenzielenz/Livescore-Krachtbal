import type { CollectionConfig } from 'payload'

import { isFederationLevel } from '../lib/access'

// Administratieve knipjes/sancties per speler (WEDSTRIJDBLAD-PROMPT §Knipjes B).
// Eén record = één sanctie-entry (aantal knipjes). Beheerd door federatie/comité.
export const Sanctions: CollectionConfig = {
  slug: 'sanctions',
  labels: { singular: 'Knipje / sanctie', plural: 'Knipjes / sancties' },
  admin: {
    useAsTitle: 'reden',
    defaultColumns: ['player', 'aantal', 'datum', 'vervallenOp'],
    group: 'Federatie',
  },
  access: {
    read: ({ req }) => Boolean(req.user),
    create: ({ req }) => isFederationLevel(req.user),
    update: ({ req }) => isFederationLevel(req.user),
    delete: ({ req }) => isFederationLevel(req.user),
  },
  fields: [
    {
      name: 'player',
      label: 'Speler',
      type: 'relationship',
      relationTo: 'players',
      required: true,
    },
    {
      type: 'row',
      fields: [
        {
          name: 'aantal',
          label: 'Aantal knipjes',
          type: 'number',
          defaultValue: 1,
          min: 1,
          required: true,
        },
        {
          name: 'datum',
          label: 'Datum',
          type: 'date',
          admin: { date: { pickerAppearance: 'dayOnly', displayFormat: 'dd/MM/yyyy' } },
        },
        {
          name: 'vervallenOp',
          label: 'Vervalt op',
          type: 'date',
          admin: {
            date: { pickerAppearance: 'dayOnly', displayFormat: 'dd/MM/yyyy' },
            description: 'Leeg = blijft open. Vanaf deze datum telt het knipje niet meer mee.',
          },
        },
      ],
    },
    { name: 'reden', label: 'Reden', type: 'text' },
    { name: 'bron', label: 'Bron / referentie', type: 'text' },
  ],
}
