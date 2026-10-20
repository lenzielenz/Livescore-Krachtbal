import type { CollectionConfig } from 'payload'

import { hasRole, isFederationLevel, userClubId } from '../lib/access'
import { uploadDirFor } from './Media'

// Het doktersattest (medische keuring) dat een club bij de registratie van een speler oplaadt.
// Medisch gegeven (GDPR): enkel de federatie en de staf van de eigen club zien het bestand. Payload
// serveert de bestanden zelf (/api/medische-attesten/file/…) en controleert daarbij deze read-access,
// dus er is geen publieke URL. Aanmaken gebeurt enkel server-side, vanuit /api/club/leden/attest.
export const MedischeAttesten: CollectionConfig = {
  slug: 'medische-attesten',
  labels: { singular: 'Medisch attest', plural: 'Medische attesten' },
  admin: {
    group: 'Beheer',
    description: 'Doktersattesten bij de spelersregistratie. Zichtbaar via het veld "Attest" op de speler.',
    hidden: ({ user }) => !isFederationLevel(user),
  },
  access: {
    read: ({ req }) => {
      if (isFederationLevel(req.user)) return true
      if (!hasRole(req.user, 'club-beheerder', 'club-medewerker')) return false
      const club = userClubId(req.user)
      return club != null ? { club: { equals: club } } : false
    },
    create: () => false,
    update: () => false,
    delete: ({ req }) => isFederationLevel(req.user),
  },
  fields: [
    { name: 'player', label: 'Speler', type: 'relationship', relationTo: 'players', index: true },
    { name: 'club', label: 'Club', type: 'relationship', relationTo: 'clubs', index: true },
    { name: 'geuploadDoor', label: 'Opgeladen door', type: 'relationship', relationTo: 'users' },
  ],
  upload: {
    staticDir: uploadDirFor('medische-attesten'),
    mimeTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
  },
}
