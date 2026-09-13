import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { MatchActivitySummary } from '@/app/(frontend)/match/[id]/MatchActivitySummary'

describe('MatchActivitySummary', () => {
  it('bundelt blijvende reacties, berichten en foto’s', () => {
    render(
      <MatchActivitySummary
        reactions={{ clap: 12, heart: 4 }}
        shouts={[{ id: 1, name: 'Robin', text: 'Sterke wedstrijd!', at: 100 }]}
        photos={[{ id: 2, url: '/foto.jpg', authorName: 'Supporter', at: 200 }]}
      />,
    )

    expect(screen.getByText('18')).toBeInTheDocument()
    expect(screen.getByText('16')).toBeInTheDocument()
    expect(screen.getByText('Sterke wedstrijd!')).toBeInTheDocument()
    expect(screen.getByAltText('Supporterfoto van Supporter')).toBeInTheDocument()
  })

  it('toont geen leeg samenvattingsblok', () => {
    const { container } = render(<MatchActivitySummary reactions={{}} shouts={[]} photos={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
