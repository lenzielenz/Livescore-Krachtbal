import { hasRole, isFederationLevel } from '@/lib/access'
import { authUser } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'
import { extractPdfText, parseReeksindeling, teamKey } from '@/lib/reeksindeling-import'

// Importeer de thuisuren uit de reeksindeling-PDF en zet ze op de overeenkomstige ploegen.
// Standaard PREVIEW; met { commit: true } worden de thuisuren weggeschreven. Federatie/admin.
export async function POST(req: Request) {
  let body: { pdfBase64?: string; text?: string; commit?: boolean }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }
  // Bij voorkeur stuurt de client de reeds-uitgelezen PDF-tekst (klein); anders de base64-PDF.
  const clientText = typeof body.text === 'string' ? body.text : ''
  const b64 = String(body.pdfBase64 ?? '').replace(/^data:[^,]*,/, '')
  const commit = body.commit === true
  if (!clientText && !b64) return Response.json({ error: 'Geen PDF ontvangen.' }, { status: 400 })

  try {
    const payload = await getPayloadClient()
    const user = await authUser(payload, req)
    if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
    if (!isFederationLevel(user) && !hasRole(user, 'federatie')) {
      return Response.json({ error: 'Enkel federatie/admin mag importeren.' }, { status: 403 })
    }

    const text = clientText || extractPdfText(Buffer.from(b64, 'base64'))
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
