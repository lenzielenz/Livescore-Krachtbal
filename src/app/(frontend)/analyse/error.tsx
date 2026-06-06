'use client'

// Vangt fouten in het analyse-luik op (bv. een wedstrijd die even niet laadt) en toont een
// nette herprobeer-knop i.p.v. de harde "deze pagina kon niet laden"-foutpagina van de browser.
export default function AnalyseError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="site">
      <h1 className="page-title"><span className="brand">Analyse</span></h1>
      <p className="empty">
        Deze analyse kon even niet laden.{' '}
        <button type="button" onClick={() => reset()} style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', textDecoration: 'underline' }}>
          Opnieuw proberen
        </button>
      </p>
    </div>
  )
}
