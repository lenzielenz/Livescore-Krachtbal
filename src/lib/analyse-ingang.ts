// Waar breng je iemand naartoe die op een analysewedstrijd klikt?
//
// Bij het aanmaken kies je hóé de analyse gemaakt wordt (`analyseModus` op de wedstrijd):
//
//   'manueel' — je tikt elke worp aan op het veldschema. Dat gebeurt aan de aantekentafel.
//   'video'   — je tikt niets aan. De opname wordt doorgerekend en jij bevestigt de voorstellen.
//               Dat gebeurt op de analysepagina: video koppelen, veldlijnen aanwijzen, rekenen.
//
// Die keuze werd bewaard, en meteen ná het aanmaken bracht de knop je ook naar de juiste plek.
// Maar de kaart in het overzicht wees áltijd naar de aantekentafel. Wie de pagina verliet en zijn
// wedstrijd opnieuw aanklikte, belandde dus op het manuele scherm en vond de weg naar de video
// niet meer terug — terwijl hij net gekozen had om niets met de hand te doen.
//
// Vandaar: één functie die de gekozen weg respecteert, en een test die precies dát bewaakt.

export type AnalyseIngang = {
  /** Waar de kaart naartoe linkt. */
  pad: string
  /** Wat er op de kaart staat, zodat je vóór het tikken al weet waar je uitkomt. */
  label: string
}

/** De ingang van een analysewedstrijd, volgens de weg die bij het aanmaken gekozen is. */
export function analyseIngang(
  id: number,
  analyseModus: string | null | undefined,
  status: string,
): AnalyseIngang {
  if (analyseModus === 'video') {
    // Op de videoweg valt er niets aan te tekenen — ook niet terwijl de wedstrijd "live" staat.
    // De analysepagina is de enige zinvolle bestemming.
    return { pad: `/analyse/${id}`, label: '🎥 Analyse · video' }
  }
  return {
    pad: `/scorekeeper/${id}`,
    label: status === 'live' ? '● LIVE — aantekenen' : '🎬 Analyse · ▶ Activeren',
  }
}
