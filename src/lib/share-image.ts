// Gedeelde helpers voor deelkaarten: een logo/afbeelding als data-URL inladen zodat de SVG→PNG-
// export niet "tainted" raakt (anders mislukt de export op gsm). Externe logo's zonder CORS gaan
// via onze eigen same-origin proxy. Gebruikt door de match-, speler- en ploeg-deelkaarten.

export function blobToDataUrl(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const r = new FileReader()
    r.onload = () => resolve(typeof r.result === 'string' ? r.result : null)
    r.onerror = () => resolve(null)
    r.readAsDataURL(blob)
  })
}

async function tryFetchDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    if (blob.type && !blob.type.startsWith('image/')) return null
    return await blobToDataUrl(blob)
  } catch {
    return null
  }
}

/** Een (mogelijk externe) afbeeldings-URL als data-URL — taint-vrij voor de canvas-export. */
export async function urlToDataUrl(url: string): Promise<string | null> {
  // 1) Rechtstreeks (werkt voor eigen/CORS-vriendelijke logo's).
  const direct = await tryFetchDataUrl(url)
  if (direct) return direct
  // 2) Extern logo zonder CORS → via onze eigen proxy (zelfde origin, geen taint).
  try {
    const abs = new URL(url, window.location.origin).href
    return await tryFetchDataUrl(`/api/logo-proxy?url=${encodeURIComponent(abs)}`)
  } catch {
    return null
  }
}
