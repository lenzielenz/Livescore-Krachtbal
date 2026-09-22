import { NextResponse } from 'next/server'

import { authUser, isFederationLevel } from '@/lib/api-auth'
import { hasFunctionGrant } from '@/lib/function-grants'
import { getPayloadClient } from '@/lib/payload-client'
import { parseDelimited, type TeamMappings } from '@/lib/season-import'
import { ImportLooptAlError, importBezig, runSeasonImport } from '@/lib/season-import-run'
import { readXlsx } from '@/lib/xlsx-read'

export const dynamic = 'force-dynamic'

// Seizoensimport in één keer: het volledige speelplan (alle reeksen) als Excel, CSV of geplakte
// tekst. Twee stappen — eerst een proefronde die enkel vertélt wat er gaat gebeuren, daarna de
// echte import. Enkel federatie/admin: dit maakt clubs, ploegen en honderden wedstrijden aan.

const MAX_BYTES = 5 * 1024 * 1024

// Server-side vangnet voor "vervang volledig speelplan": een aparte checkbox in de UI is genoeg
// tegen een ongelukkige klik, maar niet tegen een losstaande aanvraag (devtools, herhaalde
// request). Wie écht alles wil wissen, moet deze frase letterlijk meesturen.
export const WIPE_CONFIRM_PHRASE = 'VERWIJDER ALLES'

/** Ontleedt de JSON-tekst met ploeg-toewijzingen (zie season-import.ts TeamMappings) en houdt
 *  enkel rijen over die de verwachte vorm hebben — een kapotte/gemanipuleerde waarde mag de
 *  import niet laten crashen, hooguit die ene toewijzing negeren. */
function parseTeamMappings(raw: string | null): TeamMappings | undefined {
  if (!raw) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return undefined
  }
  if (!parsed || typeof parsed !== 'object') return undefined
  const out: TeamMappings = {}
  for (const [sleutel, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue
    const actie = (v as { actie?: unknown }).actie
    if (actie === 'bestaand') {
      const teamId = Number((v as { teamId?: unknown }).teamId)
      if (Number.isFinite(teamId) && teamId > 0) out[sleutel] = { actie: 'bestaand', teamId }
    } else if (actie === 'nieuw') {
      const naam = (v as { naam?: unknown }).naam
      out[sleutel] = { actie: 'nieuw', naam: typeof naam === 'string' && naam.trim() ? naam.trim() : undefined }
    }
  }
  return out
}

/** Haalt de tabel (+ eventuele wipe-bevestiging + ploeg-toewijzingen) uit de aanvraag: een
 *  Excel-bestand, of tekst. */
async function leesTabel(
  req: Request,
): Promise<{ rows: string[][]; bron: string; confirm: string; teamMappings?: TeamMappings } | { error: string }> {
  const type = req.headers.get('content-type') ?? ''

  if (type.includes('multipart/form-data')) {
    const form = await req.formData()
    const confirm = String(form.get('confirm') ?? '')
    const teamMappings = parseTeamMappings(form.get('teamMappings') as string | null)
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
          return { rows: blad.rows, bron: `${blob.name} · blad "${blad.name}"`, confirm, teamMappings }
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
      return { rows: parseDelimited(buf.toString('utf8')), bron: blob.name, confirm, teamMappings }
    }
    const tekst = String(form.get('text') ?? '')
    if (tekst.trim()) return { rows: parseDelimited(tekst), bron: 'geplakte tekst', confirm, teamMappings }
    return { error: 'Geen bestand of tekst meegestuurd.' }
  }

  let body: { text?: unknown; confirm?: unknown; teamMappings?: unknown }
  try {
    body = await req.json()
  } catch {
    return { error: 'Ongeldige aanvraag.' }
  }
  const tekst = String(body.text ?? '')
  if (!tekst.trim()) return { error: 'Geen tekst meegestuurd.' }
  return {
    rows: parseDelimited(tekst),
    bron: 'geplakte tekst',
    confirm: String(body.confirm ?? ''),
    teamMappings: parseTeamMappings(typeof body.teamMappings === 'string' ? body.teamMappings : null),
  }
}

export async function POST(req: Request) {
  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  if (!user) return NextResponse.json({ error: 'Niet ingelogd.' }, { status: 401 })

  const url = new URL(req.url)
  const commit = url.searchParams.get('commit') === '1'
  const wipe = url.searchParams.get('wipe') === '1'

  // Een toekenning voor 'beheer/planning' (zie lib/function-grants.ts) mag importeren, maar NOOIT
  // het volledige speelplan wissen — die destructieve stap blijft altijd federatie-only, zonder
  // uitzondering.
  if (wipe) {
    if (!isFederationLevel(user)) {
      return NextResponse.json({ error: 'Enkel de federatie kan het speelplan wissen.' }, { status: 403 })
    }
  } else if (!isFederationLevel(user) && !(await hasFunctionGrant(payload, user.id, 'beheer/planning'))) {
    return NextResponse.json({ error: 'Enkel de federatie kan het speelplan importeren.' }, { status: 403 })
  }

  const gelezen = await leesTabel(req).catch((e) => ({ error: (e as Error).message }))
  if ('error' in gelezen) return NextResponse.json({ error: gelezen.error }, { status: 400 })
  if (gelezen.rows.length === 0) {
    return NextResponse.json({ error: 'Het bestand bevat geen rijen.' }, { status: 400 })
  }
  // Destructieve stap: pas uitvoeren als de bevestigingsfrase letterlijk meegestuurd is.
  if (wipe && commit && gelezen.confirm !== WIPE_CONFIRM_PHRASE) {
    return NextResponse.json(
      { error: `Typ exact "${WIPE_CONFIRM_PHRASE}" om alle bestaande wedstrijden te bevestigen.` },
      { status: 400 },
    )
  }

  // Een tweede import terwijl de eerste nog schrijft, zet de hele kalender dubbel. Dat gebeurt
  // niet uit onwil: 2400 wedstrijden inladen duurt minuten, en wie in die tijd niets ziet
  // gebeuren drukt opnieuw. Hier al weigeren scheelt de gebruiker de wachttijd.
  if (commit && importBezig()) {
    return NextResponse.json({ error: new ImportLooptAlError().message }, { status: 409 })
  }

  try {
    const resultaat = await runSeasonImport(payload, gelezen.rows, { commit, wipe, teamMappings: gelezen.teamMappings })
    return NextResponse.json({ ok: true, commit, wipe, bron: gelezen.bron, ...resultaat })
  } catch (e) {
    if (e instanceof ImportLooptAlError) {
      return NextResponse.json({ error: e.message }, { status: 409 })
    }
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}
