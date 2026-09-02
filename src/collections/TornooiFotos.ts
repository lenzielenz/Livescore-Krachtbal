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
      // zo ziet de organisatie meteen welke opdracht de foto beantwoordt, en het kantinescherm
      // zet ze onder de foto. De server berekent ze zelf; de browser mag ze niet meesturen.
      name: 'opdracht',
      label: 'Opdracht',
      type: 'text',
    },
    {
      // Het hoeveelste van de vijftig dit was voor déze inzender (0-based). Hierop staat of valt
      // de voortgang: de volgende opdracht is die van het hoogste nummer + 1. Dat is een feit
      // over de foto, geen afgeleide staat — en het is meteen de reden dat een deelnemer op zijn
      // tablet verderdoet waar zijn gsm stopte, zonder dat er iets in de browser bewaard wordt.
      name: 'opdrachtNr',
      label: 'Opdrachtnummer',
      type: 'number',
      index: true,
      admin: { description: 'Het hoeveelste van de vijftig, voor deze inzender op deze dag.' },
    },
  ],
  upload: {
    staticDir: uploadDirFor('tornooi-fotos'),
    mimeTypes: ['image/*'],
  },
}
