// Payload's Next-integratie importeert CSS als side-effect (`import '@payloadcms/next/css'`).
// tsc kent geen typedeclaratie voor dat CSS-subpath; deze ambient declaratie lost TS2882 op.
declare module '@payloadcms/next/css'
