import { NextResponse } from 'next/server'

import { authUser, isFederationLevel } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'
import { parseDelimited } from '@/lib/season-import'
import { runSeasonImport } from '@/lib/season-import-run'
import { readXlsx } from '@/lib/xlsx-read'

export const dynamic = 'force-dynamic'

// Seizoensimport in één keer: het volledige speelplan (alle reeksen) als Excel, CSV of geplakte
// tekst. Twee stappen — eerst een proefronde die enkel vertélt wat er gaat gebeuren, daarna de
// echte import. Enkel federatie/admin: dit maakt clubs, ploegen en honderden wedstrijden aan.

const MAX_BYTES = 5 * 1024 * 1024

/** Haalt de tabel uit de aanvraag: een Excel-bestand, of tekst (CSV/geplakt). */
async function leesTabel(req: Request): Promise<{ rows: string[][]; bron: string } | { error: string }> {
  const type = req.headers.get('content-type') ?? ''

  if (type.includes('multipart/form-data')) {
    const form = await req.formData()
    const file = form.get('file')
    if (file && typeof file === 'object' && 'arrayBuffer' in file) {
      const blob = file as File
      if (blob.size > MAX_BYTES) return { error: 'Bestand is te groot (max. 5 MB).' }
      const buf = Buffer.from(await blob.arrayBuffer())
      const naam = (blob.name || '').toLowerCase()
      if (naam.endsWith('.xlsx') || naam.endsWith('.xlsm')) {
        try {
          const sheets = readXlsx(buf)
          const gevraagd = String(form.get('sheet') ?? '').trim()
          const blad = gevraagd ? (sheets.find((s) => s.name === gevraagd) ?? sheets[0]) : sheets[0]
          return { rows: blad.rows, bron: `${blob.name} · blad "${blad.name}"` }
        } catch (e) {
          return { error: `Excel-bestand kon niet gelezen worden: ${(e as Error).message}` }
        }
      }
      if (naam.endsWith('.xls')) {
        return {
          error:
            'Dit is een oud .xls-bestand. Open het in Excel en bewaar het als .xlsx (of exporteer als CSV) en probeer opnieuw.',
        }
      }
      // CSV en andere tekstbestanden.
      return { rows: parseDelimited(buf.toString('utf8')), bron: blob.name }
    }
    const tekst = String(form.get('text') ?? '')
    if (tekst.trim()) return { rows: parseDelimited(tekst), bron: 'geplakte tekst' }
    return { error: 'Geen bestand of tekst meegestuurd.' }
  }

  let body: { text?: unknown }
  try {
    body = await req.json()
  } catch {
    return { error: 'Ongeldige aanvraag.' }
  }
  const tekst = String(body.text ?? '')
  if (!tekst.trim()) return { error: 'Geen tekst meegestuurd.' }
  return { rows: parseDelimited(tekst), bron: 'geplakte tekst' }
}

export async function POST(req: Request) {
  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  if (!user) return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 })
  if (!isFederationLevel(user)) {
    return NextResponse.json({ error: 'Enkel de federatie kan het speelplan importeren.' }, { status: 403 })
  }

  const url = new URL(req.url)
  const commit = url.searchParams.get('commit') === '1'

  const gelezen = await leesTabel(req).catch((e) => ({ error: (e as Error).message }))
  if ('error' in gelezen) return NextResponse.json({ error: gelezen.error }, { status: 400 })
  if (gelezen.rows.length === 0) {
    return NextResponse.json({ error: 'Het bestand bevat geen rijen.' }, { status: 400 })
  }

  try {
    const resultaat = await runSeasonImport(payload, gelezen.rows, { commit })
    return NextResponse.json({ ok: true, commit, bron: gelezen.bron, ...resultaat })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}
