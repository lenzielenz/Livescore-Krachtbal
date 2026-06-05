import { hasRole, isFederationLevel } from '@/lib/access'
import { authUser } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'
import { extractPdfText, parseReeksindeling, teamKey } from '@/lib/reeksindeling-import'

// Importeer de thuisuren uit de reeksindeling-PDF en zet ze op de overeenkomstige ploegen.
// Standaard PREVIEW; met { commit: true } worden de thuisuren weggeschreven. Federatie/admin.
export async function POST(req: Request) {
  // De PDF komt bij voorkeur als bestand (multipart) — betrouwbaar en server-side uitgelezen.
  // Fallback: JSON met { text } (reeds uitgelezen) of { pdfBase64 }.
  let commit = false
  let text = ''
  try {
    const ct = req.headers.get('content-type') || ''
    if (ct.includes('multipart/form-data')) {
      const form = await req.formData()
      commit = String(form.get('commit')) === 'true'
      const file = form.get('pdf')
      if (file && typeof file !== 'string') {
        text = extractPdfText(Buffer.from(await file.arrayBuffer()))
      }
    } else {
      const body = (await req.json()) as { pdfBase64?: string; text?: string; commit?: boolean }
      commit = body.commit === true
      const clientText = typeof body.text === 'string' ? body.text : ''
      const b64 = String(body.pdfBase64 ?? '').replace(/^data:[^,]*,/, '')
      text = clientText || (b64 ? extractPdfText(Buffer.from(b64, 'base64')) : '')
    }
  } catch {
    return Response.json({ error: 'Ongeldige aanvraag.' }, { status: 400 })
  }
  if (!text) return Response.json({ error: 'Geen PDF ontvangen.' }, { status: 400 })

  try {
    const payload = await getPayloadClient()
    const user = await authUser(payload, req)
    if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
    if (!isFederationLevel(user) && !hasRole(user, 'federatie')) {
      return Response.json({ error: 'Enkel federatie/admin mag importeren.' }, { status: 403 })
    }

    const entries = parseReeksindeling(text)
    if (entries.length === 0) {
      return Response.json({ error: 'Geen reeksindeling herkend in deze PDF.' }, { status: 400 })
    }

    // Ploegen indexeren op (genormaliseerde naam, reeks).
    const teamsRes = await payload.find({ collection: 'teams', depth: 0, limit: 5000 }).catch(() => ({ docs: [] as Record<string, unknown>[] }))
    const byKeyReeks = new Map<string, number>()
    for (const t of teamsRes.docs) {
      const k = teamKey(String((t as { name?: unknown }).name ?? ''))
      const rk = String((t as { reeks?: unknown }).reeks ?? '')
      if (k) byKeyReeks.set(`${k}|${rk}`, (t as { id: number }).id)
    }

    const updates = new Map<number, string>() // teamId → thuisUur
    const unmatched = new Set<string>()
    const samples: string[] = []
    for (const e of entries) {
      const thuis = `${e.day} ${e.time}`
      let any = false
      for (const reeks of e.reeksen) {
        const id = byKeyReeks.get(`${teamKey(e.team)}|${reeks}`)
        if (id != null) {
          updates.set(id, thuis)
          any = true
        }
      }
      if (!any) unmatched.add(`${e.team} (${e.code})`)
      else if (samples.length < 12) samples.push(`${e.team} · ${e.code} · ${thuis}`)
    }

    let committed = 0
    const errors: string[] = []
    if (commit) {
      for (const [id, thuisUur] of updates) {
        try {
          await payload.update({ collection: 'teams', id, data: { thuisUur }, overrideAccess: true })
          committed++
        } catch (e) {
          if (errors.length < 10) errors.push((e as Error).message)
        }
      }
    }

    return Response.json({
      ok: true,
      commit,
      entries: entries.length,
      toUpdate: updates.size,
      committed,
      unmatchedTeams: [...unmatched].slice(0, 80),
      unmatchedCount: unmatched.size,
      samples,
      errors,
    })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
