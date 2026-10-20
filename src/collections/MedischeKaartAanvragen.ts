import type { CollectionConfig } from 'payload'

import { hasRole, isFederationLevel, userClubId } from '../lib/access'

// Aanvraag van een medische kaart bij de federatie — door het lid zelf (vanuit zijn profiel), door een
// ouder voor zijn kind of door de club voor een lid. De federatie behandelt ze (verstuurd/geweigerd);
// de andere partij krijgt telkens een melding (lib/medische-kaart.ts). Aanmaken en behandelen enkel via de routes.
export const MedischeKaartAanvragen: CollectionConfig = {
  slug: 'medische-kaart-aanvragen',
  labels: { singular: 'Aanvraag medische kaart', plural: 'Aanvragen medische kaart' },
  admin: { group: 'Beheer', defaultColumns: ['player', 'via', 'status', 'createdAt'] },
  access: {
    read: ({ req }) => {
      if (isFederationLevel(req.user)) return true
      const ors: Record<string, unknown>[] = []
      const club = userClubId(req.user)
      if (club != null && hasRole(req.user, 'club-beheerder', 'club-medewerker')) ors.push({ club: { equals: club } })
      const speler = (req.user as { player?: unknown } | null)?.player
      const spelerId = speler && typeof speler === 'object' ? (speler as { id?: unknown }).id : speler
      if (spelerId != null) ors.push({ player: { equals: spelerId } })
      const kinderen = ((req.user as { kinderen?: unknown[] } | null)?.kinderen ?? [])
        .map((k) => (k && typeof k === 'object' ? (k as { id?: unknown }).id : k))
        .filter((k) => k != null)
      if (kinderen.length) ors.push({ player: { in: kinderen } })
      return ors.length ? ({ or: ors } as never) : false
    },
    create: () => false,
    update: ({ req }) => isFederationLevel(req.user),
    delete: ({ req }) => isFederationLevel(req.user),
  },
  fields: [
    { name: 'player', label: 'Lid', type: 'relationship', relationTo: 'players', required: true, index: true },
    { name: 'club', type: 'relationship', relationTo: 'clubs', index: true },
    { name: 'aangevraagdDoor', type: 'relationship', relationTo: 'users' },
    {
      name: 'via',
      type: 'select',
      required: true,
      options: [
        { label: 'Door het lid zelf', value: 'lid' },
        { label: 'Door de club', value: 'club' },
        { label: 'Door een ouder', value: 'ouder' },
      ],
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'aangevraagd',
      index: true,
      options: [
        { label: 'Aangevraagd', value: 'aangevraagd' },
        { label: 'Verstuurd', value: 'verstuurd' },
        { label: 'Geweigerd', value: 'geweigerd' },
      ],
    },
    { name: 'opmerking', label: 'Opmerking van de federatie', type: 'text' },
    { name: 'behandeldOp', type: 'date' },
  ],
}
