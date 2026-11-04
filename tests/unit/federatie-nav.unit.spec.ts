// @vitest-environment node
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { FED_NAV, actiefItem, groepVan, inShell, navVoor, tellersPerItem, zoekItems } from '@/lib/federatie-nav'
import { PROFILES } from '@/lib/profiles'

const alleItems = FED_NAV.flatMap((g) => g.items)

describe('federatie-nav: de indeling van het werkplatform', () => {
  it('sleutels en paden zijn uniek, en elk pad is een interne route', () => {
    expect(new Set(alleItems.map((i) => i.key)).size).toBe(alleItems.length)
    expect(new Set(alleItems.map((i) => i.href)).size).toBe(alleItems.length)
    for (const i of alleItems) expect(i.href, i.key).toMatch(/^\/[a-z]/)
  })

  it('verliest geen enkele federatietool: alles uit het profiel staat ook in de zijbalk', () => {
    // De zijbalk vervangt de muur van knoppen. Wat daar bereikbaar was, moet hier bereikbaar blijven —
    // behalve /reglement (publieke leesversie, staat al onder "Reglement" in de footer en het menu).
    const profiel = PROFILES.find((p) => p.key === 'federatie')!
    const inNav = new Set(alleItems.map((i) => i.href))
    const ontbreekt = profiel.tools.map((t) => t.href).filter((h) => !inNav.has(h) && h !== '/reglement')
    expect(ontbreekt).toEqual([])
  })

  it('geeft elk item een tooltip en een eigen icoon-naam', () => {
    for (const i of alleItems) {
      expect(i.hint.length, i.key).toBeGreaterThan(10)
      expect(i.icon, i.key).toBeTruthy()
    }
  })
})

describe('federatie-nav: wie wat ziet', () => {
  it('admin-items zijn er enkel voor admins', () => {
    const fed = navVoor({ isAdmin: false }).flatMap((g) => g.items.map((i) => i.key))
    const admin = navVoor({ isAdmin: true }).flatMap((g) => g.items.map((i) => i.key))
    expect(fed).not.toContain('accounts')
    expect(fed).not.toContain('admin')
    expect(admin).toEqual(expect.arrayContaining(['accounts', 'admin']))
    // de federatie zelf ziet alle andere tools
    expect(fed.length).toBe(admin.length - 2)
  })

  it('geen groep blijft leeg achter', () => {
    for (const g of navVoor({ isAdmin: false })) expect(g.items.length, g.key).toBeGreaterThan(0)
  })
})

describe('federatie-nav: welk item is actief', () => {
  const groepen = navVoor({ isAdmin: true })

  it('het dashboard licht niet op bij een subpagina van /federatie', () => {
    expect(actiefItem(groepen, '/federatie')?.key).toBe('dashboard')
    expect(actiefItem(groepen, '/federatie/reglement')?.key).toBe('reglement')
    expect(actiefItem(groepen, '/federatie/referendum')?.key).toBe('referendum')
  })

  it('een detailpagina hoort bij het luik waar ze onder staat', () => {
    expect(actiefItem(groepen, '/beheer/boetes/12')?.key).toBe('boetes')
    expect(actiefItem(groepen, '/beheer/leden')?.key).toBe('leden')
  })

  it('een pad dat enkel op een voorvoegsel lijkt, telt niet mee (/beheer/klachtenlijst ≠ /beheer/klachten)', () => {
    expect(actiefItem(groepen, '/beheer/klachtenlijst')).toBeNull()
    expect(actiefItem(groepen, '/beheer/onbekend')).toBeNull()
    expect(actiefItem(groepen, '/')).toBeNull()
  })

  it('de kruimel kent de groep van het actieve item', () => {
    expect(groepVan(groepen, actiefItem(groepen, '/beheer/planner'))?.titel).toBe('Competitie')
    expect(groepVan(groepen, null)).toBeNull()
  })
})

describe('federatie-nav: tellers uit de open taken', () => {
  const groepen = navVoor({ isAdmin: false })

  it('een ?filter of #anker in de taak-href telt mee voor hetzelfde menu-item', () => {
    const t = tellersPerItem(groepen, [
      { href: '/beheer/wedstrijden', aantal: 1 }, // opstellingen
      { href: '/beheer/wedstrijden?filter=bladen', aantal: 2 },
      { href: '/beheer/wedstrijden?filter=live', aantal: 1 },
      { href: '/beheer/leden', aantal: 2 }, // registraties
      { href: '/beheer/leden#kaarten', aantal: 1 }, // medische kaarten
    ])
    expect(t.wedstrijden).toBe(4)
    expect(t.leden).toBe(3)
  })

  it('taken zonder openstaand werk geven geen teller', () => {
    expect(tellersPerItem(groepen, [{ href: '/beheer/boetes', aantal: 0 }])).toEqual({})
  })

  it('een taak zonder menu-item (bv. een nieuwe taaksoort) verdwijnt stil, zonder fout', () => {
    expect(tellersPerItem(groepen, [{ href: '/ergens/anders', aantal: 5 }])).toEqual({})
  })
})

