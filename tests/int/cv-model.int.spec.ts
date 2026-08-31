import { existsSync } from 'fs'
import { describe, it, expect } from 'vitest'

import { GET as getModel, POST as postModel } from '@/app/api/cv/model/route'
import { instellingenPad } from '@/lib/cv-training'

// Het getrainde bestand bepaalt hoe élke volgende analyse op deze server beslist wat een worp
// is. Een onbeveiligde POST hierop zou dus betekenen dat een willekeurige bezoeker de
// worpdetectie van iedereen kan verzetten — én rekenwerk kan aanzwengelen. Vandaar deze test.

const verzoek = (methode: 'GET' | 'POST') =>
  new Request('http://localhost/api/cv/model', { method: methode })

describe('POST/GET /api/cv/model', () => {
  it('weigert een niet-ingelogde bezoeker', async () => {
    expect((await getModel(verzoek('GET')))?.status).toBe(401)
    expect((await postModel(verzoek('POST')))?.status).toBe(401)
  })

  it('schrijft niets weg bij een geweigerd verzoek', async () => {
    const bestond = existsSync(instellingenPad())
    await postModel(verzoek('POST'))
    expect(existsSync(instellingenPad())).toBe(bestond)
  })
})
