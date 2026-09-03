import { describe, it, expect } from 'vitest'

import {
  CAMERA2_BASIS,
  naarTijdlijnCamera1,
  samenvoegen,
  tweedeCameraKlaar,
  voegDetectiesSamen,
} from '@/lib/cv-samenvoegen'

// Twee camera's, één wedstrijd. De valkuil van dit hele deelsysteem is het midden van het veld:
// een worp over de middellijn zien béide camera's, en zonder ontdubbeling telt die dubbel — in de
// voorstellen, in de modelscore en straks in de overgezette wedstrijd. Deze tests pinnen de
// tijdlijn-omrekening, de ontdubbelregels en de werper-namespacing vast.

const worp = (extra: Record<string, unknown>): Record<string, unknown> => ({
  match_id: 1,
  video_time_s: 100,
  event_type: 'worp',
  confidence: 0.7,
  ...extra,
})

const metLanding = (t: number, xM: number, yM: number, extra: Record<string, unknown> = {}) =>
  worp({ video_time_s: t, zone: { in_doelgebied: false, x_m: xM, y_m: yM }, ...extra })

describe('naarTijdlijnCamera1', () => {
  it('rekent camera 2-tijden om naar de tijdlijn van camera 1', () => {
    // Seconde 0 van camera 1 valt op seconde 12,5 in camera 2 → t1 = t2 − 12,5.
    const { regels } = naarTijdlijnCamera1([worp({ video_time_s: 112.5 })], 12.5)
    expect(regels[0].video_time_s).toBe(100)
    expect(regels[0].camera).toBe(2)
  })

  it('mag een negatief tijdsverschil aan (camera 2 startte later)', () => {
    const { regels } = naarTijdlijnCamera1([worp({ video_time_s: 10 })], -30)
    expect(regels[0].video_time_s).toBe(40)
  })

  it('laat vallen wat vóór het begin van camera 1 gebeurde, en telt dat', () => {
    // Wat op t1 < 0 valt kan nergens op de tijdlijn staan — tellen, niet stilzwijgend weg.
    const { regels, buitenTijdlijn } = naarTijdlijnCamera1(
      [worp({ video_time_s: 5 }), worp({ video_time_s: 20 })],
      10,
    )
    expect(regels).toHaveLength(1)
    expect(regels[0].video_time_s).toBe(10)
    expect(buitenTijdlijn).toBe(1)
  })

  it('geeft werpers van camera 2 een eigen nummerbereik', () => {
    // "Werper 3" van camera 1 en "werper 3" van camera 2 zijn twee verschillende mensen: de
    // volgnummers beginnen per video opnieuw.
    const { regels } = naarTijdlijnCamera1([worp({ video_time_s: 50, werper: 3 })], 0)
    expect(regels[0].werper).toBe(3 + CAMERA2_BASIS)
  })
})

