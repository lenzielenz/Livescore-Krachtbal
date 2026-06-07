'use client'

import { useFormFields } from '@payloadcms/ui'
import { useEffect, useState } from 'react'

// Geeft de te tonen logo-URL terug voor de admin-editors: het geüploade bestand (relatie 'logo')
// óf, als dat er niet is, de handmatige 'logoUrl'-tekst. `external` is true wanneer het om de
// losse URL gaat — pixels uitlezen (kleuren afleiden) moet dan via de proxy om CORS-taint te
// vermijden.
export function useClubLogoUrl(): { url: string | null; external: boolean } {
  const logoValue = useFormFields(([fields]) => fields?.logo?.value)
  const logoUrlText = useFormFields(([fields]) => fields?.logoUrl?.value)
  const [uploadUrl, setUploadUrl] = useState<string | null>(null)

  useEffect(() => {
    const id =
      logoValue && typeof logoValue === 'object' && 'id' in logoValue
        ? (logoValue as { id: number }).id
        : logoValue
    if (id === null || id === undefined || id === '') {
      setUploadUrl(null)
      return
    }
    if (logoValue && typeof logoValue === 'object' && 'url' in logoValue && typeof (logoValue as { url?: string }).url === 'string') {
      setUploadUrl((logoValue as { url: string }).url)
      return
    }
    let cancelled = false
    fetch(`/api/media/${id}?depth=0`)
      .then((r) => (r.ok ? r.json() : null))
      .then((doc) => {
        if (!cancelled) setUploadUrl(doc && typeof doc.url === 'string' ? doc.url : null)
      })
      .catch(() => {
        if (!cancelled) setUploadUrl(null)
      })
    return () => {
      cancelled = true
    }
  }, [logoValue])

  const text = typeof logoUrlText === 'string' ? logoUrlText.trim() : ''
  if (uploadUrl) return { url: uploadUrl, external: false }
  if (text) return { url: text, external: true }
  return { url: null, external: false }
}
