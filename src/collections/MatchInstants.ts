import type { CollectionConfig } from 'payload'
import fs from 'fs'
import path from 'path'

import { isFederationLevel } from '../lib/access'

// Blijvende foto-/video-tribune: spontane supportersmomenten blijven bij de wedstrijd bewaard.
// ENKEL op volwassen wedstrijden (de safeguarding-grens wordt server-side in de
// upload-route afgedwongen, niet hier). Foto's worden client-side verkleind vóór upload, dus we
// hebben hier geen server-side beeldverwerking (sharp) nodig — video's gaan ongewijzigd door
// (sharp raakt niet-image mimetypes sowieso niet aan).

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
  labels: { singular: 'Foto/video-instant', plural: 'Foto/video-instants' },
  admin: {
    useAsTitle: 'authorName',
    defaultColumns: ['authorName', 'match', 'kind', 'createdAt'],
    description: 'Blijvende supportersfoto’s en -video’s bij een wedstrijd. Alleen moderatie verwijdert ze.',
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
      name: 'kind',
      type: 'select',
      options: [
        { label: 'Foto', value: 'photo' },
        { label: 'Video', value: 'video' },
      ],
      defaultValue: 'photo',
      required: true,
      index: true,
    },
    {
      name: 'expiresAt',
      type: 'date',
      required: true,
      index: true,
      admin: { hidden: true, description: 'Legacy veld; nieuwe foto’s blijven bewaard.' },
    },
  ],
  upload: {
    staticDir: resolveInstantsDir(),
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime'],
  },
}
