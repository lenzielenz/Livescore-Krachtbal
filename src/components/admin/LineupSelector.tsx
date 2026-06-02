'use client'

import { useField, useFormFields } from '@payloadcms/ui'
import { useEffect, useMemo, useState } from 'react'

import { POSITION_OPTIONS } from '@/collections/Players'

// Klikbare opstellingskiezer voor het Wedstrijd-formulier. Vervangt de standaard
// één-voor-één relatie-dropdown: zodra de ploeg gekozen is, tonen we meteen de
// volledige spelerslijst van die ploeg als aanklikbare lijst. Klikken = selecteren
// of deselecteren (multi-select). Een schakelaar toont desgewenst ook inactieve leden.

type PlayerDoc = {
  id: number | string
  name: string
  shirtNumber?: number | null
  position?: string | null
  actief?: boolean | null
}

type Props = {
  // Door Payload doorgegeven pad van dit veld (homeLineup / awayLineup).
  path: string
  // Via clientProps: het pad van het bijbehorende ploegveld (homeTeam / awayTeam).
  teamPath: string
  label?: string
}

const POSITION_LABEL: Record<string, string> = Object.fromEntries(
  POSITION_OPTIONS.map((o) => [o.value, o.label]),
)

// Haal de relatie-id uit een veldwaarde, ongeacht of die als id of als object komt.
function relId(v: unknown): string | number | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'object' && v !== null && 'value' in v) {
    const inner = (v as { value: unknown }).value
    if (inner && typeof inner === 'object' && 'id' in inner) return (inner as { id: string | number }).id
    return inner as string | number
  }
  if (typeof v === 'object' && 'id' in v) return (v as { id: string | number }).id
  return v as string | number
}

export const LineupSelector = (props: Props) => {
  const { path, teamPath, label } = props
  const { value, setValue } = useField<(string | number)[] | null>({ path })
  const teamValue = useFormFields(([fields]) => fields?.[teamPath]?.value)

  const teamId = relId(teamValue)

  const [players, setPlayers] = useState<PlayerDoc[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showInactive, setShowInactive] = useState(false)

  // Spelers van de gekozen ploeg ophalen.
  useEffect(() => {
    if (teamId === null || teamId === undefined) {
      setPlayers([])
      setError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(
      `/api/players?where[team][equals]=${encodeURIComponent(String(teamId))}&limit=300&depth=0&sort=shirtNumber`,
    )
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('fout bij ophalen'))))
      .then((data: { docs?: PlayerDoc[] }) => {
        if (!cancelled) setPlayers(Array.isArray(data?.docs) ? data.docs : [])
      })
      .catch(() => {
        if (!cancelled) {
          setPlayers([])
          setError('Kon de spelers van deze ploeg niet laden.')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [teamId])

  // Geselecteerde id's als set van strings voor snelle vergelijking.
  const selected = useMemo(() => {
    const arr = Array.isArray(value) ? value : []
    return new Set(arr.map((v) => String(relId(v))))
  }, [value])

  const visiblePlayers = useMemo(
    () => (showInactive ? players : players.filter((p) => p.actief !== false)),
    [players, showInactive],
  )

  const toggle = (id: string | number) => {
    const key = String(id)
    const current = (Array.isArray(value) ? value : []).map((v) => relId(v)).filter((v) => v !== null) as (
      | string
      | number
    )[]
    if (selected.has(key)) {
      setValue(current.filter((v) => String(v) !== key))
    } else {
      setValue([...current, id])
    }
  }

  const clearAll = () => setValue([])

  const hasInactive = players.some((p) => p.actief === false)
  const selectedCount = selected.size

  return (
    <div className="field-type" style={{ marginBottom: 20 }}>
      <label className="field-label">{label ?? 'Opstelling'}</label>

      {teamId === null || teamId === undefined ? (
        <div style={messageBoxStyle}>Kies eerst een ploeg hierboven om de spelers te zien.</div>
      ) : loading ? (
        <div style={messageBoxStyle}>Spelers laden…</div>
      ) : error ? (
        <div style={{ ...messageBoxStyle, color: 'var(--theme-error-500)' }}>{error}</div>
      ) : players.length === 0 ? (
        <div style={messageBoxStyle}>Deze ploeg heeft nog geen spelers.</div>
      ) : (
        <>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 8,
              marginBottom: 8,
            }}
          >
            <span style={{ fontSize: 13, color: 'var(--theme-elevation-500)' }}>
              {selectedCount} geselecteerd
            </span>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              {hasInactive && (
                <label
                  style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}
                >
                  <input
                    type="checkbox"
                    checked={showInactive}
                    onChange={(e) => setShowInactive(e.target.checked)}
                  />
                  Toon ook inactieve spelers
                </label>
              )}
              {selectedCount > 0 && (
                <button
                  type="button"
                  className="btn btn--style-secondary btn--size-small"
                  style={{ margin: 0 }}
                  onClick={clearAll}
                >
                  Wis selectie
                </button>
              )}
            </div>
          </div>

          <ul
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            {visiblePlayers.map((p) => {
              const isSelected = selected.has(String(p.id))
              const inactive = p.actief === false
              return (
                <li key={String(p.id)}>
                  <button
                    type="button"
                    onClick={() => toggle(p.id)}
                    aria-pressed={isSelected}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      width: '100%',
                      textAlign: 'left',
                      padding: '8px 12px',
                      borderRadius: 4,
                      cursor: 'pointer',
                      border: `1px solid ${
                        isSelected ? 'var(--theme-success-500)' : 'var(--theme-elevation-150)'
                      }`,
                      background: isSelected
                        ? 'var(--theme-success-50, var(--theme-elevation-50))'
                        : 'var(--theme-elevation-0)',
                      color: 'var(--theme-elevation-800)',
                      opacity: inactive ? 0.6 : 1,
                    }}
                  >
                    <span
                      aria-hidden
                      style={{
                        flexShrink: 0,
                        width: 18,
                        height: 18,
                        borderRadius: 4,
                        border: `1px solid ${
                          isSelected ? 'var(--theme-success-500)' : 'var(--theme-elevation-300)'
                        }`,
                        background: isSelected ? 'var(--theme-success-500)' : 'transparent',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 13,
                        lineHeight: 1,
                      }}
                    >
                      {isSelected ? '✓' : ''}
                    </span>
                    <span
                      style={{
                        flexShrink: 0,
                        minWidth: 28,
                        fontVariantNumeric: 'tabular-nums',
                        fontWeight: 600,
                        color: 'var(--theme-elevation-500)',
                      }}
                    >
                      {typeof p.shirtNumber === 'number' ? `#${p.shirtNumber}` : '—'}
                    </span>
                    <span style={{ fontWeight: 500 }}>{p.name}</span>
                    {p.position && (
                      <span style={{ fontSize: 12, color: 'var(--theme-elevation-450)' }}>
                        {POSITION_LABEL[p.position] ?? p.position}
                      </span>
                    )}
                    {inactive && (
                      <span style={{ fontSize: 12, color: 'var(--theme-elevation-400)', marginLeft: 'auto' }}>
                        inactief
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}

const messageBoxStyle: React.CSSProperties = {
  padding: '12px 14px',
  borderRadius: 4,
  background: 'var(--theme-elevation-50)',
  border: '1px solid var(--theme-elevation-150)',
  color: 'var(--theme-elevation-500)',
  fontSize: 14,
}
