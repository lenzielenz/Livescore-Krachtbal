import { describe, it, expect, afterEach } from 'vitest'
import path from 'path'

import { PYTHON_SHA256, PYTHON_VERSIE, pythonUrl, runtimeMap, runtimePython, verwachteSom } from '@/lib/cv-runtime'

// De analyse-omgeving wordt ná de deploy binnengehaald: een zelfstandige Python plus opencv, op
// het volume. Wat hier getest wordt is de afspraak eromheen — welk bestand, welk controlegetal,
// en waar het terechtkomt. Het downloaden zelf hoort niet in een unit-test thuis.

const oud = { ...process.env }
afterEach(() => {
  process.env.CV_PYTHON_URL = oud.CV_PYTHON_URL
  process.env.CV_RUNTIME_DIR = oud.CV_RUNTIME_DIR
})

describe('pythonUrl', () => {
  it('wijst naar precies de vastgezette versie', () => {
    delete process.env.CV_PYTHON_URL
    const url = pythonUrl()
    expect(url).toContain(PYTHON_VERSIE)
    expect(url).toMatch(/^https:\/\/github\.com\/astral-sh\/python-build-standalone\//)
    // De kleine variant: dezelfde Python, 200 MB minder op het volume.
    expect(url).toContain('install_only_stripped')
  })

  it('laat zich vervangen voor een andere architectuur', () => {
    process.env.CV_PYTHON_URL = 'https://elders/python.tar.gz'
    expect(pythonUrl()).toBe('https://elders/python.tar.gz')
  })
})

describe('verwachteSom', () => {
  it('controleert ons eigen bestand tegen een vastgezette sha256', () => {
    delete process.env.CV_PYTHON_URL
    expect(verwachteSom(pythonUrl())).toBe(PYTHON_SHA256)
    expect(PYTHON_SHA256).toMatch(/^[a-f0-9]{64}$/)
  })

  it('kent het controlegetal van een zelf opgegeven URL niet — en doet dan niet alsof', () => {
    process.env.CV_PYTHON_URL = 'https://elders/python.tar.gz'
    expect(verwachteSom(pythonUrl())).toBeNull()
  })
})

describe('runtimeMap', () => {
  it('zet de omgeving op het volume, naast de video’s', () => {
    delete process.env.CV_RUNTIME_DIR
    expect(runtimeMap().endsWith(path.join('', 'cv-runtime'))).toBe(true)
    expect(runtimePython()).toBe(path.join(runtimeMap(), 'python', 'bin', 'python3'))
  })

  it('is te verplaatsen met CV_RUNTIME_DIR', () => {
    process.env.CV_RUNTIME_DIR = '/data/omgeving'
    expect(runtimeMap()).toBe('/data/omgeving')
  })
})
