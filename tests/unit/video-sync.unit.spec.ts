import { describe, expect, it } from 'vitest'

import {
  activeMomentIndex,
  fmtVideoTime,
  momentToVideo,
  parseVideoSource,
  readSync,
  videoToMoment,
  youtubeEmbedAt,
} from '@/lib/video-sync'

const HALF = 25 * 60 // 1500 s — landelijke/nationale helft

describe('readSync', () => {
  it('leest een geldige ijking', () => {
    expect(readSync({ offsetH1: 12, offsetH2: 1800 })).toEqual({ offsetH1: 12, offsetH2: 1800 })
  })
  it('valt terug op nul/null bij ontbrekende of onbruikbare waarden', () => {
    expect(readSync(null)).toEqual({ offsetH1: 0, offsetH2: null })
    expect(readSync({ offsetH1: 'x', offsetH2: Number.NaN })).toEqual({ offsetH1: 0, offsetH2: null })
  })
  it('klemt een negatieve H1-offset af op 0', () => {
    expect(readSync({ offsetH1: -30 }).offsetH1).toBe(0)
  })
})

describe('momentToVideo', () => {
  const sync = { offsetH1: 60, offsetH2: 2400 }

  it('telt de wedstrijdklok bij de aftrap van helft 1', () => {
    expect(momentToVideo({ half: 1, gameClock: 0 }, sync, HALF)).toBe(60)
    expect(momentToVideo({ half: 1, gameClock: 300 }, sync, HALF)).toBe(360)
  })
  it('gebruikt de geijkte aftrap van helft 2', () => {
    expect(momentToVideo({ half: 2, gameClock: 120 }, sync, HALF)).toBe(2520)
  })
  it('schat helft 2 door wanneer ze nog niet geijkt is (ononderbroken video)', () => {
    const s = { offsetH1: 60, offsetH2: null }
    expect(momentToVideo({ half: 2, gameClock: 0 }, s, HALF)).toBe(60 + HALF)
  })
  it('wordt nooit negatief', () => {
    expect(momentToVideo({ half: 1, gameClock: -10 }, { offsetH1: 0, offsetH2: null }, HALF)).toBe(0)
  })
})

describe('videoToMoment', () => {
  const sync = { offsetH1: 60, offsetH2: 2400 }

  it('is de omgekeerde van momentToVideo', () => {
    for (const m of [{ half: 1, gameClock: 0 }, { half: 1, gameClock: 900 }, { half: 2, gameClock: 450 }]) {
      expect(videoToMoment(momentToVideo(m, sync, HALF), sync, HALF)).toEqual(m)
    }
  })
  it('herkent de tweede helft vanaf haar aftrap', () => {
    expect(videoToMoment(2399, sync, HALF).half).toBe(1)
    expect(videoToMoment(2400, sync, HALF).half).toBe(2)
  })
})

describe('activeMomentIndex', () => {
  const sync = { offsetH1: 0, offsetH2: null }
  const moments = [
    { half: 1, gameClock: 100 },
    { half: 1, gameClock: 200 },
    { half: 2, gameClock: 50 },
  ]

  it('geeft -1 zolang het eerste moment nog niet in zicht is', () => {
    expect(activeMomentIndex(moments, 0, sync, HALF)).toBe(-1)
  })
  it('licht een moment al op tijdens de aanloop (lead)', () => {
    expect(activeMomentIndex(moments, 96, sync, HALF, 4)).toBe(0)
    expect(activeMomentIndex(moments, 95, sync, HALF, 4)).toBe(-1)
  })
  it('volgt mee naar het laatste gepasseerde moment', () => {
    expect(activeMomentIndex(moments, 250, sync, HALF)).toBe(1)
    expect(activeMomentIndex(moments, HALF + 100, sync, HALF)).toBe(2)
  })
})

describe('parseVideoSource', () => {
  it('herkent een eigen clip/pad als bestand', () => {
    expect(parseVideoSource('/api/clip/abc123.mp4')).toEqual({ kind: 'file', src: '/api/clip/abc123.mp4' })
  })
  it('herkent een direct videobestand op een externe host', () => {
    expect(parseVideoSource('https://cdn.example/match.mp4')).toEqual({ kind: 'file', src: 'https://cdn.example/match.mp4' })
  })
  it('herkent YouTube in al zijn vormen', () => {
    for (const u of [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ',
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
      'https://www.youtube.com/live/dQw4w9WgXcQ',
    ]) {
      expect(parseVideoSource(u)).toEqual({ kind: 'youtube', id: 'dQw4w9WgXcQ' })
    }
  })
  it('valt terug op een uitlink bij een niet-insluitbare host', () => {
    expect(parseVideoSource('https://vimeo.com/12345')).toEqual({ kind: 'link', href: 'https://vimeo.com/12345' })
  })
  it('geeft null bij leeg of onbruikbaar', () => {
    expect(parseVideoSource('')).toBeNull()
    expect(parseVideoSource(null)).toBeNull()
    expect(parseVideoSource('   ')).toBeNull()
  })
  it('weigert een los woord (geen echte host) — anders bewaren we een typfout als video', () => {
    expect(parseVideoSource('niet-eens-een-url')).toBeNull()
    expect(parseVideoSource('wedstrijd')).toBeNull()
  })
  it('weigert een niet-http(s)-schema', () => {
    expect(parseVideoSource('javascript:alert(1)')).toBeNull()
    expect(parseVideoSource('file:///etc/passwd')).toBeNull()
  })
  it('aanvaardt een host zonder schema (die vullen we aan)', () => {
    expect(parseVideoSource('youtu.be/dQw4w9WgXcQ')).toEqual({ kind: 'youtube', id: 'dQw4w9WgXcQ' })
  })
})

describe('youtubeEmbedAt', () => {
  it('start op de gevraagde (afgeronde) seconde', () => {
    expect(youtubeEmbedAt('abc123', 91.7)).toContain('start=91')
  })
  it('klemt een negatieve start af op 0', () => {
    expect(youtubeEmbedAt('abc123', -5)).toContain('start=0')
  })
})

describe('fmtVideoTime', () => {
  it('toont mm:ss onder een uur en h:mm:ss erboven', () => {
    expect(fmtVideoTime(0)).toBe('00:00')
    expect(fmtVideoTime(65)).toBe('01:05')
    expect(fmtVideoTime(3725)).toBe('1:02:05')
  })
})
