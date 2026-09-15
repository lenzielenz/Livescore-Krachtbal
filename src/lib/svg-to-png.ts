// Zet een SVG-string om naar een PNG-Blob, volledig in de browser (canvas). Bestaat om
// server-side rasterisatie (sharp/librsvg) te vermijden voor SVG's met <text>: die hebben
// fontconfig nodig, en op een container zonder geldige fontconfig-config crasht dat niet als
// een gewone JS-fout maar als een native crash die het hele Node-proces meesleurt (zie de
// productie-storing van 15/09 — /api/match/[id]/winfie deed exact dit). De browser rendert
// SVG-tekst met zijn eigen fontstack, dus dit risico bestaat hier niet.
export async function svgToPngBlob(svgText: string, width: number, height: number): Promise<Blob> {
  const svgBlob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(svgBlob)
  try {
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('De afbeelding kon niet worden opgebouwd.'))
      img.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas wordt niet ondersteund op dit toestel.')
    ctx.drawImage(img, 0, 0, width, height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) throw new Error('De afbeelding kon niet worden opgebouwd.')
    return blob
  } finally {
    URL.revokeObjectURL(url)
  }
}
