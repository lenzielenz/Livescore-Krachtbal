// Extra nav-links in de Payload-admin: terug naar de site + snel spelers toevoegen.
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
      <a href="/" style={linkStyle}>
        ← Naar de site
      </a>
      <a href="/beheer/spelers" style={linkStyle}>
        + Spelers snel toevoegen
      </a>
    </div>
  )
}
