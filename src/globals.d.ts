// Payload's Next-integratie importeert CSS als side-effect (`import '@payloadcms/next/css'`).
// tsc kent geen typedeclaratie voor dat CSS-subpath; deze ambient declaratie lost TS2882 op.
declare module '@payloadcms/next/css'

// 'qrcode' levert geen eigen TypeScript-types mee; toDataURL (client-side) en toBuffer (PNG op de
// server, bv. de medische kaart).
declare module 'qrcode' {
  export function toDataURL(text: string, options?: Record<string, unknown>): Promise<string>
  export function toBuffer(text: string, options?: Record<string, unknown>): Promise<Buffer>
}

// De native BarcodeDetector-API (Chrome/Android) — gebruikt om de QR van de scheidsrechter te
// scannen met de camera. Niet overal beschikbaar; we feature-detecten op `'BarcodeDetector' in window`.
interface DetectedBarcode {
  rawValue: string
  format: string
}
declare class BarcodeDetector {
  constructor(options?: { formats?: string[] })
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>
  static getSupportedFormats(): Promise<string[]>
}
interface Window {
  BarcodeDetector?: typeof BarcodeDetector
}
