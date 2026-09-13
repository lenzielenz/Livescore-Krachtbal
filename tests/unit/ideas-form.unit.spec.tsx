import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { IdeasForm } from '@/app/(frontend)/ideeenbus/IdeasForm'

describe('IdeasForm', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('behoudt het formulier tijdens de async aanvraag en toont daarna de bedanking', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ))

    const { container } = render(<IdeasForm />)
    fireEvent.change(screen.getByPlaceholderText('Kort en duidelijk'), { target: { value: 'Nieuw idee' } })
    fireEvent.change(screen.getByPlaceholderText('Wat wil je graag zien en waarom zou dit helpen?'), {
      target: { value: 'Dit is een voldoende lange omschrijving.' },
    })
    const form = container.querySelector('form')
    expect(form).not.toBeNull()
    fireEvent.submit(form!)

    await waitFor(() => {
      expect(screen.queryByText('Bedankt voor je idee!')).not.toBeNull()
    })
  })
})
