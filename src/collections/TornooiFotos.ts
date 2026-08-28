import type { CollectionConfig } from 'payload'

import { isFederation } from '../lib/access'
import { uploadDirFor } from './Media'

// Foto's die supporters van een tornooidag uploaden. Bewust géén publieke galerij: wie uploadt,
// ziet de foto daarna niet meer — alles komt samen op één plek voor de organisatie (federatie).
// Lezen is daarom federatie-only (het zijn foto's van mensen); ook het bestand zelf wordt via de
// Payload-file-route achter diezelfde leestoegang geserveerd. Aanmaken gebeurt uitsluitend via
// de eigen upload-endpoint (ingelogde supporters, server-side met overrideAccess).
export const TornooiFotos: CollectionConfig = {
  slug: 'tornooi-fotos',
  labels: { singular: 'Tornooifoto', plural: 'Tornooifoto’s' },
  admin: {
    useAsTitle: 'filename',
    defaultColumns: ['filename', 'groep', 'uploaderName', 'createdAt'],
    group: 'Wedstrijden',
    description: 'Foto’s die supporters van een tornooidag insturen — enkel zichtbaar voor de federatie.',
  },
  access: {
    read: isFederation,
    create: () => false,
    update: isFederation,
    delete: isFederation,
  },
  fields: [
    {
      name: 'groep',
      label: 'Tornooidag',
      type: 'text',
      required: true,
      index: true,
      admin: { description: 'Hoofdgroep van de tornooidag waarop de foto genomen is.' },
    },
    { name: 'uploader', label: 'Ingestuurd door', type: 'relationship', relationTo: 'users' },
    { name: 'uploaderName', label: 'Naam inzender', type: 'text' },
    {
      // De foto-opdracht die actief was bij het insturen ("📸 Foto met het scorebord", …) —
      // zo ziet de organisatie meteen welke opdracht de foto beantwoordt.
      name: 'opdracht',
      label: 'Opdracht',
      type: 'text',
    },
  ],
  upload: {
    staticDir: uploadDirFor('tornooi-fotos'),
    mimeTypes: ['image/*'],
  },
}
