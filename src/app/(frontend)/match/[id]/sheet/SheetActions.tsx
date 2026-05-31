'use client'

export function SheetActions({ matchId }: { matchId: number }) {
  return (
    <div className="sheet-actions no-print">
      <button onClick={() => window.print()}>🖨 Afdrukken / PDF</button>
      <a href={`/api/match/${matchId}/export`} download>
        ⬇ JSON-export
      </a>
    </div>
  )
}
