import { nieuwFormulier } from './pdf-ongeval'

// De ondertekende documenten van de federatie die niet het wedstrijdblad zijn: het
// scheidsrechtersrapport (RCVK item 27) en de uitleenovereenkomst (item 45). Zelfde opmaak en zelfde
// WinAnsi-veilige tekst als de ongevalsaangifte (pdf-ongeval.ts). De PDF wordt telkens opnieuw
// gemaakt uit het record — dat verandert na de handtekening niet meer, dus de PDF ook niet.

export type Handtekening = { rol: string; naam: string | null; op: string | null }

export type SrRapportPdfData = {
  nummer: number
  wedstrijd: string
  datum: string
  reeks?: string
  scheidsrechter: string
  aanleidingen: string[]
  relaas: string
  bijlagen: string[]
  ondertekend: Handtekening
  status: string
  besluit?: string | null
}

export async function generateSrRapportPdf(d: SrRapportPdfData): Promise<Uint8Array> {
  const { doc, line, veld, witregel, grey } = await nieuwFormulier()
  line('SCHEIDSRECHTERSRAPPORT', { size: 14, b: true })
  line(`Aan het scheidsrechterscomité - KVKBF (RCVK item 27) - rapport nr. ${d.nummer}`, { color: grey, size: 9, gap: 20 })

  line('Wedstrijd', { b: true, size: 11 })
  veld('Wedstrijd', d.wedstrijd)
  veld('Datum', d.datum)
  if (d.reeks) veld('Reeks', d.reeks)
  veld('Scheidsrechter', d.scheidsrechter)
  witregel()

  line('Aanleiding', { b: true, size: 11 })
  for (const a of d.aanleidingen) line(`- ${a}`, { size: 10, inspring: 10 })
  witregel()

  line('Relaas van de feiten', { b: true, size: 11 })
  for (const alinea of d.relaas.split(/\n+/)) line(alinea, { size: 10, inspring: 10 })
  witregel()

  if (d.bijlagen.length) {
    line('Bijlagen', { b: true, size: 11 })
    for (const b of d.bijlagen) line(`- ${b}`, { size: 9, inspring: 10 })
    witregel()
  }

  line('Ondertekening', { b: true, size: 11 })
  veld(d.ondertekend.rol, d.ondertekend.naam ? `${d.ondertekend.naam} - digitaal ondertekend op ${d.ondertekend.op ?? ''}` : undefined)
  witregel()

  line('Behandeling door het comité', { b: true, size: 11 })
  veld('Status', d.status)
  if (d.besluit) line(d.besluit, { size: 10, inspring: 10 })
  return doc.save()
}

export type UitleningPdfData = {
  nummer: number
  speler: { naam: string; adres: string; geboortedatum: string; leeftijd: string; categorie: string }
  vanClub: string
  naarClub: string
  ploeg: string
  competitie: string
  handtekeningen: Handtekening[]
  status: string
  toelichting?: string | null
}

export async function generateUitleningPdf(d: UitleningPdfData): Promise<Uint8Array> {
  const { doc, line, veld, witregel, grey } = await nieuwFormulier()
  line('OVEREENKOMST UITLENEN JEUGDSPELER', { size: 14, b: true })
  line(`KVKBF - RCVK item 45 - overeenkomst nr. ${d.nummer}`, { color: grey, size: 9, gap: 20 })

  line('Speler', { b: true, size: 11 })
  veld('Naam', d.speler.naam)
  veld('Adres', d.speler.adres)
  veld('Geboortedatum', d.speler.geboortedatum)
  veld('Leeftijd', d.speler.leeftijd)
  veld('Categorie', d.speler.categorie)
  witregel()

  line('Partijen', { b: true, size: 11 })
  veld('Uitlenende club', d.vanClub)
  veld('Ontvangende club', d.naarClub)
  veld('Ploeg', d.ploeg)
  veld('Geldig voor de competitie', d.competitie)
  witregel()

  line(
    'De uitlenende club leent bovenstaande jeugdspeler uit aan de ontvangende club, voor de duur van de vermelde competitie. De speler blijft lid van de uitlenende club. Deze overeenkomst geldt pas na bevestiging door de federatie.',
    { size: 10 },
  )
  witregel(10)

  line('Handtekeningen', { b: true, size: 11 })
  for (const h of d.handtekeningen) veld(h.rol, h.naam ? `${h.naam} - digitaal ondertekend op ${h.op ?? ''}` : undefined)
  witregel()
  veld('Status', d.status)
  if (d.toelichting) line(d.toelichting, { size: 9, inspring: 10, color: grey })
  return doc.save()
}
