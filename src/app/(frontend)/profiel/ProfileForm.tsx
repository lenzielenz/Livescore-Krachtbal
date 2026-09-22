'use client'

import { useState } from 'react'

import { clearNavAuth } from '@/lib/nav-auth-cache'
import { SELECTABLE_POSITIONS } from '@/lib/positions'
import { AvatarEditor } from './AvatarEditor'

export type ProfileInitial = {
  email: string
  name: string
  clubId: string
  followedClubIds: number[]
  teamId: string
  position: string
  photoUrl: string | null
  zoom: number
  offsetX: number
  offsetY: number
}

const labelStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, fontSize: '0.8rem', color: 'var(--dim)' }

export function ProfileForm({
  initial,
  clubs,
  teams,
}: {
  initial: ProfileInitial
  clubs: { id: number; name: string }[]
  /** Ploegen van alle clubs — de select toont enkel die van de gekozen club (zie teamOptions). */
  teams: { id: number; name: string; clubId: number }[]
}) {
  // Account-gegevens
  const [name, setName] = useState(initial.name)
  const [clubId, setClubId] = useState(initial.clubId)
  // Gevolgde clubs: enkel relevant zonder eigen club (zie RegisterForm — zelfde idee, hier voor wie
  // zich al registreerde en dit nadien wil instellen of aanpassen).
  const [followedClubIds, setFollowedClubIds] = useState<number[]>(initial.followedClubIds)
  const toggleFollowed = (id: number) => {
    setFollowedClubIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))
  }
  // Mijn ploeg: enkel zinvol binnen de gekozen club — highlight haar wedstrijden op het live-bord
  // (zie LiveBoard.tsx). Een wissel van club maakt een niet meer bijhorende ploegkeuze leeg i.p.v.
  // hem onzichtbaar bewaard te laten staan.
  const [teamId, setTeamId] = useState(initial.teamId)
  const teamOptions = teams.filter((t) => String(t.clubId) === clubId)
  const onClubChange = (next: string) => {
    setClubId(next)
    if (!teams.some((t) => String(t.id) === teamId && String(t.clubId) === next)) setTeamId('')
  }
  const [position, setPosition] = useState(initial.position)
  const [photoUrl, setPhotoUrl] = useState(initial.photoUrl)
  const [zoom, setZoom] = useState(initial.zoom)
  const [offsetX, setOffsetX] = useState(initial.offsetX)
  const [offsetY, setOffsetY] = useState(initial.offsetY)
  const [savingAccount, setSavingAccount] = useState(false)
  const [accountMsg, setAccountMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // Wachtwoord
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [savingPw, setSavingPw] = useState(false)
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const saveAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingAccount(true)
    setAccountMsg(null)
    try {
      const res = await fetch('/api/profile/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name,
          clubId: clubId || null,
          followedClubIds: clubId ? [] : followedClubIds,
          teamId: teamId || null,
          position: position || null,
          photoZoom: zoom,
          photoOffsetX: offsetX,
          photoOffsetY: offsetY,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setAccountMsg({ ok: false, text: data.error ?? 'Opslaan mislukt.' })
        return
      }
      clearNavAuth() // naam/club kan de navigatie beïnvloeden
      setAccountMsg({ ok: true, text: 'Profiel opgeslagen ✓' })
    } catch {
      setAccountMsg({ ok: false, text: 'Er ging iets mis — probeer opnieuw.' })
    } finally {
      setSavingAccount(false)
    }
  }

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingPw(true)
    setPwMsg(null)
    try {
      const res = await fetch('/api/profile/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setPwMsg({ ok: false, text: data.error ?? 'Wijzigen mislukt.' })
        return
      }
      setCurrentPassword('')
      setNewPassword('')
      setPwMsg({ ok: true, text: 'Wachtwoord gewijzigd ✓' })
    } catch {
      setPwMsg({ ok: false, text: 'Er ging iets mis — probeer opnieuw.' })
    } finally {
      setSavingPw(false)
    }
  }

  return (
    <div className="pf-grid">
      <form className="wb-card pf-card" onSubmit={saveAccount}>
        <h2>Mijn gegevens</h2>
        <AvatarEditor
          url={photoUrl}
          zoom={zoom}
          offsetX={offsetX}
          offsetY={offsetY}
          setZoom={setZoom}
          setOffsetX={setOffsetX}
          setOffsetY={setOffsetY}
          onUploaded={setPhotoUrl}
        />

        <label style={labelStyle}>
          Naam
          <input className="wb-input" type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
        </label>

        <label style={labelStyle}>
          E-mail
          <input className="wb-input" type="email" value={initial.email} disabled />
          <span className="pf-hint">Je e-mail (login) kan je niet zelf wijzigen — vraag dit aan een beheerder.</span>
        </label>

        <label style={labelStyle}>
          Mijn club
          <select className="wb-input" value={clubId} onChange={(e) => onClubChange(e.target.value)}>
            <option value="">— Geen / kies later —</option>
            {clubs.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>

        {clubId && (
          <label style={labelStyle}>
            Mijn ploeg
            <select className="wb-input" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              <option value="">— Geen / kies later —</option>
              {teamOptions.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <span className="pf-hint">Haar wedstrijden krijgen een lichte highlight op het live-bord.</span>
          </label>
        )}

        {!clubId && (
          <div className="rf-follow">
            <p className="rf-follow-lbl">Geen eigen club? Volg gerust club(s) — dan zie je die overal als je ingelogd bent.</p>
            <div className="rf-follow-list">
              {clubs.map((c) => (
                <label key={c.id} className="rf-follow-item">
                  <input type="checkbox" checked={followedClubIds.includes(c.id)} onChange={() => toggleFollowed(c.id)} />
                  {c.name}
                </label>
              ))}
            </div>
          </div>
        )}

        <label style={labelStyle}>
          Positie in het spel
          <select className="wb-input" value={position} onChange={(e) => setPosition(e.target.value)}>
            <option value="">— Geen voorkeur —</option>
            {SELECTABLE_POSITIONS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </label>

        <button type="submit" disabled={savingAccount} className="wb-btn wb-btn-primary">
          {savingAccount ? 'Opslaan…' : 'Profiel opslaan'}
        </button>
        {accountMsg && <p className="wb-msg" style={{ color: accountMsg.ok ? 'var(--accent)' : '#e0533d' }}>{accountMsg.text}</p>}
      </form>

      <form className="wb-card pf-card" onSubmit={changePassword}>
        <h2>Wachtwoord wijzigen</h2>
        <label style={labelStyle}>
          Huidig wachtwoord
          <input className="wb-input" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
        </label>
        <label style={labelStyle}>
          Nieuw wachtwoord (min. 8 tekens)
          <input className="wb-input" type="password" autoComplete="new-password" minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
        </label>
        <button type="submit" disabled={savingPw} className="wb-btn wb-btn-primary">
          {savingPw ? 'Bezig…' : 'Wachtwoord wijzigen'}
        </button>
        {pwMsg && <p className="wb-msg" style={{ color: pwMsg.ok ? 'var(--accent)' : '#e0533d' }}>{pwMsg.text}</p>}
      </form>
    </div>
  )
}
