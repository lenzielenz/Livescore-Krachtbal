import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT, type JWTPayload } from 'jose'

// Inloggen met Google, Microsoft en Apple (OpenID Connect, authorization code flow).
//
// Elke dienst staat enkel aan als zijn sleutels in de omgeving staan (.env.example):
//   Google     GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
//   Microsoft  MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET (MICROSOFT_TENANT, standaard "common")
//   Apple      APPLE_CLIENT_ID (de Services ID), APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY (.p8-inhoud)
// Terugkeer-URL bij elke dienst: {PUBLIC_SERVER_URL}/api/auth/oauth/{dienst}/callback
//
// Veiligheid: `state` tegen CSRF, `nonce` tegen het hergebruiken van een id-token, PKCE (Google,
// Microsoft) tegen een onderschepte code. Het id-token wordt gecontroleerd met de publieke sleutels van
// de dienst (handtekening, uitgever, publiek, vervaldatum). Een e-mailadres telt enkel als de dienst het
// als geverifieerd meldt — anders kon iemand met een zelfgekozen adres andermans account overnemen.

export type Dienst = 'google' | 'microsoft' | 'apple'
export const DIENSTEN: readonly Dienst[] = ['google', 'microsoft', 'apple']
export const DIENST_LABEL: Record<Dienst, string> = { google: 'Google', microsoft: 'Microsoft', apple: 'Apple' }

/** Het tenant-id van persoonlijke Microsoft-accounts (outlook.com, hotmail.com, live.com). */
const MS_CONSUMENTEN = '9188040d-6c67-4c5b-b112-36a304b66dad'

const env = (k: string) => (process.env[k] ?? '').trim()

export function dienstActief(d: Dienst): boolean {
  if (d === 'google') return Boolean(env('GOOGLE_CLIENT_ID') && env('GOOGLE_CLIENT_SECRET'))
  if (d === 'microsoft') return Boolean(env('MICROSOFT_CLIENT_ID') && env('MICROSOFT_CLIENT_SECRET'))
  return Boolean(env('APPLE_CLIENT_ID') && env('APPLE_TEAM_ID') && env('APPLE_KEY_ID') && env('APPLE_PRIVATE_KEY'))
}

export const actieveDiensten = (): Dienst[] => DIENSTEN.filter(dienstActief)

export const isDienst = (v: unknown): v is Dienst => (DIENSTEN as readonly unknown[]).includes(v)

type Config = {
  authorize: string
  token: string
  jwks: string
  /** Klopt de uitgever (iss) van het id-token? */
  uitgever: (iss: string, claims: JWTPayload) => boolean
  clientId: () => string
  scope: string
  pkce: boolean
  /** Apple stuurt het antwoord als POST-formulier terug. */
  formPost: boolean
}

const msTenant = () => env('MICROSOFT_TENANT') || 'common'

const CONFIG: Record<Dienst, Config> = {
  google: {
    authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    jwks: 'https://www.googleapis.com/oauth2/v3/certs',
    uitgever: (iss) => iss === 'https://accounts.google.com' || iss === 'accounts.google.com',
    clientId: () => env('GOOGLE_CLIENT_ID'),
    scope: 'openid email profile',
    pkce: true,
    formPost: false,
  },
  microsoft: {
    authorize: `https://login.microsoftonline.com/${msTenant()}/oauth2/v2.0/authorize`,
    token: `https://login.microsoftonline.com/${msTenant()}/oauth2/v2.0/token`,
    jwks: 'https://login.microsoftonline.com/common/discovery/v2.0/keys',
    // De uitgever bevat het tenant-id van het account zelf.
    uitgever: (iss, c) => typeof c.tid === 'string' && iss === `https://login.microsoftonline.com/${c.tid}/v2.0`,
    clientId: () => env('MICROSOFT_CLIENT_ID'),
    scope: 'openid email profile',
    pkce: true,
    formPost: false,
  },
  apple: {
    authorize: 'https://appleid.apple.com/auth/authorize',
    token: 'https://appleid.apple.com/auth/token',
    jwks: 'https://appleid.apple.com/auth/keys',
    uitgever: (iss) => iss === 'https://appleid.apple.com',
    clientId: () => env('APPLE_CLIENT_ID'),
    scope: 'name email',
    pkce: false,
    formPost: true,
  },
}

export const gebruiktFormPost = (d: Dienst) => CONFIG[d].formPost

const b64url = (buf: ArrayBuffer | Uint8Array) => Buffer.from(buf instanceof Uint8Array ? buf : new Uint8Array(buf)).toString('base64url')
export const willekeurig = (bytes = 32) => b64url(crypto.getRandomValues(new Uint8Array(bytes)))
async function pkceChallenge(verifier: string) {
  return b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))
}

/** De publieke basis-URL van de site (achter de Railway-proxy is req.url intern). */
export function basisUrl(req: Request): string {
  const ingesteld = env('PUBLIC_SERVER_URL') || env('NEXT_PUBLIC_SERVER_URL')
  if (ingesteld) return ingesteld.replace(/\/+$/, '')
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
  const proto = req.headers.get('x-forwarded-proto') ?? new URL(req.url).protocol.replace(':', '')
  return host ? `${proto}://${host}` : new URL(req.url).origin
}
export const terugkeerUrl = (req: Request, d: Dienst) => `${basisUrl(req)}/api/auth/oauth/${d}/callback`

