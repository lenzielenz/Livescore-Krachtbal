import type { CollectionConfig } from 'payload'
import path from 'path'

// Opslagmap voor geüploade bestanden (o.a. clublogo's).
//
// BELANGRIJK op Railway: het container-bestandssysteem is vluchtig — alles wat
// niet op een gekoppeld Volume staat, wordt bij elke deploy/herstart gewist.
// Zonder permanente opslag verdwijnen geüploade logo's daardoor na een deploy:
// het databaserecord (met URL) blijft, maar het bestand is weg → 404 → de
// scoreboards vallen terug op de initialen van de ploeg.
//
// Zet daarom op Railway MEDIA_DIR naar een pad op het gekoppelde Volume,
// bv. MEDIA_DIR=/data/media (Volume gemount op /data). Lokaal valt dit terug
// op een gewone map in de projectroot.
const mediaDir = process.env.MEDIA_DIR
  ? path.resolve(process.env.MEDIA_DIR)
  : path.resolve(process.cwd(), 'media')

export const Media: CollectionConfig = {
  slug: 'media',
  access: {
    read: () => true,
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
    },
  ],
  upload: {
    staticDir: mediaDir,
  },
}
