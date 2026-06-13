'use client'

// Print-knop die de printmodus op <html> zet (data-print="plan" | "dossier") zodat de print-CSS
// precies het juiste deel toont, en de modus daarna weer opruimt.
export function PrintButton({
  mode,
  label,
  className = 'mp-print',
}: {
  mode: 'plan' | 'dossier'
  label: string
  className?: string
}) {
  const onClick = () => {
    const html = document.documentElement
    html.dataset.print = mode
    const clear = () => {
      delete html.dataset.print
      window.removeEventListener('afterprint', clear)
    }
    window.addEventListener('afterprint', clear)
    window.print()
    // Vangnet voor browsers die geen afterprint vuren.
    window.setTimeout(clear, 1500)
  }
  return (
    <button type="button" className={className} onClick={onClick}>
      {label}
    </button>
  )
}
