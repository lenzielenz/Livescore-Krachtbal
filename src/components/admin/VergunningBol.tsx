'use client'

import type { DefaultCellComponentProps } from 'payload'

// Gekleurde bol voor de vergunningsstatus (LEEFTIJDSCATEGORIE-SPEC §6 / WEDSTRIJDBLAD-PROMPT).
// Groen = geldig, oranje = aangevraagd, grijs = geen. Gebruikt als Cell in de spelerslijst.
const STATUS: Record<string, { color: string; label: string }> = {
  geldig: { color: '#22c55e', label: 'Geldig' },
  aangevraagd: { color: '#f59e0b', label: 'Aangevraagd' },
  geen: { color: '#9ca3af', label: 'Geen' },
}

export function VergunningBol(props: DefaultCellComponentProps) {
  const value = typeof props.cellData === 'string' ? props.cellData : 'geen'
  const { color, label } = STATUS[value] ?? STATUS.geen
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span
        aria-hidden
        style={{
          width: 10,
          height: 10,
          borderRadius: '50%',
          backgroundColor: color,
          display: 'inline-block',
          flexShrink: 0,
        }}
      />
      <span>{label}</span>
    </span>
  )
}
