import { createElement } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { InstagramRecapCard } from '@/app/(frontend)/recap/InstagramRecapCard'

afterEach(cleanup)

describe('weekendrecap-voorvertoning', () => {
  it('gebruikt de periode van de pagina en toont bij succes geen herstelknop', () => {
    render(createElement(InstagramRecapCard, { period: '7 september — 13 september' }))
    expect(screen.getByRole('img').getAttribute('alt')).toContain('7 september — 13 september')
    expect(screen.queryByRole('button', { name: 'Opnieuw laden' })).toBeNull()
    expect(screen.getByRole('link', { name: /Download PNG/ }).getAttribute('download')).toBe('weekend-recap.png')
  })

  it('stopt na een laadfout en probeert pas na een klik opnieuw', () => {
    render(createElement(InstagramRecapCard, { period: '7 september — 13 september' }))
    const image = screen.getByRole('img')
    const originalSrc = image.getAttribute('src')

    fireEvent.error(image)
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getByRole('status').textContent).toContain('De voorvertoning kon niet laden')

    fireEvent.click(screen.getByRole('button', { name: 'Opnieuw laden' }))
    const retriedImage = screen.getByRole('img')
    expect(retriedImage.getAttribute('src')).not.toBe(originalSrc)
    expect(retriedImage.getAttribute('src')).toContain('v=1')
    expect(screen.queryByRole('status')).toBeNull()

    fireEvent.error(retriedImage)
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getByRole('button', { name: 'Opnieuw laden' })).toBeTruthy()
  })
})
