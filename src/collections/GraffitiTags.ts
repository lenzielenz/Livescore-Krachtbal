import type { CollectionConfig } from 'payload'

import { isFederationLevel } from '../lib/access'

// De graffitimuur in het virtuele stadion: elke tag die een bezoeker op de muur van zijn club
// spuit. De muur wordt samen gemaakt door alle bezoekers en groeit mee; omdat elke tag hier
// blijvend bewaard wordt, raakt de muur nooit leeg (ook niet na een update). Aanmaken gebeurt via
// de API-route (/api/virtueel/graffiti: login + tempo-limiet + validatie, zie
// lib/virtueel-graffiti.ts). Moderatie: federatie/admin of de maker zelf kan een tag verwijderen.
export const GraffitiTags: CollectionConfig = {
  slug: 'graffiti-tags',
  labels: { singular: 'Graffiti-tag', plural: 'Graffitimuur' },
  admin: {
    useAsTitle: 'authorName',
    defaultColumns: ['authorName', 'club', 'createdAt'],
    group: 'Virtueel stadion',
    description: 'Wat bezoekers op de graffitimuur van hun club spoten. Verwijder hier een ongepaste tag.',
  },
  access: {
    read: () => true,
    create: ({ req }) => isFederationLevel(req.user),
    update: () => false,
    delete: ({ req }) => {
      if (isFederationLevel(req.user)) return true
      const uid = req.user?.id
      return uid ? { author: { equals: uid } } : false
    },
  },
  fields: [
    { name: 'club', label: 'Club (muur)', type: 'relationship', relationTo: 'clubs', index: true, admin: { description: 'Leeg = de algemene muur (bezoekers zonder club).' } },
    { name: 'author', label: 'Gespoten door', type: 'relationship', relationTo: 'users', index: true },
    { name: 'authorName', label: 'Naam', type: 'text' },
    { name: 'wall', label: 'Muur', type: 'text', defaultValue: 'kleedkamer', index: true, admin: { description: "'kleedkamer' (aan het stadion) of 'kelder' (de speelhal op -1)." } },
    { name: 'strokes', label: 'Streken', type: 'json', required: true, admin: { readOnly: true } },
  ],
}
