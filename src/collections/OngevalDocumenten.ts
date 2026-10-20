import type { CollectionConfig, Where } from 'payload'

import { hasRole, isFederationLevel, userClubId } from '../lib/access'
import { uploadDirFor } from './Media'

const idVan = (v: unknown) => (v && typeof v === 'object' ? (v as { id?: unknown }).id : v)

// De ingevulde documenten bij een ongevalsaangifte (collections/Accidents.ts): de aangifte zelf, het
// geneeskundig getuigschrift van de dokter, eventueel iets anders (een verslag, een factuur).
// Medisch gegeven (GDPR Art. 9): enkel de federatie, de staf van de club van de speler en de speler
// zelf (of zijn ouder). Payload serveert de bestanden zelf en controleert daarbij deze read-access.
// Aanmaken enkel server-side (lib/ongeval-dossier.ts).
export const OngevalDocumenten: CollectionConfig = {
  slug: 'ongeval-documenten',
  labels: { singular: 'Ongevalsdocument', plural: 'Ongevalsdocumenten' },
  admin: {
    group: 'Federatie',
    hidden: ({ user }) => !isFederationLevel(user),
  },
  access: {
    read: ({ req }) => {
      if (isFederationLevel(req.user)) return true
      const ors: Where[] = []
      const club = userClubId(req.user)
      if (club != null && hasRole(req.user, 'club-beheerder', 'club-medewerker')) ors.push({ club: { equals: club } })
      const u = req.user as { player?: unknown; kinderen?: unknown[] } | null
      const eigen = [idVan(u?.player), ...(u?.kinderen ?? []).map(idVan)].filter((x) => x != null)
      if (eigen.length) ors.push({ player: { in: eigen } })
      return ors.length ? { or: ors } : false
    },
    create: () => false,
    update: () => false,
    delete: ({ req }) => isFederationLevel(req.user),
  },
  fields: [
    { name: 'accident', label: 'Aangifte', type: 'relationship', relationTo: 'accidents', required: true, index: true },
    { name: 'player', label: 'Speler', type: 'relationship', relationTo: 'players', index: true },
    { name: 'club', label: 'Club', type: 'relationship', relationTo: 'clubs', index: true },
    {
      name: 'soort',
      label: 'Soort',
      type: 'select',
      required: true,
      options: [
        { label: 'Aangifte (ingevuld en ondertekend)', value: 'aangifte' },
        { label: 'Geneeskundig getuigschrift', value: 'getuigschrift' },
        { label: 'Ander document', value: 'ander' },
      ],
    },
    { name: 'geuploadDoor', label: 'Opgeladen door', type: 'relationship', relationTo: 'users' },
  ],
  upload: {
    staticDir: uploadDirFor('ongeval-documenten'),
    mimeTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
  },
}
