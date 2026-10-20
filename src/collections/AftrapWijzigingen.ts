import type { CollectionConfig, Where } from 'payload'

import { hasRole, isFederationLevel, userClubId } from '../lib/access'

// Logboek van verschoven aftrappen op de wedstrijddag (lib/aftrap.ts): vertraging (file, ziekte,
// vorige wedstrijd loopt uit) of vroeger beginnen omdat een wedstrijd ervoor wegvalt. Elke regel is
// onveranderlijk — de wedstrijd zelf krijgt het nieuwe uur, dit is wie wat wanneer meldde en waarom.
// Ook de basis voor de federatie bij een te-laat-boete. Lezen: federatie, scheidsrechters en de
// twee betrokken clubs. Schrijven enkel via de route.
const lezen = ({ req }: { req: { user?: unknown } }): boolean | Where => {
  if (isFederationLevel(req.user) || hasRole(req.user, 'scheidsrechter')) return true
  const club = userClubId(req.user)
  return club != null && hasRole(req.user, 'club-beheerder', 'club-medewerker', 'club-lid') ? { clubs: { in: [club] } } : false
}

export const AFTRAP_REDENEN = [
  { label: 'File / onderweg', value: 'file' },
  { label: 'Ziekte / te weinig spelers op tijd', value: 'ziekte' },
  { label: 'Vorige wedstrijd loopt uit', value: 'uitloop' },
  { label: 'Wedstrijd ervoor valt weg (vroeger beginnen)', value: 'vervroegen' },
  { label: 'Terrein / materiaal nog niet klaar', value: 'terrein' },
  { label: 'Scheidsrechter later', value: 'scheidsrechter' },
  { label: 'Andere reden', value: 'ander' },
] as const

export const AftrapWijzigingen: CollectionConfig = {
  slug: 'aftrap-wijzigingen',
  labels: { singular: 'Aftrapwijziging', plural: 'Aftrapwijzigingen' },
  admin: { group: 'Wedstrijden', defaultColumns: ['match', 'van', 'naar', 'reden', 'createdAt'] },
  access: {
    read: lezen,
    create: () => false,
    update: () => false,
    delete: ({ req }) => isFederationLevel(req.user),
  },
  fields: [
    { name: 'match', label: 'Wedstrijd', type: 'relationship', relationTo: 'matches', required: true, index: true },
    { name: 'clubs', label: 'Betrokken clubs', type: 'relationship', relationTo: 'clubs', hasMany: true, admin: { readOnly: true } },
    { name: 'van', label: 'Aftrap was', type: 'date', required: true, admin: { date: { pickerAppearance: 'dayAndTime' } } },
    { name: 'naar', label: 'Nieuwe aftrap', type: 'date', required: true, admin: { date: { pickerAppearance: 'dayAndTime' } } },
    { name: 'reden', label: 'Reden', type: 'select', required: true, options: [...AFTRAP_REDENEN] },
    { name: 'toelichting', label: 'Toelichting', type: 'textarea' },
    { name: 'gemeldDoor', label: 'Gemeld door', type: 'relationship', relationTo: 'users', admin: { readOnly: true } },
    { name: 'gemeldDoorNaam', label: 'Gemeld door (naam/rol)', type: 'text', admin: { readOnly: true } },
    {
      name: 'aanleiding',
      label: 'Meegeschoven met',
      type: 'relationship',
      relationTo: 'aftrap-wijzigingen',
      admin: { readOnly: true, description: 'Gezet als deze wedstrijd mee verschoof met een eerdere op hetzelfde terrein.' },
    },
  ],
}
