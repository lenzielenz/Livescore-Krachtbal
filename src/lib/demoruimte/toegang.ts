import { createHash } from 'node:crypto'

import { isDemoOmgeving } from '../omgeving'

// Toegang tot de demoruimte. De demo-omgeving is een aparte, publieke URL; met DEMO_TOEGANGSCODE
// gezet, vraagt de demoruimte eerst die code (één keer per toestel, bewaard in een cookie). Zo kan
// een toevallige bezoeker niet midden in je presentatie alles opnieuw klaarzetten.

export const TOEGANG_COOKIE = 'demo-toegang'

const code = () => (process.env.DEMO_TOEGANGSCODE ?? '').trim()
export const codeNodig = () => code().length > 0
export const codeHash = (c: string) => createHash('sha256').update(`krachtbal-demo:${c.trim()}`).digest('hex').slice(0, 32)

/** Mag dit verzoek de demoruimte gebruiken? (enkel in de demo-omgeving, met de code als die gezet is) */
export function demoToegang(cookieWaarde: string | undefined | null): boolean {
  if (!isDemoOmgeving()) return false
  if (!codeNodig()) return true
  return cookieWaarde === codeHash(code())
}

export function cookieUitVerzoek(req: Request, naam: string): string | null {
  const c = req.headers.get('cookie') ?? ''
  for (const deel of c.split(';')) {
    const [k, ...v] = deel.trim().split('=')
    if (k === naam) return decodeURIComponent(v.join('='))
  }
  return null
}

export const cookieRegel = (naam: string, waarde: string, maxAge: number) =>
  `${naam}=${encodeURIComponent(waarde)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`
