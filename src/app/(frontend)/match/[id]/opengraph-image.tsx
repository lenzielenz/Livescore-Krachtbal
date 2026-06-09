import { ImageResponse } from 'next/og'
import { headers } from 'next/headers'

import { readableOnDark, DEFAULT_AWAY_COLOR, DEFAULT_HOME_COLOR } from '@/lib/club-colors'
import { buildMatchState } from '@/lib/match-engine'
import { getPayloadClient } from '@/lib/payload-client'
import { reeksNaam } from '@/lib/reeksen'

// Auto-gegenereerde social-preview voor een wedstrijd: wie de matchlink in WhatsApp/Insta plakt,
// krijgt meteen een verzorgde deelkaart (score, logo's, reeks) i.p.v. een grijze placeholder.
// De link máákt zo zélf de deelkaart — geen screenshot nodig.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const alt = 'Krachtbal Live — wedstrijd'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const initials = (name: string) =>
  name.replace(/[^a-zA-Z0-9 ]/g, '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?'

const shortName = (name: string, max = 16) => {
  const n = name.trim()
  return n.length > max ? n.slice(0, max - 1).trimEnd() + '…' : n
}

// Logo als data-URI inladen (server-side), met origin uit de request voor relatieve paden.
// Mislukt het inladen, dan valt de kaart terug op de initialen in een gekleurde cirkel.
async function logoDataUri(url: string | null, origin: string): Promise<string | null> {
  if (!url) return null
  try {
    const abs = url.startsWith('http') ? url : `${origin}${url.startsWith('/') ? '' : '/'}${url}`
    const res = await fetch(abs)
    if (!res.ok) return null
    const type = res.headers.get('content-type') ?? 'image/png'
    if (!type.startsWith('image/') || type.includes('svg')) return null // Satori rendert geen SVG-<img>
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.byteLength > 1_500_000) return null
    return `data:${type};base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const matchId = Number(id)

  const h = await headers()
  const host = h.get('host') ?? 'krachtbal.live'
  const proto = h.get('x-forwarded-proto') ?? (host.includes('localhost') ? 'http' : 'https')
  const origin = `${proto}://${host}`

  const payload = await getPayloadClient()
  const [state, matchDoc] = await Promise.all([
    buildMatchState(payload, matchId).catch(() => null),
    payload.findByID({ collection: 'matches', id: matchId, depth: 0 }).catch(() => null),
  ])

  // Geen wedstrijd gevonden, of een privé analysewedstrijd → een nette merk-kaart i.p.v. lekken.
  if (!state || matchDoc?.analyseOnly) {
    return new ImageResponse(
      (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#07120c', color: '#f1f5f2', fontSize: 64, fontWeight: 800, letterSpacing: 4 }}>
          <span>KRACHTBAL</span>
          <span style={{ color: '#c9a44c', marginLeft: 16 }}>LIVE</span>
        </div>
      ),
      size,
    )
  }

  const reeks = matchDoc?.reeks ? reeksNaam(matchDoc.reeks) : 'Krachtbal'
  const datum = matchDoc?.date
    ? new Date(matchDoc.date as string).toLocaleDateString('nl-BE', { weekday: 'long', day: '2-digit', month: 'long' })
    : null

  const homeColor = readableOnDark(state.teams.home.colors?.primary ?? DEFAULT_HOME_COLOR)
  const awayColor = readableOnDark(state.teams.away.colors?.primary ?? DEFAULT_AWAY_COLOR)
  const [homeLogo, awayLogo] = await Promise.all([
    logoDataUri(state.teams.home.logoUrl, origin),
    logoDataUri(state.teams.away.logoUrl, origin),
  ])

  const status = state.match.status
  const played = status !== 'scheduled'
  const winner = played ? (state.score.home > state.score.away ? 'home' : state.score.away > state.score.home ? 'away' : 'draw') : null
  const statusLabel = status === 'live' ? 'LIVE' : status === 'finished' ? 'EINDSTAND' : (datum ?? 'Geplande wedstrijd')

  const Club = ({ side }: { side: 'home' | 'away' }) => {
    const team = state.teams[side]
    const color = side === 'home' ? homeColor : awayColor
    const logo = side === 'home' ? homeLogo : awayLogo
    const dim = winner && winner !== 'draw' && winner !== side
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 360 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 200, height: 200, borderRadius: 200, background: '#0a1610', border: `5px solid ${color}`, opacity: dim ? 0.62 : 1 }}>
          {logo ? (
            <img src={logo} width={170} height={170} alt="" style={{ borderRadius: 170, objectFit: 'contain' }} />
          ) : (
            <div style={{ display: 'flex', fontSize: 96, fontWeight: 800, color }}>{initials(team.name)}</div>
          )}
        </div>
        <div style={{ display: 'flex', marginTop: 26, fontSize: 40, fontWeight: 700, color: '#f1f5f2', textAlign: 'center' }}>
          {shortName(team.name)}
        </div>
      </div>
    )
  }

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'linear-gradient(160deg, #0c1a12 0%, #071009 60%, #050d09 100%)', color: '#f1f5f2', fontFamily: 'sans-serif', position: 'relative' }}>
        {/* Clubkleur-zwemen boven en onder */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 14, background: homeColor }} />
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 14, background: awayColor }} />

        {/* Kop */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '46px 64px 0' }}>
          <div style={{ display: 'flex', fontSize: 34, fontWeight: 800, letterSpacing: 5 }}>
            <span>KRACHTBAL</span>
            <span style={{ color: '#c9a44c', marginLeft: 12 }}>LIVE</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 26, fontWeight: 700, letterSpacing: 2, color: status === 'live' ? '#ff5a5f' : '#8a9c93' }}>
            {status === 'live' && <div style={{ display: 'flex', width: 16, height: 16, borderRadius: 16, background: '#ff5a5f' }} />}
            <span>{statusLabel}</span>
          </div>
        </div>

        {/* Midden: club — score — club */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24, padding: '0 56px' }}>
          <Club side="home" />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 280 }}>
            {played ? (
              <div style={{ display: 'flex', alignItems: 'center', fontSize: 150, fontWeight: 800, letterSpacing: -4 }}>
                <span style={{ color: winner === 'away' ? '#8a9c93' : '#f1f5f2' }}>{state.score.home}</span>
                <span style={{ color: '#8a9c93', margin: '0 18px', fontSize: 96, fontWeight: 300 }}>–</span>
                <span style={{ color: winner === 'home' ? '#8a9c93' : '#f1f5f2' }}>{state.score.away}</span>
              </div>
            ) : (
              <div style={{ display: 'flex', fontSize: 96, fontWeight: 800, color: '#8a9c93', letterSpacing: 4 }}>VS</div>
            )}
            {winner && winner !== 'draw' && (
              <div style={{ display: 'flex', marginTop: 14, width: 76, height: 6, background: '#c9a44c', borderRadius: 6 }} />
            )}
          </div>
          <Club side="away" />
        </div>

        {/* Voet: reeks */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: 44, fontSize: 28, fontWeight: 700, letterSpacing: 3, color: '#8a9c93', textTransform: 'uppercase' }}>
          {reeks}
        </div>
      </div>
    ),
    size,
  )
}
