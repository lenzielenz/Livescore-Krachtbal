import type { CollectionConfig } from 'payload'

import { isFederationLevel } from '../lib/access'

// Historisch archief van het jaarlijkse referendum (overgenomen van de officiële KVKBF-site,
// referendum.php): per prijs (bv. "Speler van het jaar") de winnaar per jaar. Anders dan
// Kampioenen/Bekerwinnaars is dit GEEN seizoensgebonden pagina — de bron is één enkele statische
// pagina met vier tabellen, dus hier is één document per prijs de natuurlijke eenheid i.p.v. één
// per seizoen. Puur informatief, geen koppeling met `players`: namen/clubs uit de bron zijn vrije
// tekst en niet gegarandeerd te matchen met bestaande spelersrecords.
export const ReferendumAwards: CollectionConfig = {
  slug: 'referendum-awards',
  labels: { singular: 'Referendum-prijs', plural: 'Referendum' },
  admin: {
    useAsTitle: 'prijs',
    defaultColumns: ['prijs', 'winnaars'],
    group: 'Federatie',
    description: 'Historisch archief van het jaarlijkse referendum (speler/speelster/belofte van het jaar). Later de bron voor een publieke lijst.',
  },
  access: {
    read: () => true,
    create: ({ req }) => isFederationLevel(req.user),
    update: ({ req }) => isFederationLevel(req.user),
    delete: ({ req }) => isFederationLevel(req.user),
  },
  fields: [
    { name: 'prijs', label: 'Prijs', type: 'text', required: true, unique: true, admin: { description: 'Bv. "Speler van het jaar".' } },
    { name: 'bron', label: 'Bron', type: 'text', admin: { position: 'sidebar', description: 'URL van de officiële pagina waar dit vandaan komt.' } },
    {
      name: 'winnaars',
      label: 'Winnaars per jaar',
      type: 'array',
      required: true,
      fields: [
        { name: 'jaar', label: 'Jaar', type: 'text', required: true },
        { name: 'naam', label: 'Naam', type: 'text', required: true },
        { name: 'club', label: 'Club', type: 'text', required: true },
      ],
    },
  ],
}
