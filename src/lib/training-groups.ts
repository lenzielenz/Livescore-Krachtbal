import { reeksNaam } from './reeksen'

// Trainingsgroepen: op training trainen alle senior-DAMES samen (ongeacht of ze 1ste Nationale,
// Landelijke of Regionale spelen) en alle senior-HEREN samen. Jeugd blijft per reeks.
// Wedstrijden/competitie blijven uiteraard wél per aparte reeks — dit is enkel voor het
// trainingsluik (aanwezigheid + progressie).
const DAMES = new Set(['1NAD', 'LD', 'RDA', 'RDB'])
const HEREN = new Set(['1NAH', '1NAHB', '2NAH', '2NAHB', 'LH', 'RHA', 'RHB'])

export function trainingGroupOf(reeks: string | null | undefined): { key: string; label: string } {
  const r = reeks ?? ''
  if (DAMES.has(r)) return { key: 'dames', label: 'Dames' }
  if (HEREN.has(r)) return { key: 'heren', label: 'Heren' }
  return { key: r || 'overig', label: r ? reeksNaam(r) : 'Overig' }
}
