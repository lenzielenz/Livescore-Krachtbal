import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useActionQueue } from '@/lib/use-action-queue'

// fetch-stub: elke test kiest per aanroep wat er gebeurt (ok / server-weigering / netwerkfout).
type FetchPlan = Array<'ok' | 'reject' | 'network'>

function installFetch(plan: FetchPlan, calls: Record<string, unknown>[]) {
  let i = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      calls.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>)
      const mode = plan[Math.min(i++, plan.length - 1)]
      if (mode === 'network') throw new TypeError('fetch failed')
      if (mode === 'reject') return { ok: false, json: async () => ({ error: 'Regelfout' }) } as Response
      return { ok: true, json: async () => ({ ok: true, n: calls.length }) } as Response
    }),
  )
}

describe('useActionQueue', () => {
  beforeEach(() => {
    localStorage.clear()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('verstuurt direct en geeft de response aan onResponse door', async () => {
    const calls: Record<string, unknown>[] = []
    installFetch(['ok'], calls)
    const seen: unknown[] = []
    const { result } = renderHook(() => useActionQueue(1, (d) => seen.push(d)))

    let r: Awaited<ReturnType<typeof result.current.send>> | undefined
    await act(async () => {
      r = await result.current.send({ action: 'throw', opId: 'op-1' })
    })
    expect(r?.status).toBe('ok')
    expect(seen).toHaveLength(1)
    expect(result.current.pendingCount).toBe(0)
  })

  it('toont een server-weigering als fout en queuet ze NIET', async () => {
    const calls: Record<string, unknown>[] = []
    installFetch(['reject'], calls)
    const { result } = renderHook(() => useActionQueue(2, () => {}))

    let r: Awaited<ReturnType<typeof result.current.send>> | undefined
    await act(async () => {
      r = await result.current.send({ action: 'throw', opId: 'op-1' })
    })
    expect(r).toEqual({ status: 'error', message: 'Regelfout' })
    expect(result.current.pendingCount).toBe(0)
    expect(localStorage.getItem('kb-actionqueue-2')).toBeNull()
  })

  it('queuet bij een netwerkfout (localStorage) en stuurt daarna dezelfde opId na', async () => {
    // jsdom meldt navigator.onLine altijd true, dus we simuleren offline via de fetch zelf:
    // twee netwerkfouten (de verzending + de directe hersteelpoging), daarna komt het netwerk terug.
    const calls: Record<string, unknown>[] = []
    installFetch(['network', 'network', 'ok'], calls)
    const seen: unknown[] = []
    const { result } = renderHook(() => useActionQueue(3, (d) => seen.push(d)))

    let r: Awaited<ReturnType<typeof result.current.send>> | undefined
    await act(async () => {
      r = await result.current.send({ action: 'throw', opId: 'op-x' })
    })
    expect(r?.status).toBe('queued')
    await waitFor(() => expect(result.current.offline).toBe(true))
    expect(result.current.pendingCount).toBe(1)
    expect(JSON.parse(localStorage.getItem('kb-actionqueue-3') ?? '[]')).toHaveLength(1)

    // Verbinding terug → flush stuurt exact dezelfde opId opnieuw.
    await act(async () => {
      window.dispatchEvent(new Event('online'))
    })
    await waitFor(() => expect(result.current.pendingCount).toBe(0))
    expect(calls.at(-1)?.opId).toBe('op-x')
    expect(calls.every((c) => c.opId === 'op-x')).toBe(true)
    expect(seen).toHaveLength(1)
    expect(result.current.offline).toBe(false)
  })

  it('bewaart de volgorde: zolang de wachtrij niet leeg is, sluiten nieuwe acties achteraan aan', async () => {
    // op-a faalt (netwerk) en blijft in de wachtrij; op-b sluit dan achteraan aan en mag pas NA
    // de geslaagde heruitzending van op-a op de server aankomen.
    const calls: Record<string, unknown>[] = []
    installFetch(['network', 'network', 'ok', 'ok'], calls)
    const { result } = renderHook(() => useActionQueue(4, () => {}))

    await act(async () => {
      await result.current.send({ action: 'throw', opId: 'op-a' })
    })
    await waitFor(() => expect(result.current.pendingCount).toBe(1))
    await act(async () => {
      await result.current.send({ action: 'undo', opId: 'op-b' })
    })
    await waitFor(() => expect(result.current.pendingCount).toBe(0))
    // De laatste twee (geslaagde) verzendingen zijn a → b, in die volgorde.
    expect(calls.slice(-2).map((c) => c.opId)).toEqual(['op-a', 'op-b'])
  })

  it('laadt een bewaarde wachtrij bij het mounten en stuurt ze meteen na', async () => {
    localStorage.setItem('kb-actionqueue-5', JSON.stringify([{ action: 'throw', opId: 'op-oud' }]))
    const calls: Record<string, unknown>[] = []
    installFetch(['ok'], calls)
    const seen: unknown[] = []
    const { result } = renderHook(() => useActionQueue(5, (d) => seen.push(d)))

    await waitFor(() => expect(result.current.pendingCount).toBe(0))
    expect(calls[0]?.opId).toBe('op-oud')
    expect(seen).toHaveLength(1)
  })
})
