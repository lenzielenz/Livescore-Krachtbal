// Payload's Next-integratie importeert CSS als side-effect (`import '@payloadcms/next/css'`).
// tsc kent geen typedeclaratie voor dat CSS-subpath; deze ambient declaratie lost TS2882 op.
declare module '@payloadcms/next/css'

// 'qrcode' levert geen eigen TypeScript-types mee; we gebruiken enkel toDataURL (client-side).
declare module 'qrcode' {
  export function toDataURL(text: string, options?: Record<string, unknown>): Promise<string>
}
