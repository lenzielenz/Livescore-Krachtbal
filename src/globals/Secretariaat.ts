import type { GlobalConfig } from 'payload'

import { isFederationLevel } from '../lib/access'

// Contactgegevens van het federatiesecretariaat, overgenomen van de officiële KVKBF-site
// (krachtbal.be/secretariaat.php). Eén vaste record (zoals Settings) — geen archief, dit is de
// huidige stand van zaken. Later te tonen op een publieke contactpagina.
export const Secretariaat: GlobalConfig = {
  slug: 'secretariaat',
  label: 'Secretariaat',
  admin: {
    group: 'Federatie',
    description: 'Contactgegevens van het federatiesecretariaat. Later de bron voor een publieke contactpagina.',
  },
  access: {
    read: () => true,
    update: ({ req }) => isFederationLevel(req.user),
  },
  fields: [
    { name: 'adres', label: 'Adres', type: 'textarea', admin: { description: 'Bv. "Oude Burg 23, 8000 Brugge - bezoek enkel na afspraak".' } },
    { name: 'routeUrl', label: 'Route (PDF/link)', type: 'text' },
    {
      type: 'row',
      fields: [
        { name: 'telefoon', label: 'Telefoon', type: 'text' },
        { name: 'telefoonAlt', label: 'Telefoon (alternatief)', type: 'text' },
      ],
    },
    { name: 'email', label: 'E-mail', type: 'email' },
    { name: 'meldenUitslagen', label: 'Uitslagen melden via', type: 'text' },
    { name: 'federatieApiContact', label: 'Federatie API — contact', type: 'email' },
    { name: 'bron', label: 'Bron', type: 'text', admin: { position: 'sidebar', description: 'URL van de officiële pagina waar dit vandaan komt.' } },
  ],
}
