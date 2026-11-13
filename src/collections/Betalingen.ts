import type { CollectionConfig, Where } from 'payload'

import { hasRole, isFederationLevel, userClubId } from '../lib/access'

// Betalingen op facturen (lib/facturatie-server.ts). Een betaling is een feit en verandert nooit (zoals een
// worp in de match-engine): manueel geregistreerd, uit een bankafschrift ingelezen, of online (Mollie). Fout?
// Schrappen en opnieuw registreren. Of een factuur betaald is, wordt telkens uit deze betalingen berekend.

const lezen = ({ req }: { req: { user?: unknown } }): boolean | Where => {
  if (isFederationLevel(req.user)) return true
  const club = userClubId(req.user)
  return club != null && hasRole(req.user, 'club-beheerder', 'club-medewerker') ? { club: { equals: club } } : false
}

export const Betalingen: CollectionConfig = {
  slug: 'betalingen',
  labels: { singular: 'Betaling', plural: 'Betalingen' },
  admin: { group: 'Federatie', defaultColumns: ['factuur', 'club', 'bedrag', 'datum', 'bron'] },
  access: {
    read: lezen,
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  fields: [
    { name: 'factuur', label: 'Factuur', type: 'relationship', relationTo: 'facturen', required: true, index: true },
    { name: 'club', label: 'Club', type: 'relationship', relationTo: 'clubs', index: true },
    { name: 'bedrag', label: 'Bedrag (€)', type: 'number', required: true },
    { name: 'datum', label: 'Datum', type: 'date', required: true },
    {
      name: 'bron',
      label: 'Bron',
      type: 'select',
      defaultValue: 'manueel',
      options: [
        { label: 'Manueel geregistreerd', value: 'manueel' },
        { label: 'Bankafschrift', value: 'bank' },
        { label: 'Online (Mollie)', value: 'online' },
      ],
    },
    {
      // Tegen dubbel boeken: dezelfde bankregel of dezelfde online betaling komt er maar één keer in.
      name: 'sleutel',
      label: 'Sleutel',
      type: 'text',
      unique: true,
      index: true,
      admin: { readOnly: true },
    },
    { name: 'mededeling', label: 'Mededeling', type: 'text' },
    { name: 'tegenpartij', label: 'Betaald door', type: 'text' },
    { name: 'opmerking', label: 'Opmerking', type: 'text' },
    { name: 'geregistreerdDoor', label: 'Geregistreerd door', type: 'relationship', relationTo: 'users' },
  ],
}
