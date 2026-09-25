import type { CollectionConfig } from 'payload'

import { isFederationLevel } from '../lib/access'

// Historisch kampioenenarchief (overgenomen van de officiële KVKBF-site, kampioenen.php): per
// seizoen welke ploeg in elke reeks kampioen werd. Puur historisch/informatief — geen koppeling
// met de live-competitie (`teams`/`matches`): de reeksnamen en zelfs de ploegnamen liepen door de
// decennia sterk uiteen (bv. reeksen die niet meer bestaan, clubs die ondertussen fuseerden of
// verdwenen), dus staat alles hier als vrije tekst i.p.v. een relationship. Vandaar ook geen
// koppeling met `Reeks` uit lib/reeksen.ts, dat enkel de huidige competitiestructuur kent.
export const Kampioenen: CollectionConfig = {
  slug: 'kampioenen',
  labels: { singular: 'Kampioenen (seizoen)', plural: 'Kampioenen' },
  admin: {
    useAsTitle: 'seizoen',
    defaultColumns: ['seizoen', 'reeksen'],
    group: 'Federatie',
    description: 'Historisch archief: per seizoen de kampioen van elke reeks. Later de bron voor een publieke kampioenenlijst.',
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
        description: 'De "seizoen"-parameter uit de bron-URL (bv. "202425"), enkel voor herimport/koppeling — niet tonen aan bezoekers.',
      },
    },
    { name: 'bron', label: 'Bron', type: 'text', admin: { position: 'sidebar', description: 'URL van de officiële pagina waar dit vandaan komt.' } },
    {
      name: 'reeksen',
      label: 'Reeksen',
      type: 'array',
      required: true,
      fields: [
        { name: 'reeksNaam', label: 'Reeks', type: 'text', required: true },
        { name: 'kampioen', label: 'Kampioen', type: 'text', required: true },
      ],
    },
  ],
}
