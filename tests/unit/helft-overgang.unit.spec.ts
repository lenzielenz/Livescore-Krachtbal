import { describe, it, expect } from 'vitest'

import { inRust, klokKnopLabel, magHelftAfsluiten, type HelftStand } from '@/lib/helft-overgang'

// De overgang naar de rust, zoals de aantekentafels hem tonen.
//
// De melding die hierachter zit: "einde 1ste helft is vreemd dat je 2de helft moet aanklikken.
// dat klopt niet, want als je drukt 2de helft dan start de tijd opnieuw." De klok hoorde inderdaad
// op nul te springen — dat is de rust — maar geen enkel scherm zei dat, en de knop heette naar wat
// er dáárna komt in plaats van naar wat hij doet.

const stand = (extra: Partial<HelftStand> = {}): HelftStand => ({
  status: 'live',
  helft: 1,
  klokLoopt: true,
  klokSeconden: 600,
  ...extra,
})

describe('einde eerste helft', () => {
  it('kan enkel tijdens een lopende eerste helft', () => {
    expect(magHelftAfsluiten(stand())).toBe(true)
    expect(magHelftAfsluiten(stand({ helft: 2 }))).toBe(false)
    expect(magHelftAfsluiten(stand({ status: 'pending' }))).toBe(false)
    expect(magHelftAfsluiten(stand({ status: 'finished' }))).toBe(false)
  })

  it('mag ook met een gepauzeerde klok — de rust begint vaak bij stilstand', () => {
    expect(magHelftAfsluiten(stand({ klokLoopt: false }))).toBe(true)
  })
})

describe('de rust', () => {
  it('herkent de tweede helft die nog moet beginnen', () => {
    expect(inRust(stand({ helft: 2, klokLoopt: false, klokSeconden: 0 }))).toBe(true)
  })

  it('is voorbij zodra de tweede helft loopt of er tijd op staat', () => {
    expect(inRust(stand({ helft: 2, klokLoopt: true, klokSeconden: 0 }))).toBe(false)
    expect(inRust(stand({ helft: 2, klokLoopt: false, klokSeconden: 12 }))).toBe(false)
  })

  it('is geen rust in de eerste helft, ook niet vóór de aftrap', () => {
    // Vóór de aftrap staat de klok óók op 0 en stil. Dat is geen rust maar een wedstrijd die nog
    // moet beginnen — daar hoort "Start" te staan, niet "Start 2e helft".
    expect(inRust(stand({ helft: 1, klokLoopt: false, klokSeconden: 0 }))).toBe(false)
    expect(inRust(stand({ status: 'pending', helft: 1, klokLoopt: false, klokSeconden: 0 }))).toBe(false)
  })

  it('is voorbij zodra de wedstrijd afgelopen is', () => {
    expect(inRust(stand({ status: 'finished', helft: 2, klokLoopt: false, klokSeconden: 0 }))).toBe(false)
  })
})

describe('wat er op de klokknop staat', () => {
  it('zegt in de rust wát je start', () => {
    // Dít is de kern van de melding: een kale "Klok" laat je raden of de tweede helft al bezig is.
    expect(klokKnopLabel(stand({ helft: 2, klokLoopt: false, klokSeconden: 0 }))).toBe('▶ Start 2e helft')
  })

  it('blijft een gewone klokknop bij een pauze middenin een helft', () => {
    expect(klokKnopLabel(stand({ helft: 2, klokLoopt: false, klokSeconden: 300 }))).toBe('▶ Klok')
    expect(klokKnopLabel(stand({ helft: 1, klokLoopt: false, klokSeconden: 120 }))).toBe('▶ Klok')
  })

  it('biedt pauze zolang de klok loopt', () => {
    expect(klokKnopLabel(stand({ klokLoopt: true }))).toBe('⏸ Pauze')
  })
})