describe('federatie-nav: het zoekpalet (Ctrl+K)', () => {
  const groepen = navVoor({ isAdmin: false })
  const sleutels = (q: string) => zoekItems(groepen, q).map((x) => x.item.key)

  it('lege zoekterm: alles, in menuvolgorde', () => {
    expect(sleutels('')).toEqual(groepen.flatMap((g) => g.items.map((i) => i.key)))
  })

  it('vindt op label, ook zonder hoofdletters of accenten', () => {
    expect(sleutels('boet')).toEqual(['boetes'])
    expect(sleutels('BOETES')).toContain('boetes')
    expect(sleutels('scheidsrechter')).toContain('scheidsrechters')
  })

  it('vindt op een zoekterm die niet in het label staat', () => {
    expect(sleutels('kaart')).toContain('leden') // medische kaart
    expect(sleutels('forfait')).toContain('boetes')
    expect(sleutels('slepen')).toContain('planner')
  })

  it('alle getypte woorden moeten passen', () => {
    expect(sleutels('boetes klachten')).toEqual([])
  })

  it('een label dat met de zoekterm begint, staat vóór een toevallige treffer', () => {
    // "Kalender opmaken" en "Planner" noemen wedstrijden enkel in de uitleg; de items die ermee beginnen komen eerst.
    const hits = zoekItems(groepen, 'wedstrijd')
    expect(hits.length).toBeGreaterThan(1)
    expect(hits[0]!.item.label.toLowerCase().startsWith('wedstrijd')).toBe(true)
    const eersteZonder = hits.findIndex((h) => !h.item.label.toLowerCase().startsWith('wedstrijd'))
    const laatsteMet = hits.map((h) => h.item.label.toLowerCase().startsWith('wedstrijd')).lastIndexOf(true)
    expect(eersteZonder === -1 || laatsteMet < eersteZonder).toBe(true)
  })

  it('niets gevonden geeft een lege lijst', () => {
    expect(sleutels('zzzzqq')).toEqual([])
  })
})

describe('federatie-nav: clubluiken onder /beheer krijgen geen zijbalk', () => {
  it('coach- en clubpagina’s blijven buiten de shell', () => {
    expect(inShell('/beheer/training')).toBe(false)
    expect(inShell('/beheer/training/plan')).toBe(false)
    expect(inShell('/beheer/club-team')).toBe(false)
    expect(inShell('/beheer/spelers')).toBe(false)
  })

  it('federatiepagina’s staan wel in de shell', () => {
    for (const p of ['/federatie', '/beheer/boetes', '/beheer/leden', '/wedstrijdbladen', '/beheer/trainingsdag-niet']) {
      expect(inShell(p), p).toBe(true)
    }
  })
})

describe('federatie-nav: elk luik met de shell-poort heeft ook een laadskelet', () => {
  // Zonder loading.tsx binnen het luik toont een harde laadbeurt de oude header-layout (het skelet van de
  // hele site) tot álles klaar is, waarna de zijbalk er plots inspringt. Met een skelet binnen het luik
  // staat de zijbalk er meteen. Zie FedShellGate en docs/FEDERATIEFLOW.md §6.
  const frontend = join(process.cwd(), 'src/app/(frontend)')
  const luiken = readdirSync(frontend).filter((d) => {
    try {
      return readFileSync(join(frontend, d, 'layout.tsx'), 'utf8').includes('FedShellGate')
    } catch {
      return false
    }
  })

  it('vindt de zes luiken van de federatie', () => {
    expect(luiken.sort()).toEqual(['beheer', 'bekerfinale', 'federatie', 'knipjes', 'ongevallen', 'wedstrijdbladen'])
  })

  it.each(['beheer', 'bekerfinale', 'federatie', 'knipjes', 'ongevallen', 'wedstrijdbladen'])('%s heeft een loading.tsx', (luik) => {
    expect(existsSync(join(frontend, luik, 'loading.tsx')), luik).toBe(true)
  })
})

describe('federatie-nav: de demo', () => {
  const origineel = process.env.PLATFORM_OMGEVING
  afterEach(() => {
    vi.unstubAllEnvs()
    if (origineel === undefined) delete process.env.PLATFORM_OMGEVING
    else process.env.PLATFORM_OMGEVING = origineel
  })

  it('geen enkel menu-item wijst naar een luik dat de demo verbergt (anders verdwijnt het daar stil uit de zijbalk)', () => {
    vi.stubEnv('PLATFORM_OMGEVING', 'demo')
    expect(navVoor({ isAdmin: true }).flatMap((g) => g.items).length).toBe(alleItems.length)
  })
})
