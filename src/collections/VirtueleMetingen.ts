import type { CollectionConfig } from 'payload'

import { isFederationLevel } from '../lib/access'

// Hoe vlot het virtuele stadion loopt bij de bezoekers (zie lib/virtueel-meting.ts): één record per
// bezoek, anoniem — geen gebruiker, enkel het toestel en de cijfers per plek. Aangemaakt en
// bijgewerkt enkel via /api/virtueel/meting; enkel de federatie leest ze. Na 30 dagen ruimt het
// eindpunt ze vanzelf op.
export const VirtueleMetingen: CollectionConfig = {
  slug: 'virtuele-metingen',
  labels: { singular: 'Meting', plural: 'Metingen (vlotheid virtueel stadion)' },
  admin: {
    useAsTitle: 'gpu',
    defaultColumns: ['gpu', 'fps', 'duur', 'licht', 'createdAt'],
    group: 'Virtueel stadion',
    description: 'Hoe vlot het stadion loopt per bezoek (anoniem). Het overzicht: /api/virtueel/meting.',
  },
  access: {
    read: ({ req }) => isFederationLevel(req.user),
    create: () => false,
    update: () => false,
    delete: ({ req }) => isFederationLevel(req.user),
  },
  fields: [
    { name: 'sessie', label: 'Bezoek', type: 'text', index: true, admin: { readOnly: true } },
    { name: 'gpu', label: 'Grafische kaart', type: 'text', admin: { readOnly: true } },
    { name: 'licht', label: 'Lichte modus', type: 'checkbox', admin: { readOnly: true } },
    { name: 'duur', label: 'Gemeten (s)', type: 'number', admin: { readOnly: true } },
    { name: 'fps', label: 'Beelden per seconde', type: 'number', admin: { readOnly: true } },
    { name: 'data', label: 'Meting', type: 'json', admin: { readOnly: true } },
  ],
}
