import type { CollectionConfig } from 'payload'

import { isFederationLevel } from '../lib/access'
import { uploadDirFor } from './Media'

// Bezoekersfoto's bij een nieuwsbericht (bv. een actiedag als "Dag van de Sportclub"). Enkel
// toegelaten op artikels waar `News.photosEnabled` aanstaat; de bewaartermijn (`News.photosExpireAt`)
// wordt bij het plaatsen op elke foto gekopieerd naar `expiresAt`, zodat opruimen — net als bij de
// foto-tribune (MatchInstants) — een simpele datumvergelijking blijft i.p.v. telkens het artikel
// erbij te moeten opzoeken.
export const NewsPhotos: CollectionConfig = {
  slug: 'news-photos',
  labels: { singular: 'Nieuwsfoto', plural: "Nieuwsfoto's" },
  admin: {
    useAsTitle: 'uploaderName',
    defaultColumns: ['uploaderName', 'news', 'caption', 'expiresAt', 'createdAt'],
    description: "Foto's die bezoekers zelf toevoegden bij een nieuwsbericht. Verdwijnen automatisch na de bewaartermijn van dat artikel.",
    group: 'Beheer',
  },
  access: {
    // Publiek leesbaar (net als de foto-tribune); verlopen exemplaren worden weggefilterd/gepurged.
    read: () => true,
    // Aanmaken gebeurt server-side via de upload-route (overrideAccess); in de admin enkel federatie/admin.
    create: ({ req }) => isFederationLevel(req.user),
    // Verwijderen: de eigen uploader of federatie/admin (moderatie).
    delete: ({ req }) => {
      if (isFederationLevel(req.user)) return true
      const uid = req.user?.id
      return uid ? { uploader: { equals: uid } } : false
    },
    update: ({ req }) => isFederationLevel(req.user),
  },
  fields: [
    { name: 'news', type: 'relationship', relationTo: 'news', required: true, index: true },
    { name: 'uploader', type: 'relationship', relationTo: 'users', index: true },
    { name: 'uploaderName', type: 'text' },
    { name: 'caption', type: 'text', admin: { description: 'Optioneel bijschrift, bv. de naam van de sportieveling.' } },
    { name: 'expiresAt', type: 'date', required: true, index: true },
  ],
  upload: {
    staticDir: uploadDirFor('news-photos'),
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  },
}
