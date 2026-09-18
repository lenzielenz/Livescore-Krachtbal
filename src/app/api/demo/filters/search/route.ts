import { searchSeizoen } from '@/app/(frontend)/live/loadLiveDay'

// Alleen-lezen, geen auth nodig (dezelfde publieke wedstrijddata als het live-bord). Voedt de
// "ook komende/voorbije wedstrijden tonen"-uitbreiding van de zoekbalk op /demo/filters — zie
// searchSeizoen() in loadLiveDay.ts voor de eigenlijke zoeklogica (over het hele seizoen).
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get('q') ?? ''
  const matches = await searchSeizoen(q)
  return Response.json({ matches })
}
