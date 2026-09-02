// Naar wélk kantinescherm wijst de knop op een tornooireeks?
//
// Er zijn er twee, en dat is geen erfenis maar een echt onderscheid:
//
//   • `/tornooi/groep/<dag>/kantine` — de tornooidag. Eén link die je 's ochtends opent en de hele
//     dag laat staan: aftellen, live borden van álle reeksen door elkaar, uitslagenbalk, en na de
//     laatste wedstrijd de kampioenen afgewisseld met de foto's van de dag.
//   • `/tornooi/<id>/kantine` — één reeks alleen: het schema van díé beker met de scores erbij.
//
// Hoort een reeks bij een tornooidag, dan is het eerste wat de kantine wil zien; het tweede toont
// dan maar een vierde van wat er op de velden gebeurt. Een losse beker heeft geen dag om naar te
// wijzen en houdt het reeksscherm.
//
// Waarom dit een eigen functie is: de knop op de reekspagina wees naar het reeksscherm, ook op een
// tornooidag. Je klikte "Kantinescherm" en belandde op een ánder, karig scherm dan het scherm dat
// daarvoor gebouwd was. Zo'n verkeerde link is in de code onzichtbaar — hier is hij te testen.

/** Het kantinescherm dat bij deze reeks hoort. */
export function kantinePadVoor(tournamentId: number, groep?: string | null): string {
  const dag = typeof groep === 'string' ? groep.trim() : ''
  return dag ? `/tornooi/groep/${encodeURIComponent(dag)}/kantine` : `/tornooi/${tournamentId}/kantine`
}

/**
 * Het vaste vertrekpunt van wie een tornooidag volgt: de dagpagina met alle categorieën.
 *
 * Wie op een reeks doorklikt, zit daarna in één categorie. De weg terug ging naar de lijst met
 * álle bekers van het seizoen — een heel eind om de rest van je eigen tornooidag terug te
 * vinden. Hoort de reeks bij een dag, dan is díé het vertrekpunt.
 */
export function tornooiBasisPad(groep?: string | null): string {
  const dag = typeof groep === 'string' ? groep.trim() : ''
  return dag ? `/tornooi/groep/${encodeURIComponent(dag)}` : '/tornooi'
}
