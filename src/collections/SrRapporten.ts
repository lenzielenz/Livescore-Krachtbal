import type { CollectionConfig, Where } from 'payload'

import { isFederationLevel } from '../lib/access'
import { uploadDirFor } from './Media'

// Scheidsrechtersrapport (RCVK item 27): "wanneer tijdens een wedstrijd onregelmatigheden gebeuren, of
// wanneer een ploeg voorbehoud aantekent, zal de scheidsrechter […] een rapport opmaken en dit naar het
// betrokken scheidsrechterscomité doorsturen". Ook bij een wedstrijd die niet gespeeld kon worden
// (item 5.1) en bij een ernstig incident (item 13).
//
// Eén record = één ondertekend rapport. Na het indienen verandert het niet meer (zoals een getekend
// blad); een aanvulling is een tweede rapport. De federatie handelt het af (status + besluit).
// Lezen: de federatie en de scheidsrechter die het schreef. Aanmaken enkel server-side (lib/sr-rapport.ts).
const eigenOfFederatie = ({ req }: { req: { user?: unknown } }): boolean | Where => {
  if (isFederationLevel(req.user)) return true
  const id = (req.user as { id?: unknown } | null)?.id
  return id != null ? { scheidsrechter: { equals: id } } : false
}

export const SR_RAPPORT_AANLEIDINGEN = [
  { label: 'Voorbehoud aangetekend', value: 'voorbehoud' },
  { label: 'Uitsluiting', value: 'uitsluiting' },
  { label: 'Wedstrijd niet (volledig) gespeeld', value: 'niet_gespeeld' },
  { label: 'Incident of onsportief gedrag', value: 'incident' },
  { label: 'Andere onregelmatigheid', value: 'ander' },
] as const

export const SrRapporten: CollectionConfig = {
  slug: 'sr-rapporten',
  labels: { singular: 'Scheidsrechtersrapport', plural: 'Scheidsrechtersrapporten' },
  admin: {
    group: 'Federatie',
    defaultColumns: ['match', 'scheidsrechter', 'status', 'createdAt'],
    hidden: ({ user }) => !isFederationLevel(user),
  },
  access: {
    read: eigenOfFederatie,
    create: () => false,
    update: () => false,
    delete: ({ req }) => isFederationLevel(req.user),
  },
  fields: [
    { name: 'match', label: 'Wedstrijd', type: 'relationship', relationTo: 'matches', required: true, index: true },
    { name: 'scheidsrechter', label: 'Scheidsrechter', type: 'relationship', relationTo: 'users', required: true, index: true },
    { name: 'aanleidingen', label: 'Aanleiding', type: 'select', hasMany: true, options: [...SR_RAPPORT_AANLEIDINGEN] },
    { name: 'relaas', label: 'Relaas', type: 'textarea', required: true },
    { name: 'bijlagen', label: 'Bijlagen', type: 'relationship', relationTo: 'rapport-bijlagen', hasMany: true },
    { name: 'ondertekendNaam', label: 'Ondertekend door', type: 'text', required: true },
    { name: 'ondertekendOp', label: 'Ondertekend op', type: 'date', required: true },
    {
      name: 'status',
      label: 'Status',
      type: 'select',
      defaultValue: 'ingediend',
      index: true,
      options: [
        { label: 'Bij het comité', value: 'ingediend' },
        { label: 'Afgehandeld', value: 'afgehandeld' },
      ],
    },
    { name: 'besluit', label: 'Besluit van het comité', type: 'textarea' },
    { name: 'behandeldDoor', label: 'Behandeld door', type: 'relationship', relationTo: 'users' },
    { name: 'behandeldOp', label: 'Behandeld op', type: 'date' },
  ],
}

// De bijlagen bij een rapport (foto, verklaring, …). Zelfde leesrechten als het rapport: wie het
// opgeladen heeft en de federatie. Payload serveert de bestanden en controleert daarbij deze access.
export const RapportBijlagen: CollectionConfig = {
  slug: 'rapport-bijlagen',
  labels: { singular: 'Rapportbijlage', plural: 'Rapportbijlagen' },
  admin: { group: 'Federatie', hidden: ({ user }) => !isFederationLevel(user) },
  access: {
    read: ({ req }) => {
      if (isFederationLevel(req.user)) return true
      const id = (req.user as { id?: unknown } | null)?.id
      return id != null ? { geuploadDoor: { equals: id } } : false
    },
    create: () => false,
    update: () => false,
    delete: ({ req }) => isFederationLevel(req.user),
  },
  fields: [
    { name: 'match', label: 'Wedstrijd', type: 'relationship', relationTo: 'matches', index: true },
    { name: 'geuploadDoor', label: 'Opgeladen door', type: 'relationship', relationTo: 'users', index: true },
  ],
  upload: {
    staticDir: uploadDirFor('rapport-bijlagen'),
    mimeTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
  },
}
