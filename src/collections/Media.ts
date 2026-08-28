import type { CollectionConfig } from 'payload'
import fs from 'fs'
import path from 'path'

// Opslagmap voor geüploade bestanden (o.a. clublogo's).
//
// BELANGRIJK op Railway: het container-bestandssysteem is vluchtig — alles wat
// niet op een gekoppeld Volume staat, wordt bij elke deploy/herstart gewist.
// De database draait op een aparte Postgres-service en overleeft wél, dus na een
// deploy blijven de club-records (met logo-URL) bestaan maar zijn de bestanden
// zelf weg → 404 → de scoreboards vallen terug op de initialen van de ploeg.
//
// Daarom kiezen we de opslagmap in deze volgorde:
//   1. MEDIA_DIR            — expliciet ingesteld pad (heeft altijd voorrang).
//   2. RAILWAY_VOLUME_MOUNT_PATH — door Railway automatisch gezet zodra er een
//      Volume aan de service hangt. Zo gaat het "vanzelf goed" en hoeft er geen
//      losse variabele onthouden te worden: koppel een Volume en logo's blijven.
//   3. ./media              — lokale fallback voor ontwikkeling.
function resolveMediaDir(): string {
  if (process.env.MEDIA_DIR) return path.resolve(process.env.MEDIA_DIR)
  if (process.env.RAILWAY_VOLUME_MOUNT_PATH)
    return path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'media')
  return path.resolve(process.cwd(), 'media')
}

/** Submap op dezelfde persistente opslag, voor andere upload-collecties (bv. tornooifoto's). */
export function uploadDirFor(sub: string): string {
  const dir = path.join(resolveMediaDir(), sub)
  try {
    fs.mkdirSync(dir, { recursive: true })
  } catch (err) {
    console.error(`[media] Kon opslagmap niet aanmaken: ${dir}`, err)
  }
  return dir
}

const mediaDir = resolveMediaDir()

// Zorg dat de map bestaat zodat de allereerste upload niet faalt.
try {
  fs.mkdirSync(mediaDir, { recursive: true })
} catch (err) {
  console.error(`[media] Kon opslagmap niet aanmaken: ${mediaDir}`, err)
}

// Waarschuw luid wanneer we in productie naar de vluchtige containerschijf zouden
// schrijven (geen MEDIA_DIR én geen Railway Volume). Dan verdwijnen uploads bij de
// volgende deploy — koppel een Volume aan de service om dit op te lossen.
const hasPersistentStorage =
  Boolean(process.env.MEDIA_DIR) || Boolean(process.env.RAILWAY_VOLUME_MOUNT_PATH)
if (process.env.NODE_ENV === 'production' && !hasPersistentStorage) {
  console.warn(
    '[media] LET OP: geen persistente opslag gevonden (MEDIA_DIR/RAILWAY_VOLUME_MOUNT_PATH ' +
      'ontbreekt). Geüploade clublogo’s worden naar de vluchtige containerschijf geschreven ' +
      `(${mediaDir}) en verdwijnen bij de volgende deploy. Koppel een Railway Volume aan de service.`,
  )
}

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
