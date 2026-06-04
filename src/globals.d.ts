// Payload's Next-integratie importeert CSS als side-effect (`import '@payloadcms/next/css'`).
// tsc kent geen typedeclaratie voor dat CSS-subpath; deze ambient declaratie lost TS2882 op.
declare module '@payloadcms/next/css'

// 'qrcode' levert geen eigen TypeScript-types mee; we gebruiken enkel toDataURL (client-side).
declare module 'qrcode' {
  export function toDataURL(text: string, options?: Record<string, unknown>): Promise<string>
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
