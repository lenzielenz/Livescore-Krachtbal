import { canAnalyse } from '@/lib/access'
import { analyseMatchWhere } from '@/lib/analyse-access'
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

    const report = await buildTeamReport(payload, id, null, analyseMatchWhere(user))
    if (!report) return Response.json({ error: 'Ploeg niet gevonden.' }, { status: 404 })

    // Gevaarzone/veldbezetting (waar de ploeg scoort) — voedt de grafieken in de PDF.
    const danger =
      report.matchesAnalyzed > 0
        ? await buildTeamDanger(payload, id, report.reeks, null, analyseMatchWhere(user)).catch(() => null)
        : null

    const pdf = await generateTeamReportPdf(report, danger)
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
