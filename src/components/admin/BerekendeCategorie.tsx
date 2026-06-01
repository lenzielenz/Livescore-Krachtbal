'use client'

import { useFormFields } from '@payloadcms/ui'
import { useEffect, useState } from 'react'

import { categorieVoorGeboortedatum, peiljaar } from '@/lib/age-categories'

// UI-veld op het Speler-formulier: toont de automatisch berekende leeftijdscategorie en
// het peiljaar waarop ze gebaseerd is (LEEFTIJDSCATEGORIE-SPEC §7). Read-only — afgeleid.
export function BerekendeCategorie() {
  const birthDate = useFormFields(([fields]) => fields?.birthDate?.value as string | undefined)
  const [startYear, setStartYear] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/globals/season?depth=0')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data && typeof data.startYear === 'number') setStartYear(data.startYear)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const label = (() => {
    if (startYear === null) return 'Seizoen niet ingesteld — zet eerst het seizoen onder Federatie › Seizoen.'
    if (!birthDate) return 'Vul een geboortedatum in om de categorie te bepalen.'
    const cat = categorieVoorGeboortedatum(birthDate, startYear)
    if (!cat) return 'Ongeldige geboortedatum.'
    return `${cat} — peiljaar ${peiljaar(startYear)}`
  })()

  return (
    <div className="field-type" style={{ marginBottom: 16 }}>
      <label className="field-label">Berekende categorie</label>
      <div
        style={{
          padding: '8px 12px',
          borderRadius: 4,
          background: 'var(--theme-elevation-50)',
          border: '1px solid var(--theme-elevation-150)',
          fontWeight: 600,
        }}
      >
        {label}
      </div>
    </div>
  )
}