/** Enkel een pad binnen de site (geen open redirect naar een andere site). */
export const veiligPad = (v: unknown) => {
  const s = typeof v === 'string' ? v : ''
  return s.startsWith('/') && !s.startsWith('//') && !s.startsWith('/\\') ? s.slice(0, 500) : '/'
}

export type Poging = { dienst: Dienst; state: string; nonce: string; verifier: string; next: string }

/** Stap 1: de URL waar de gebruiker naartoe gaat, en wat we moeten onthouden (in een cookie). */
export async function startPoging(req: Request, d: Dienst, next: unknown): Promise<{ url: string; poging: Poging }> {
  const c = CONFIG[d]
  const poging: Poging = { dienst: d, state: willekeurig(), nonce: willekeurig(), verifier: willekeurig(48), next: veiligPad(next) }
  const q = new URLSearchParams({
    client_id: c.clientId(),
    redirect_uri: terugkeerUrl(req, d),
    response_type: 'code',
    scope: c.scope,
    state: poging.state,
    nonce: poging.nonce,
  })
  if (c.pkce) {
    q.set('code_challenge', await pkceChallenge(poging.verifier))
    q.set('code_challenge_method', 'S256')
  }
  if (c.formPost) q.set('response_mode', 'form_post')
  if (d === 'google' || d === 'microsoft') q.set('prompt', 'select_account')
  return { url: `${c.authorize}?${q.toString()}`, poging }
}

/** Het client secret van Apple is zelf een kortlevend JWT, ondertekend met de .p8-sleutel. */
async function appleClientSecret(): Promise<string> {
  const pem = env('APPLE_PRIVATE_KEY').replace(/\\n/g, '\n')
  const sleutel = await importPKCS8(pem, 'ES256')
  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: env('APPLE_KEY_ID') })
    .setIssuer(env('APPLE_TEAM_ID'))
    .setSubject(env('APPLE_CLIENT_ID'))
    .setAudience('https://appleid.apple.com')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(sleutel)
}

const geheim = async (d: Dienst) =>
  d === 'google' ? env('GOOGLE_CLIENT_SECRET') : d === 'microsoft' ? env('MICROSOFT_CLIENT_SECRET') : appleClientSecret()

const jwks = new Map<Dienst, ReturnType<typeof createRemoteJWKSet>>()

export type Identiteit = { dienst: Dienst; sub: string; email: string | null; emailGeverifieerd: boolean; naam: string | null }

/** Puur: wat zegt het (gecontroleerde) id-token over de persoon? */
export function identiteitUit(d: Dienst, c: JWTPayload & Record<string, unknown>): Identiteit {
  const email = typeof c.email === 'string' ? c.email.trim().toLowerCase() : null
  const waar = (v: unknown) => v === true || v === 'true'
  const geverifieerd =
    d === 'google'
      ? waar(c.email_verified)
      : d === 'apple'
        ? waar(c.email_verified)
        : // Microsoft: een persoonlijk account heeft een geverifieerd adres; een werk- of schoolaccount
          // enkel als de tenant het domein bezit (xms_edov). Zonder dat bewijs geen koppeling op e-mail.
          c.tid === MS_CONSUMENTEN || waar(c.xms_edov)
  const naam = typeof c.name === 'string' && c.name.trim() ? c.name.trim() : null
  return { dienst: d, sub: String(c.sub ?? ''), email, emailGeverifieerd: Boolean(email) && geverifieerd, naam }
}

/** Stap 2: de code inruilen en het id-token controleren. */
export async function afronden(req: Request, poging: Poging, code: string): Promise<Identiteit> {
  const d = poging.dienst
  const c = CONFIG[d]
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: terugkeerUrl(req, d),
    client_id: c.clientId(),
    client_secret: await geheim(d),
  })
  if (c.pkce) body.set('code_verifier', poging.verifier)
  const res = await fetch(c.token, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body })
  const json = (await res.json().catch(() => ({}))) as { id_token?: string; error?: string; error_description?: string }
  if (!res.ok || !json.id_token) throw new Error(`De aanmelding bij ${DIENST_LABEL[d]} lukte niet${json.error ? ` (${json.error})` : ''}.`)
  if (!jwks.has(d)) jwks.set(d, createRemoteJWKSet(new URL(c.jwks)))
  const { payload: claims } = await jwtVerify(json.id_token, jwks.get(d)!, { audience: c.clientId(), clockTolerance: 60 })
  if (!c.uitgever(String(claims.iss ?? ''), claims)) throw new Error('Onverwachte uitgever van het token.')
  if (claims.nonce !== undefined && claims.nonce !== poging.nonce) throw new Error('Het token hoort niet bij deze aanmelding.')
  if (d !== 'apple' && claims.nonce === undefined) throw new Error('Het token hoort niet bij deze aanmelding.')
  return identiteitUit(d, claims as JWTPayload & Record<string, unknown>)
}
