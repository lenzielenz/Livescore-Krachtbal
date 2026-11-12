'use client'

import { useSearchParams } from 'next/navigation'

import { clearNavAuth } from '@/lib/nav-auth-cache'

type Dienst = 'google' | 'microsoft' | 'apple'

const FOUTEN: Record<string, string> = {
  dienst: 'Die manier van inloggen staat (nog) niet aan.',
  'te-snel': 'Te veel pogingen. Probeer het zo dadelijk opnieuw.',
}

// De merktekens zoals de diensten ze voorschrijven voor een aanmeldknop.
function Logo({ d }: { d: Dienst }) {
  if (d === 'google')
    return (
      <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden>
        <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
        <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
        <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
        <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
      </svg>
    )
  if (d === 'microsoft')
    return (
      <svg viewBox="0 0 21 21" width="18" height="18" aria-hidden>
        <rect x="1" y="1" width="9" height="9" fill="#f25022" />
        <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
        <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
        <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
      </svg>
    )
  return (
    <svg viewBox="0 0 384 512" width="16" height="18" aria-hidden fill="currentColor">
      <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
    </svg>
  )
}

const LABEL: Record<Dienst, string> = { google: 'Doorgaan met Google', microsoft: 'Doorgaan met Microsoft', apple: 'Doorgaan met Apple' }

/** "Doorgaan met …" — enkel de diensten die de site ingesteld heeft (lib/oauth.ts). */
export function OAuthKnoppen({ diensten }: { diensten: Dienst[] }) {
  const sp = useSearchParams()
  const next = sp.get('next')
  const fout = sp.get('fout')
  const q = next && next.startsWith('/') && !next.startsWith('//') ? `?next=${encodeURIComponent(next)}` : ''
  return (
    <>
      {fout && (
        <p className="login-error" role="alert">
          {FOUTEN[fout] ?? fout}
        </p>
      )}
      {diensten.length > 0 && (
        <>
          <div className="login-oauth">
            {diensten.map((d) => (
              <a key={d} href={`/api/auth/oauth/${d}${q}`} className={`login-oauth-btn login-oauth-${d}`} onClick={() => clearNavAuth()}>
                <Logo d={d} />
                <span>{LABEL[d]}</span>
              </a>
            ))}
          </div>
          <div className="login-of" aria-hidden>
            <span>of met je e-mailadres</span>
          </div>
        </>
      )}
    </>
  )
}
