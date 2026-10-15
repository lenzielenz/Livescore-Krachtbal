import type { CollectionConfig } from 'payload'

import { isFederationLevel } from '../lib/access'
import { uploadDirFor } from './Media'

// De photobooth in de wandelgang van het virtuele stadion: supporters nemen er een selfie, die als
// polaroid naast de booth komt te hangen en een tegel wordt in de grote mozaïek van het clublogo.
//
// Het zijn foto's van mensen. Daarom:
//  • aanmaken enkel via /api/virtueel/photobooth (ingelogd, tempo-limiet, na een duidelijke melding
//    dat de foto zichtbaar wordt in het stadion van je club);
//  • de server verkleint de foto en gooit alle metadata weg (geen GPS, geen toestel);
//  • wie de foto nam, kan hem altijd zelf weer verwijderen (en de federatie ook).
// `tegel` is een piepklein voorbeeld (data-URL) van dezelfde foto, voor de mozaïek: zo hoeft een
// bezoeker geen honderden afbeeldingen te laden.
export const PhotoboothFotos: CollectionConfig = {
  slug: 'photobooth-fotos',
  labels: { singular: 'Photoboothfoto', plural: 'Photoboothfoto’s (virtueel stadion)' },
  admin: {
    useAsTitle: 'authorName',
    defaultColumns: ['filename', 'authorName', 'club', 'createdAt'],
    group: 'Virtueel stadion',
    description: 'Selfies uit de photobooth van het virtuele stadion. Verwijder hier wat niet gepast is.',
  },
  access: {
    read: () => true,
    create: () => false,
    update: () => false,
    delete: ({ req }) => {
      if (isFederationLevel(req.user)) return true
      const uid = req.user?.id
      return uid ? { author: { equals: uid } } : false
    },
  },
  fields: [
    { name: 'club', label: 'Club', type: 'relationship', relationTo: 'clubs', index: true, admin: { description: 'Leeg = het algemene stadion (bezoekers zonder club).' } },
    { name: 'author', label: 'Door', type: 'relationship', relationTo: 'users', index: true },
    { name: 'authorName', label: 'Naam', type: 'text' },
    { name: 'tegel', label: 'Mozaïektegel', type: 'textarea', admin: { readOnly: true, description: 'Klein voorbeeld (data-URL) voor de mozaïek.' } },
  ],
  upload: {
    staticDir: uploadDirFor('photobooth'),
    mimeTypes: ['image/jpeg'],
  },
}
