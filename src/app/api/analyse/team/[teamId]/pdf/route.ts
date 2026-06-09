import { canAnalyse } from '@/lib/access'
import { analyseOwnWhere } from '@/lib/analyse-access'
import { authUser } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'
import { buildTeamDanger } from '@/lib/player-danger'
import { generateTeamReportPdf } from '@/lib/submit/pdf-ploegrapport'
import { buildTeamReport } from '@/lib/team-report'

// PDF-export van het ploegrapport (scouting). Admin/analyse-only.
export async function GET(req: Request, { params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params
  const id = Number(teamId)
  if (!Number.isFinite(id)) return Response.json({ error: 'Ongeldig ploeg-id' }, { status: 400 })
  try {
    const payload = await getPayloadClient()
    const user = await authUser(payload, req)
    if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
    if (!canAnalyse(user)) return Response.json({ error: 'Geen toegang tot de analyse.' }, { status: 403 })

    // Enkel je eigen analyse-ploeg mag geëxporteerd worden — anders lekt de ploegnaam van een andere analist.
    const owned = await payload
      .find({ collection: 'teams', where: { and: [{ id: { equals: id } }, analyseOwnWhere(user)] }, depth: 0, limit: 1 })
      .catch(() => ({ totalDocs: 0 }))
    if (!owned.totalDocs) return Response.json({ error: 'Ploeg niet gevonden.' }, { status: 404 })

    const report = await buildTeamReport(payload, id, null, analyseOwnWhere(user))
    if (!report) return Response.json({ error: 'Ploeg niet gevonden.' }, { status: 404 })

    // Gevaarkaart (waar de ploeg scoort) + verdedigingskaart (waar tegenstanders tegen hen scoren).
    const [danger, conceded] =
      report.matchesAnalyzed > 0
        ? await Promise.all([
            buildTeamDanger(payload, id, report.reeks, null, analyseOwnWhere(user)).catch(() => null),
            buildTeamDanger(payload, id, report.reeks, null, analyseOwnWhere(user), { conceded: true }).catch(() => null),
          ])
        : [null, null]

    const pdf = await generateTeamReportPdf(report, danger, conceded)
    const safeName = report.teamName.replace(/[^\w-]+/g, '_').toLowerCase()
    return new Response(Buffer.from(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="ploegrapport-${safeName}.pdf"`,
      },
    })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
