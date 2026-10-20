// De rollen in de demoruimte (zie docs/DEMORUIMTE.md). Puur, ook bruikbaar in de browser: de
// presentatiepagina toont ze als knoppen, de server maakt er demo-accounts van.

export type DemoRol = {
  sleutel: string
  naam: string
  label: string
  icoon: string
  /** Waar je als deze rol het eerst kijkt. */
  start: string
}

export const DEMO_DOMEIN = 'demo.krachtbal.be'
export const demoEmail = (sleutel: string) => `demo-${sleutel}@${DEMO_DOMEIN}`
export const isDemoAccount = (email: unknown) => typeof email === 'string' && email.toLowerCase().endsWith(`@${DEMO_DOMEIN}`)

export const DEMO_ROLLEN: DemoRol[] = [
  { sleutel: 'federatie', naam: 'Fien Federatie', label: 'Federatie', icoon: '🏛️', start: '/federatie' },
  { sleutel: 'clubbeheer', naam: 'Bart Beheerder', label: 'Clubbeheerder Sint-Michiels', icoon: '🏠', start: '/club' },
  { sleutel: 'clubbeheer-baasrode', naam: 'Bea Bauwens', label: 'Clubbeheerder Baasrode', icoon: '🏠', start: '/club' },
  { sleutel: 'coach', naam: 'Chris Coeck', label: 'Coach heren Sint-Michiels', icoon: '📋', start: '/club' },
  { sleutel: 'coach-baasrode', naam: 'Kim Van Damme', label: 'Coach heren Baasrode', icoon: '📋', start: '/club' },
  { sleutel: 'tafel', naam: 'Tina Tafel', label: 'Aantekentafel Sint-Michiels', icoon: '✏️', start: '/club' },
  { sleutel: 'scheidsrechter', naam: 'Karel Fluit', label: 'Scheidsrechter', icoon: '🧑‍⚖️', start: '/profiel' },
  { sleutel: 'speler', naam: 'Jens Aerts', label: 'Speler Baasrode (geblesseerd)', icoon: '🏃', start: '/profiel' },
  { sleutel: 'ouder', naam: 'Olga Peeters', label: 'Ouder van een U14-speler', icoon: '👪', start: '/profiel' },
  { sleutel: 'supporter', naam: 'Sam Supporter', label: 'Supporter', icoon: '📣', start: '/live' },
]

export const demoRol = (sleutel: string) => DEMO_ROLLEN.find((r) => r.sleutel === sleutel) ?? null
