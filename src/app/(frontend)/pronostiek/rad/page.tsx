import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { isFederationLevel, userClubId } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { clubColorsFrom } from '@/lib/club-colors'
import { getPayloadClient } from '@/lib/payload-client'
import { activeTokens, RAD_SEGMENTS, SPINS_PER_WEEK, type RadToken } from '@/lib/pronostiek-rad'
import { loadRadState } from '@/lib/pronostiek-rad-server'
import { RadAdminBar } from './RadAdminBar'
import { Wheel } from './Wheel'
import './rad.css'
import '../../club/voorspel/voorspel.css'

export const dynamic = 'force-dynamic'

type Power = { tokens?: RadToken[]; spinWeek?: string; spinsUsed?: number }

const fmt = (v: number) => `×${Number.isInteger(v) ? v : String(v).replace('.', ',')}`
const MEDAL = ['🥇', '🥈', '🥉']
const medalFor = (rank: number) => MEDAL[rank - 1] ?? `#${rank}`

// Bonusrad (Las Vegas) — de besten van vorig weekend draaien elk tot 3 keer aan een rad met
// vermenigvuldigers. Het aantal winnaars schaalt met het deelnemersveld (~10%). Wat je draait, win
// je als boosters (4 weken geldig) die je zelf op je voorspellingen plakt. Het rad draagt je
// clublogo en de kleuren van de deelnemende clubs.
export default async function RadPage() {
  const payload = await getPayloadClient()
  const me = await getAuthUser()
  const myId = me ? Number((me as { id?: number }).id) : null
  const canTest = isFederationLevel(me)
  const state = await loadRadState(payload)

  const power = ((me as { pronostiekPower?: Power | null } | null)?.pronostiekPower ?? {}) as Power
  const heldTokens = activeTokens(power.tokens).map((t) => t.mult).sort((a, b) => b - a)
  const myRank = state.winners.find((w) => w.userId === myId)?.rank ?? null
  const eligible = canTest || myRank != null
  const usedThisWeek = power.spinWeek === state.weekendStartIso ? Number(power.spinsUsed) || 0 : 0
  const spinsLeft = canTest ? 99 : eligible ? Math.max(0, SPINS_PER_WEEK - usedThisWeek) : 0

  // Clublogo + clubkleuren: het rad voelt helemaal als jóuw club.
  const cid = userClubId(me)
  const clubId = cid != null && Number.isFinite(Number(cid)) ? Number(cid) : null
  let clubLogoUrl: string | null = null
  let clubName = 'je club'
  let clubColors: { primary: string; secondary: string } | null = null
  if (clubId) {
    const c = await payload.findByID({ collection: 'clubs', id: clubId, depth: 0 }).catch(() => null)
    if (c) {
      clubLogoUrl = (c as { logoUrl?: string | null }).logoUrl || null
      clubName = (c as { name?: string }).name || 'je club'
      clubColors = clubColorsFrom((c as { colorPrimary?: unknown }).colorPrimary, (c as { colorSecondary?: unknown }).colorSecondary)
    }
  }

  return (
    <>
      <SiteHeader active="stand" />
      <div className="site rad-page">
        <h1 className="page-title rad-title">🎰 <span className="brand">Bonusrad</span></h1>
        <p className="rad-hook">Draai voor <strong>vermenigvuldigers</strong> op je voorspellingen — jij kiest de wedstrijd.</p>
        <details className="rad-info">
          <summary>Hoe werkt dit? ⓘ</summary>
          <p>
            De <strong>beste {state.winners.length || ''} deelnemers</strong> van vorig weekend draaien <strong>3×</strong> aan het rad
            {state.participants > 0 && <> (van de {state.participants} die meededen)</>}. Boosters zijn <strong>4 weken</strong> geldig.{' '}
            <Link href="/pronostiek" style={{ color: '#ffd166' }}>Naar de stand</Link>.
          </p>
        </details>

        {canTest && (
          <div className="rad-admin-row">
            <span className="rad-test-badge" title="Jij mag onbeperkt draaien om te testen.">🧪 Testmodus</span>
            <RadAdminBar />
          </div>
        )}

        {state.winners.length > 0 && (
          <div className="rad-podium">
            {state.winners.map((w) => (
              <span key={w.userId} className={`rad-pod${w.userId === myId ? ' me' : ''}`}>
                <span className="rad-pod-m">{medalFor(w.rank)}</span>
                <span className="rad-pod-n">{w.name}{w.userId === myId ? ' (jij)' : ''}</span>
              </span>
            ))}
          </div>
        )}

        {eligible && spinsLeft > 0 ? (
          <Wheel segments={[...RAD_SEGMENTS]} clubColors={clubColors} clubLogoUrl={clubLogoUrl} clubName={clubName} spinsLeft={spinsLeft} heldTokens={heldTokens} />
        ) : heldTokens.length > 0 ? (
          <div className="rad-card">
            <h2>🎟️ Je boosters staan klaar</h2>
            <p>Gebruik ze bij het voorspellen op een livewedstrijd — jij kiest welke booster op welke wedstrijd. <Link href="/" style={{ color: '#ffd166' }}>Voorspel mee →</Link></p>
            <div className="rad-tokens" style={{ marginTop: 12 }}>
              {heldTokens.map((m, i) => (
                <span key={i} className={`rad-token${m >= 5 ? ' big' : ''}`}>{fmt(m)}</span>
              ))}
            </div>
          </div>
        ) : eligible ? (
          <div className="rad-card">
            <h2>Je beurten zijn op</h2>
            <p>Je draaide deze week 3× en gebruikte je boosters. Eindig opnieuw bij de besten om volgende week weer te mogen draaien.</p>
          </div>
        ) : (
          <div className="rad-card">
            <h2>Speel mee voor het rad</h2>
            <p>Enkel de <strong>besten</strong> van het weekend mogen aan het rad draaien (hoe meer deelnemers, hoe meer winnaars). Voorspel mee en knok je naar de top! <Link href="/" style={{ color: '#ffd166' }}>Voorspel mee →</Link></p>
          </div>
        )}
      </div>
    </>
  )
}
