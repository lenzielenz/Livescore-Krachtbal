import type { CollectionConfig } from 'payload'
import fs from 'fs'
import path from 'path'

import { isFederationLevel } from '../lib/access'

// Vluchtige foto-tribune: spontane supporterfoto's bij een wedstrijd, die automatisch verdwijnen
// (expiresAt). ENKEL op volwassen wedstrijden (de safeguarding-grens wordt server-side in de
// upload-route afgedwongen, niet hier). Foto's worden client-side verkleind vóór upload, dus we
// hebben hier geen server-side beeldverwerking (sharp) nodig.

function resolveInstantsDir(): string {
  const base = process.env.MEDIA_DIR
    ? path.resolve(process.env.MEDIA_DIR)
    : process.env.RAILWAY_VOLUME_MOUNT_PATH
      ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'media')
      : path.resolve(process.cwd(), 'media')
  const dir = path.join(base, 'instants')
  try {
    fs.mkdirSync(dir, { recursive: true })
  } catch (err) {
    console.error(`[instants] Kon opslagmap niet aanmaken: ${dir}`, err)
  }
  return dir
}

export const MatchInstants: CollectionConfig = {
  slug: 'match-instants',
  labels: { singular: 'Foto-instant', plural: 'Foto-instants' },
  admin: {
    useAsTitle: 'authorName',
    defaultColumns: ['authorName', 'match', 'expiresAt'],
    description: 'Vluchtige supporterfoto’s bij een wedstrijd. Verdwijnen automatisch na expiresAt.',
  },
  access: {
    // Publiek leesbaar; de verlopen exemplaren worden in de query's weggefilterd en gepurged.
    read: () => true,
    // Aanmaken gebeurt server-side via de upload-route (overrideAccess); in de admin enkel federatie/admin.
    create: ({ req }) => isFederationLevel(req.user),
    // Verwijderen: de eigen poster of federatie/admin (moderatie).
    delete: ({ req }) => {
      if (isFederationLevel(req.user)) return true
      const uid = req.user?.id
      return uid ? { author: { equals: uid } } : false
    },
    update: ({ req }) => isFederationLevel(req.user),
  },
  fields: [
    { name: 'match', type: 'relationship', relationTo: 'matches', required: true, index: true },
    { name: 'author', type: 'relationship', relationTo: 'users', index: true },
    { name: 'authorName', type: 'text' },
    {
      name: 'expiresAt',
      type: 'date',
      required: true,
      index: true,
      admin: { description: 'Wanneer deze foto automatisch verdwijnt.' },
    },
  ],
  upload: {
    staticDir: resolveInstantsDir(),
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  },
}
