import type { CollectionConfig } from 'payload'

import { isFederationLevel } from '../lib/access'

// Historisch archief van bekerwinnaars (overgenomen van de officiële KVKBF-site,
// bekerwinnaars.php): per seizoen welke ploeg de beker won in elke categorie. Zelfde opzet als
// Kampioenen.ts — puur informatief, geen koppeling met `teams`: categorieën en ploegnamen liepen
// door de decennia sterk uiteen.
export const Bekerwinnaars: CollectionConfig = {
  slug: 'bekerwinnaars',
  labels: { singular: 'Bekerwinnaars (seizoen)', plural: 'Bekerwinnaars' },
  admin: {
    useAsTitle: 'seizoen',
    defaultColumns: ['seizoen', 'winnaars'],
    group: 'Federatie',
    description: 'Historisch archief: per seizoen de bekerwinnaar van elke categorie. Later de bron voor een publieke lijst.',
  },
  access: {
    read: () => true,
    create: ({ req }) => isFederationLevel(req.user),
    update: ({ req }) => isFederationLevel(req.user),
    delete: ({ req }) => isFederationLevel(req.user),
  },
  fields: [
    { name: 'seizoen', label: 'Seizoen', type: 'text', required: true, unique: true, admin: { description: 'Bv. "2024-2025".' } },
    {
      name: 'seizoenKey',
      label: 'Seizoen-sleutel',
      type: 'text',
      unique: true,
      admin: {
        position: 'sidebar',
        description: 'De "seizoen"-parameter uit de bron-URL (bv. "2024_2025"), enkel voor herimport/koppeling — niet tonen aan bezoekers.',
      },
    },
    { name: 'bron', label: 'Bron', type: 'text', admin: { position: 'sidebar', description: 'URL van de officiële pagina waar dit vandaan komt.' } },
    {
      name: 'winnaars',
      label: 'Winnaars',
      type: 'array',
      required: true,
      fields: [
        { name: 'categorie', label: 'Categorie', type: 'text', required: true },
        { name: 'ploeg', label: 'Ploeg', type: 'text', required: true },
      ],
    },
  ],
}
