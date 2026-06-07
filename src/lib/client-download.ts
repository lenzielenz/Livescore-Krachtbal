// Client-side helpers om beelden te bewaren/delen — zodat analyse-kaarten gedownload kunnen worden
// i.p.v. een screenshot te nemen. Werkt mobiel via het deelvenster (Web Share met bestand) en valt
// terug op een gewone download.

type ShareNavigator = Navigator & {
  canShare?: (data?: { files?: File[] }) => boolean
  share?: (data: { files?: File[]; title?: string; text?: string }) => Promise<void>
}

/** Bewaar/deel een blob als bestand. Gebruikt het toestel-deelvenster waar mogelijk (mobiel:
 * opslaan in Galerij/Bestanden of delen), anders een gewone download. */
export async function saveOrShareBlob(blob: Blob, filename: string, shareText?: string): Promise<void> {
  const nav = navigator as ShareNavigator
  const file = new File([blob], filename, { type: blob.type })
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: 'Krachtbal', text: shareText })
      return
    } catch (err) {
      if ((err as Error).name === 'AbortError') return // gebruiker annuleerde
      // anders: terugvallen op download
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  // URL pas later vrijgeven: meteen revoken brak de download soms af nog vóór hij begon.
  setTimeout(() => {
    a.remove()
    URL.revokeObjectURL(url)
  }, 4000)
}

/** Rendert een live <svg> naar een PNG-blob (op schaal, met achtergrond). Geen externe afbeeldingen
 * in de SVG → geen "tainted canvas", dus dit werkt ook op gsm. */
export async function svgToPngBlob(
  svg: SVGSVGElement,
  opts?: { scale?: number; background?: string },
): Promise<Blob> {
  const scale = opts?.scale ?? 2.5
  const vb = svg.viewBox?.baseVal
  const rect = svg.getBoundingClientRect()
  const w = (vb && vb.width) || rect.width || 184
  const h = (vb && vb.height) || rect.height || 460

  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('width', String(w))
  clone.setAttribute('height', String(h))
  const data = new XMLSerializer().serializeToString(clone)
  const svgUrl = URL.createObjectURL(new Blob([data], { type: 'image/svg+xml;charset=utf-8' }))

  try {
    const img = new Image()
    img.decoding = 'async'
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('SVG kon niet geladen worden'))
      img.src = svgUrl
    })
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(w * scale)
    canvas.height = Math.round(h * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Geen canvas-context')
    if (opts?.background) {
      ctx.fillStyle = opts.background
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG-export mislukt'))), 'image/png'),
    )
  } finally {
    URL.revokeObjectURL(svgUrl)
  }
}

/** Slugify voor bestandsnamen. */
export function slugFilename(...parts: (string | null | undefined)[]): string {
  return parts
    .filter((p): p is string => Boolean(p))
    .map((s) => s.normalize('NFKD').replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase())
    .filter(Boolean)
    .join('-')
}
