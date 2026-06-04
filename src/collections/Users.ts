import type { CollectionConfig, FieldHook } from 'payload'

import { ROLE_OPTIONS, hasRole, isAdmin } from '../lib/access'

// Eerste gebruiker (bij lege database) wordt automatisch admin; daarna erft de waarde
// die de admin instelt.
const ensureFirstUserAdmin: FieldHook = async ({ req, operation, value }) => {
  if (operation !== 'create') return value
  const existing = await req.payload.count({ collection: 'users' })
  if (existing.totalDocs === 0) return ['admin']
  return value && Array.isArray(value) && value.length > 0 ? value : ['scorekeeper']
}

export const Users: CollectionConfig = {
  slug: 'users',
  labels: { singular: 'Gebruiker', plural: 'Gebruikers' },
  admin: {
    useAsTitle: 'email',
    defaultColumns: ['email', 'name', 'roles', 'club'],
    group: 'Beheer',
  },
  auth: true,
  access: {
    // Alleen admins beheren gebruikers; de eerste gebruiker mag aangemaakt worden bij lege db.
    create: isAdmin,
    read: ({ req }) => Boolean(req.user),
    update: ({ req, id }) => hasRole(req.user, 'admin') || req.user?.id === id,
    delete: isAdmin,
  },
  fields: [
    {
      name: 'name',
      label: 'Naam',
      type: 'text',
    },
    {
      name: 'roles',
      label: 'Rollen / rechten',
      type: 'select',
      hasMany: true,
      options: [...ROLE_OPTIONS],
      defaultValue: ['scorekeeper'],
      admin: {
        description:
          'Elke rol geeft eigen rechten. Hiërarchie: Admin (volledige toegang, beheert gebruikers) staat boven Federatie (beheert competitie/vergunningen). Supporters registreren zichzelf; enkel een admin kent hier hogere rollen toe.',
      },
      // Enkel admins mogen rollen wijzigen.
      access: {
        update: ({ req }) => hasRole(req.user, 'admin'),
      },
      hooks: {
        beforeChange: [ensureFirstUserAdmin],
      },
    },
    {
      // De club waar deze gebruiker bij hoort. Een supporter kiest ze (optioneel) bij
      // registratie en wordt er overal naartoe gestuurd; voor een club-beheerder bepaalt
      // ze de toegang tot leden en opstellingen (WEDSTRIJDBLAD-PROMPT §Rollen).
      name: 'club',
      label: 'Club',
      type: 'relationship',
      relationTo: 'clubs',
      admin: {
        description: 'De eigen club (supporter volgt ze; club-beheerder beheert ze).',
      },
    },
    {
      // Koppelt een scheidsrechter-account aan zijn/haar official-dossier, zodat hij enkel z'n
      // EIGEN kwitantie/forfaitblad kan ophalen en enkel toegewezen wedstrijden kan tekenen
      // (voorkomt IDOR op financiële PII — zie AUDIT-2026-06.md §4/§5).
      name: 'official',
      label: 'Officialdossier (voor scheidsrechter/grensrechter)',
      type: 'relationship',
      relationTo: 'officials',
      admin: {
        description: 'Enkel relevant voor de rol "Scheidsrechter". Beperkt de toegang tot de eigen kwitantie.',
        condition: (data) => Array.isArray(data?.roles) && data.roles.includes('scheidsrechter'),
      },
    },
  ],
}
