import Link from 'next/link'

// Extra nav-links in de Payload-admin.
//
// Sommige beheertaken hebben een eigen scherm in de site zelf, omdat ze meer zijn dan een rij
// bewerken: een heel speelplan inlezen met een proefronde vooraf, of spelers in bulk toevoegen.
// Wie in dít menu staat te zoeken, vindt daar niets van — de collections tonen wél "Wedstrijden",
// maar niet hoe je er tweeduizend in één keer binnenkrijgt. Vandaar deze snelkoppelingen: precies
// op de plek waar ernaar gezocht wordt.
const linkStyle = {
  display: 'block',
  padding: '6px 0',
  color: 'var(--theme-elevation-600)',
  textDecoration: 'none',
  fontSize: 14,
} as const

export function BackToSite() {
  return (
    <div style={{ marginBottom: 8 }}>
      <Link href="/" style={linkStyle}>
        ← Naar de site
      </Link>
      <Link href="/beheer/planning" style={linkStyle}>
        📅 Speelkalender importeren
      </Link>
      <Link href="/beheer/spelers" style={linkStyle}>
        + Spelers snel toevoegen
      </Link>
      <Link href="/analyse/import#uitslagen-federatie" style={linkStyle}>
        🔄 Uitslagen ophalen bij de federatie
      </Link>
    </div>
  )
}
