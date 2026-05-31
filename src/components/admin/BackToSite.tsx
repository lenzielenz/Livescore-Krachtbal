// Nav-link in de Payload-admin terug naar de publieke site.
export function BackToSite() {
  return (
    <a
      href="/"
      style={{
        display: 'block',
        padding: '8px 0',
        marginBottom: 8,
        color: 'var(--theme-elevation-600)',
        textDecoration: 'none',
        fontSize: 14,
      }}
    >
      ← Naar de site
    </a>
  )
}