describe('voegDetectiesSamen', () => {
  it('herkent dezelfde worp bij beide camera\'s en houdt er één over', () => {
    const { regels, rapport } = voegDetectiesSamen(
      [metLanding(100, 7, 30)],
      [metLanding(100.4, 7.5, 31, { camera: 2 })],
    )
    expect(regels).toHaveLength(1)
    expect(rapport.ontdubbeld).toBe(1)
    // De winnaar weet dat beide camera's hem zagen — dat onderscheid heeft de training nodig.
    expect(regels[0].beide_cameras).toBe(true)
  })

  it('markeert een worp die maar één camera zag níét als door beide gezien', () => {
    const { regels } = voegDetectiesSamen([metLanding(100, 7, 30)], [metLanding(300, 7, 40, { camera: 2 })])
    expect(regels.every((r) => r.beide_cameras !== true)).toBe(true)
  })

  it('houdt de kant mét landingspunt over, wat de zekerheid ook zegt', () => {
    // Camera 1 zag de worp maar de bal verliet zijn beeld; camera 2 zag waar hij viel. Dan is
    // camera 2 de bruikbare kant — een voorstel zonder landingspunt kan nooit een worp worden.
    const { regels } = voegDetectiesSamen(
      [worp({ video_time_s: 100, confidence: 0.9 })],
      [metLanding(100.3, 7, 30, { camera: 2, confidence: 0.4 })],
    )
    expect(regels).toHaveLength(1)
    expect(regels[0].camera).toBe(2)
    expect(regels[0].zone).toBeTruthy()
  })

  it('kiest bij twee landingspunten de hoogste zekerheid, en bij gelijkspel camera 1', () => {
    const zeker = voegDetectiesSamen(
      [metLanding(100, 7, 30, { confidence: 0.5 })],
      [metLanding(100.2, 7, 30.5, { camera: 2, confidence: 0.8 })],
    )
    expect(zeker.regels[0].camera).toBe(2)

    const gelijk = voegDetectiesSamen(
      [metLanding(100, 7, 30, { confidence: 0.6 })],
      [metLanding(100.2, 7, 30.5, { camera: 2, confidence: 0.6 })],
    )
    expect(gelijk.regels[0].camera).toBe(1)
  })

  it('laat twee worpen staan die binnen het venster maar ver uit elkaar landen', () => {
    // Kort na elkaar is niet genoeg: landen ze tien meter uit elkaar, dan zijn het twee worpen
    // (bijvoorbeeld een snelle pass-worp aan elke kant van het veld).
    const { regels, rapport } = voegDetectiesSamen(
      [metLanding(100, 2, 10)],
      [metLanding(100.5, 12, 40, { camera: 2 })],
    )
    expect(regels).toHaveLength(2)
    expect(rapport.ontdubbeld).toBe(0)
  })

  it('ontdubbelt nooit binnen dezelfde camera', () => {
    // Twee detecties van dezelfde camera kort na elkaar zijn het oordeel van de detector.
    const { regels } = voegDetectiesSamen(
      [metLanding(100, 7, 30), metLanding(100.5, 7, 31)],
      [],
    )
    expect(regels).toHaveLength(2)
  })

  it('koppelt greedy op de kleinste tijdsafstand', () => {
    // Camera 2 zag één worp; camera 1 twee vlak na elkaar. Het paar met het kleinste verschil
    // wint, de andere camera 1-worp blijft gewoon staan.
    const { regels, rapport } = voegDetectiesSamen(
      [metLanding(100, 7, 30, { confidence: 0.9 }), metLanding(101.5, 7, 30, { confidence: 0.9 })],
      [metLanding(101.4, 7, 30, { camera: 2, confidence: 0.5 })],
    )
    expect(rapport.ontdubbeld).toBe(1)
    expect(regels).toHaveLength(2)
    expect(regels.map((r) => r.video_time_s)).toEqual([100, 101.5])
  })

  it('sorteert het resultaat op tijd', () => {
    const { regels } = voegDetectiesSamen(
      [metLanding(200, 7, 30)],
      [metLanding(50, 7, 12, { camera: 2 }), metLanding(120, 7, 40, { camera: 2 })],
    )
    expect(regels.map((r) => r.video_time_s)).toEqual([50, 120, 200])
  })

  it('herkent ook een uitbal-paar aan het onbeknot landingspunt', () => {
    // Een uitbal draagt zijn punt in uitbal_x_m/uitbal_y_m (geen zone) — dat punt telt mee
    // als landingspunt, anders wint een kant zonder enige plek van een kant mét.
    const { regels } = voegDetectiesSamen(
      [worp({ video_time_s: 100, confidence: 0.9 })],
      [worp({ video_time_s: 100.2, camera: 2, confidence: 0.4, uitbal: true, uitbal_x_m: -0.4, uitbal_y_m: 20 })],
    )
    expect(regels).toHaveLength(1)
    expect(regels[0].uitbal).toBe(true)
  })
})

describe('samenvoegen', () => {
  it('doet omrekening en ontdubbeling in één beweging, met een eerlijk rapport', () => {
    const { regels, rapport } = samenvoegen(
      [metLanding(100, 7, 30)],
      [
        metLanding(112.4, 7.3, 30.5, { werper: 2 }), // = 100.4 op de tijdlijn van camera 1 → duplicaat
        metLanding(160, 10, 40, { werper: 2 }), // = 148 → nieuw, enkel camera 2 zag hem
        metLanding(4, 3, 12), // vóór het begin van camera 1
      ],
      12,
    )
    expect(rapport).toEqual({ camera1: 1, camera2: 2, ontdubbeld: 1, buitenTijdlijn: 1 })
    expect(regels).toHaveLength(2)
    expect(regels[1].video_time_s).toBe(148)
    expect(regels[1].werper).toBe(2 + CAMERA2_BASIS)
  })
})

describe('tweedeCameraKlaar', () => {
  it('is klaar met een opname én een geijkt tijdsverschil', () => {
    expect(tweedeCameraKlaar({ video2Url: '/api/clip/abc.mp4', video2OffsetS: -3.5 })).toEqual({ klaar: true })
  })

  it('zegt wat er ontbreekt', () => {
    expect(tweedeCameraKlaar({ video2Url: null, video2OffsetS: 0 }).klaar).toBe(false)
    const zonderIjk = tweedeCameraKlaar({ video2Url: '/api/clip/abc.mp4', video2OffsetS: null })
    expect(zonderIjk.klaar).toBe(false)
    if (!zonderIjk.klaar) expect(zonderIjk.reden).toContain('tijdsverschil')
  })
})
