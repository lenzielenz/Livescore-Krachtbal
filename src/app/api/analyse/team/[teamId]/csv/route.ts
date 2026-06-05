import { canAnalyse } from '@/lib/access'
import { authUser } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'
import { buildTeamReport, teamReportToCsv } from '@/lib/team-report'

// CSV-export van het ploegrapport (scouting). Admin/analyse-only.
export async function GET(req: Request, { params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params
  const id = Number(teamId)
  if (!Number.isFinite(id)) return Response.json({ error: 'Ongeldig ploeg-id' }, { status: 400 })
  try {
    const payload = await getPayloadClient()
    const user = await authUser(payload, req)
    if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
    if (!canAnalyse(user)) return Response.json({ error: 'Geen toegang tot de analyse.' }, { status: 403 })

    const report = await buildTeamReport(payload, id)
    if (!report) return Response.json({ error: 'Ploeg niet gevonden.' }, { status: 404 })

    const csv = teamReportToCsv(report)
    const safeName = report.teamName.replace(/[^\w-]+/g, '_').toLowerCase()
    return new Response('﻿' + csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="ploegrapport-${safeName}.csv"`,
      },
    })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
