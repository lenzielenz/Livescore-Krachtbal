// Adapter voor de upload naar het federatiesysteem. Vandaag bestaat er (nog) geen echte
// KVKBF-API (beslissing Robin: voorlopig e-mail/PDF). Deze adapter is een stub die later
// op de echte federatie-API kan worden aangesloten zonder de rest van de flow te wijzigen.
//
// Zet FEDERATION_UPLOAD_URL om de upload te activeren; anders wordt enkel gelogd.

export type FederationUploadResult = { uploaded: boolean; reason?: string; reference?: string }

export async function federationUpload(payload: {
  matchId: number | string
  data: unknown
}): Promise<FederationUploadResult> {
  const url = process.env.FEDERATION_UPLOAD_URL
  if (!url) {
    console.info('[federationUpload] FEDERATION_UPLOAD_URL ontbreekt — upload overgeslagen (stub).', {
      matchId: payload.matchId,
    })
    return { uploaded: false, reason: 'no-endpoint' }
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.FEDERATION_UPLOAD_TOKEN
          ? { Authorization: `Bearer ${process.env.FEDERATION_UPLOAD_TOKEN}` }
          : {}),
      },
      body: JSON.stringify(payload.data),
    })
    if (!res.ok) return { uploaded: false, reason: `http-${res.status}` }
    const json = (await res.json().catch(() => ({}))) as { reference?: string }
    return { uploaded: true, reference: json.reference }
  } catch (err) {
    return { uploaded: false, reason: (err as Error).message }
  }
}
