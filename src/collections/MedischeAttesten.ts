import type { CollectionConfig } from 'payload'

import { hasRole, isFederationLevel, userClubId } from '../lib/access'
import { ATTEST_STATUS_OPTIONS } from '../lib/attest'
import { uploadDirFor } from './Media'

const idVan = (v: unknown) => (v && typeof v === 'object' ? (v as { id?: unknown }).id : v)

// Het doktersattest (medische keuring) dat een club bij de registratie van een speler oplaadt.
// Medisch gegeven (GDPR): enkel de federatie, de staf van de eigen club en het lid zelf (of zijn ouder)
// zien het bestand. Payload serveert de bestanden zelf (/api/medische-attesten/file/…) en controleert
// daarbij deze read-access, dus er is geen publieke URL. Aanmaken gebeurt enkel server-side (lib/attest-server.ts → attestOpslaan).
export const MedischeAttesten: CollectionConfig = {
  slug: 'medische-attesten',
  labels: { singular: 'Medisch attest', plural: 'Medische attesten' },
  admin: {
    group: 'Beheer',
    description: 'Medische attesten. Wat niet vanzelf goedgekeurd werd, staat op /beheer/attesten ter nakijken.',
    defaultColumns: ['filename', 'player', 'status', 'via', 'createdAt'],
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
    {
      // Beoordeling (lib/attest.ts): alles juist → het systeem keurde goed; anders kijkt de federatie het na.
      name: 'status',
      label: 'Status',
      type: 'select',
      options: ATTEST_STATUS_OPTIONS,
      defaultValue: 'goedgekeurd',
      index: true,
    },
    { name: 'reden', label: 'Waarom nakijken', type: 'text', admin: { readOnly: true } },
    {
      name: 'via',
      label: 'Opgeladen via',
      type: 'select',
      options: [
        { label: 'De federatie', value: 'federatie' },
        { label: 'De club', value: 'club' },
        { label: 'Het lid of een ouder (ingelogd)', value: 'lid' },
        { label: 'De publieke link (zonder login)', value: 'publiek' },
      ],
    },
    { name: 'blanco', label: 'Blanco attest (lid nog te zoeken)', type: 'checkbox', defaultValue: false },
    { name: 'keuringOp', label: 'Datum van de keuring', type: 'date', admin: { date: { pickerAppearance: 'dayOnly' } } },
    {
      // Bij een blanco attest: wat de uploader opgaf (naam, geboortedatum, club, e-mail) en het lid dat het
      // systeem erbij vond (voorstelLid). Persoonsgegevens: enkel de federatie ziet een blanco attest.
      name: 'opgegeven',
      label: 'Opgegeven bij een blanco attest',
      type: 'json',
      admin: { readOnly: true },
    },
    { name: 'afkeurReden', label: 'Reden van afkeuring', type: 'text' },
    { name: 'beoordeeldDoor', label: 'Beoordeeld door', type: 'relationship', relationTo: 'users' },
    { name: 'beoordeeldOp', label: 'Beoordeeld op', type: 'date' },
    { name: 'player', label: 'Speler', type: 'relationship', relationTo: 'players', index: true },
    { name: 'club', label: 'Club', type: 'relationship', relationTo: 'clubs', index: true },
    { name: 'geuploadDoor', label: 'Opgeladen door', type: 'relationship', relationTo: 'users' },
    {
      name: 'herkendViaQr',
      label: 'Herkend via de QR-code',
      type: 'checkbox',
      defaultValue: false,
      admin: { readOnly: true, description: 'De foto of scan toonde de QR-code van de medische kaart van dit lid.' },
    },
    {
      // Wat het systeem op het attest las (lib/medische-kaart-lezen.ts): { uitlijning, vakjes: { geschikt,
      // nietHoger: { aangekruist: true|false|null, inkt } } }. Een vaststelling bij het opladen, geen afgeleide staat.
      name: 'lezing',
      label: 'Automatisch gelezen',
      type: 'json',
      admin: { readOnly: true, description: 'De aankruisvakjes zoals het systeem ze las bij het opladen.' },
    },
  ],
  upload: {
    staticDir: uploadDirFor('medische-attesten'),
    mimeTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
  },
}
