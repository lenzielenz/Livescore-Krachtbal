'use client'

import { useEffect, useState } from 'react'

// Aftelklok naar een tijdstip — start pas na de mount (server kent "nu" niet; hydration-veilig).
export function TornooiAftel({ naar }: { naar: number }) {
  const [nu, setNu] = useState<number | null>(null)
  useEffect(() => {
    setNu(Date.now())
    const t = setInterval(() => setNu(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  if (nu == null) return <b>–:––</b>
  const rest = Math.max(0, Math.floor((naar - nu) / 1000))
  if (rest <= 0) return <b>zo meteen</b>
  const d = Math.floor(rest / 86400)
  const u = Math.floor((rest % 86400) / 3600)
  const m = Math.floor((rest % 3600) / 60)
  const s = rest % 60
  const p = (n: number) => String(n).padStart(2, '0')
  if (d > 0) return <b>{d}d {p(u)}:{p(m)}:{p(s)}</b>
  return <b>{u > 0 ? `${u}:${p(m)}:${p(s)}` : `${m}:${p(s)}`}</b>
}
