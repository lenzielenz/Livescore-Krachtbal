// Gedeelde helper om een (vluchtige) supporterfoto te verkleinen en te uploaden naar de tribune.
// Client-side: gebruikt canvas/createImageBitmap. Hergebruikt door de foto-tribune én de multi-angle.

export async function resizeImage(file: File, max = 1100, quality = 0.8): Promise<Blob> {
  const img = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(img.width, img.height))
  const w = Math.max(1, Math.round(img.width * scale))
  const h = Math.max(1, Math.round(img.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Geen canvas')
  ctx.drawImage(img, 0, 0, w, h)
  return await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('resize'))), 'image/jpeg', quality))
}

export async function uploadInstant(matchId: number, file: File): Promise<boolean> {
  try {
    const blob = await resizeImage(file)
    const fd = new FormData()
    fd.append('photo', new File([blob], 'instant.jpg', { type: 'image/jpeg' }))
    const res = await fetch(`/api/match/${matchId}/instant`, { method: 'POST', body: fd })
    return res.ok
  } catch {
    return false
  }
}
