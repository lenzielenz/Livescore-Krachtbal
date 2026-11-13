import type { CollectionConfig } from 'payload'

import { hasRole, isFederationLevel, userClubId } from '../lib/access'
import { uploadDirFor } from './Media'

const idVan = (v: unknown) => (v && typeof v === 'object' ? (v as { id?: unknown }).id : v)

// Documenten per lid (lib/lid-documenten.ts): een identiteitskaart voor de vergunning, een ingevuld formulier van
// de mutualiteit, een toestemming, een verzekeringsdocument… Persoonsgegevens: enkel de federatie, de staf van de
// eigen club en het lid zelf of zijn ouders (als het document voor het lid zichtbaar is). Payload serveert de
// bestanden zelf en controleert daarbij deze read-access: er is geen publieke URL. Aanmaken enkel server-side.
export const LidDocumenten: CollectionConfig = {
  slug: 'lid-documenten',
  labels: { singular: 'Document van een lid', plural: 'Documenten van leden' },
  admin: {
    group: 'Beheer',
    defaultColumns: ['titel', 'player', 'soort', 'createdAt'],
    hidden: ({ user }) => !isFederationLevel(user),
  },
  access: {
    read: ({ req }) => {
      if (isFederationLevel(req.user)) return true
      const ors: Record<string, unknown>[] = []
      const club = userClubId(req.user)
      if (club != null && hasRole(req.user, 'club-beheerder', 'club-medewerker')) ors.push({ club: { equals: club } })
      const u = req.user as { player?: unknown; kinderen?: unknown[] } | null
      const eigen = [idVan(u?.player), ...(u?.kinderen ?? []).map(idVan)].filter((x) => x != null)
      if (eigen.length) ors.push({ and: [{ player: { in: eigen } }, { zichtbaarVoorLid: { equals: true } }] })
      return ors.length ? ({ or: ors } as never) : false
    },
    create: () => false,
    update: () => false,
    delete: ({ req }) => isFederationLevel(req.user),
  },
  fields: [
    { name: 'player', label: 'Lid', type: 'relationship', relationTo: 'players', index: true },
    { name: 'club', label: 'Club', type: 'relationship', relationTo: 'clubs', index: true },
    {
      name: 'soort',
      label: 'Soort',
      type: 'select',
      defaultValue: 'ander',
      options: [
        { label: 'Identiteit', value: 'identiteit' },
        { label: 'Mutualiteit', value: 'mutualiteit' },
        { label: 'Toestemming', value: 'toestemming' },
        { label: 'Verzekering', value: 'verzekering' },
        { label: 'Ander', value: 'ander' },
      ],
    },
    { name: 'titel', label: 'Titel', type: 'text', required: true },
    { name: 'opmerking', label: 'Opmerking', type: 'text' },
    {
      name: 'zichtbaarVoorLid',
      label: 'Zichtbaar voor het lid (en de ouders)',
      type: 'checkbox',
      defaultValue: true,
      admin: { description: 'Uit: enkel de club en de federatie zien het (bv. een interne nota).' },
    },
    { name: 'geuploadDoor', label: 'Opgeladen door', type: 'relationship', relationTo: 'users' },
  ],
  upload: {
    staticDir: uploadDirFor('lid-documenten'),
    mimeTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
  },
}
