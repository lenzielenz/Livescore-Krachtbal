import type { CollectionConfig } from 'payload'

import { hasRole, isFederationLevel, userClubId } from '../lib/access'
import { uploadDirFor } from './Media'

const idVan = (v: unknown) => (v && typeof v === 'object' ? (v as { id?: unknown }).id : v)

// Het doktersattest (medische keuring) dat een club bij de registratie van een speler oplaadt.
// Medisch gegeven (GDPR): enkel de federatie, de staf van de eigen club en het lid zelf (of zijn ouder)
// zien het bestand. Payload serveert de bestanden zelf (/api/medische-attesten/file/…) en controleert
// daarbij deze read-access, dus er is geen publieke URL. Aanmaken gebeurt enkel server-side (lib/registratie-server.ts → attestOpslaan).
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
      const ors: Record<string, unknown>[] = []
      const club = userClubId(req.user)
      if (club != null && hasRole(req.user, 'club-beheerder', 'club-medewerker')) ors.push({ club: { equals: club } })
      // Het lid zelf en de ouder(s) zien het attest dat ze (of de club) voor hen oplaadden.
      const u = req.user as { player?: unknown; kinderen?: unknown[] } | null
      const eigen = [idVan(u?.player), ...(u?.kinderen ?? []).map(idVan)].filter((x) => x != null)
      if (eigen.length) ors.push({ player: { in: eigen } })
      return ors.length ? ({ or: ors } as never) : false
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
