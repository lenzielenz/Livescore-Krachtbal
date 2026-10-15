'use client'

import Link from 'next/link'

import type { WedkantoorStats } from '@/lib/virtueel-wedkantoor'

// De schermen van het wedkantoor in de kelder, groot en leesbaar op je gsm: het klassement van de
// pronostiek, de kerncijfers, de uitblinkers, de kansen op het bonusrad en wie er dit weekend aan
// het echte rad mag. Met links naar de echte pronostiek.

const fmt = (v: number) => `×${Number.isInteger(v) ? v : String(v).replace('.', ',')}`
const getal = (n: number) => n.toLocaleString('nl-BE')

export function WedkantoorPaneel({ open, onSluit, stats }: { open: boolean; onSluit: () => void; stats: WedkantoorStats | null }) {
  if (!open) return null
  const s = stats
  const maxPct = s ? Math.max(1, ...s.radKansen.map((k) => k.pct)) : 1
  const maxMult = s ? Math.max(...s.radKansen.map((k) => k.mult)) : 0
  return (
    <div className="vk-spel vk-wed" role="dialog" aria-label="Wedkantoor: statistieken van de pronostiek">
      <div className="vk-graf-kop">
        <div>
          <b>🎰 Wedkantoor · pronostiek</b>
          <span>{s ? `Seizoen ${s.seizoen}` : 'Laden…'}</span>
        </div>
        <button className="vk-graf-sluit" onClick={onSluit} aria-label="Sluiten">
          ✕
        </button>
      </div>
      {!s ? (
        <div className="vk-spel-inhoud">
          <p className="vk-spel-uitleg">De schermen warmen op…</p>
        </div>
      ) : (
        <div className="vk-wed-inhoud">
          <section className="vk-wed-kaart breed">
            <h3>📊 Kerncijfers</h3>
            <div className="vk-wed-cijfers">
              {(
                [
                  [getal(s.deelnemers), 'voorspellers'],
                  [getal(s.wedstrijden), 'wedstrijden'],
                  [getal(s.voorspellingen), 'voorspellingen'],
                  [getal(s.exact), 'exact geraden'],
                  [`${s.exactPct}%`, 'exact'],
                  [String(s.gemPunten).replace('.', ','), 'punten per gok'],
                ] as const
              ).map(([n, t]) => (
                <div key={t}>
                  <b>{n}</b>
                  <span>{t}</span>
                </div>
              ))}
            </div>
          </section>
          {s.ik && (
            <section className="vk-wed-kaart ik">
              <h3>👤 Jouw stand</h3>
              <p>
                <b>#{s.ik.rank}</b> met {getal(s.ik.punten)} punten
              </p>
            </section>
          )}
          <section className="vk-wed-kaart">
            <h3>🏆 Klassement</h3>
            {s.top.length ? (
              <ol className="vk-wed-lijst">
                {s.top.map((r) => (
                  <li key={`${r.rank}-${r.naam}`}>
                    <span className="rang">{r.rank}</span>
                    <span className="naam">{r.naam}</span>
                    <span className="pt">{getal(r.punten)} pt</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="vk-spel-uitleg">Nog geen punten dit seizoen.</p>
            )}
          </section>
          <section className="vk-wed-kaart">
            <h3>⭐ Uitblinkers</h3>
            <ul className="vk-wed-uit">
              <li>
                <span>🎯 Meeste exacte uitslagen</span>
                <b>{s.scherpste ? `${s.scherpste.naam} (${s.scherpste.aantal}×)` : '—'}</b>
              </li>
              <li>
                <span>🔥 Meest actief</span>
                <b>{s.actiefste ? `${s.actiefste.naam} (${s.actiefste.aantal})` : '—'}</b>
              </li>
              <li>
                <span>📏 Vaakst dichtst bij</span>
                <b>{s.dichtste ? `${s.dichtste.naam} (${s.dichtste.aantal}×)` : '—'}</b>
              </li>
              <li>
                <span>🗳️ Populairste uitslag</span>
                <b>{s.populairst ? `${s.populairst.uitslag} (${s.populairst.aantal}×)` : '—'}</b>
              </li>
            </ul>
          </section>
          <section className="vk-wed-kaart">
            <h3>🎰 Kansen op het bonusrad</h3>
            <div className="vk-wed-kansen">
              {s.radKansen.map((k) => (
                <div key={k.mult} className={k.mult === maxMult ? 'jackpot' : ''}>
                  <b>{fmt(k.mult)}</b>
                  <i style={{ width: `${(k.pct / maxPct) * 100}%` }} />
                  <span>{k.pct}%</span>
                </div>
              ))}
            </div>
          </section>
          <section className="vk-wed-kaart">
            <h3>🎡 Dit weekend aan het echte rad</h3>
            {s.radWinnaars.length ? (
              <ol className="vk-wed-lijst">
                {s.radWinnaars.map((n, i) => (
                  <li key={`${i}-${n}`}>
                    <span className="rang">{i + 1}</span>
                    <span className="naam">{n}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="vk-spel-uitleg">Wie vorig weekend het best voorspelde, draait hier 3× voor een booster.</p>
            )}
          </section>
          <div className="vk-wed-links">
            <Link href="/pronostiek">Naar de pronostiekstand</Link>
            <Link href="/pronostiek/rad">Naar het echte bonusrad</Link>
          </div>
        </div>
      )}
    </div>
  )
}
