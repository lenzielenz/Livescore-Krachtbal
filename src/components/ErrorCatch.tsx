'use client'

import { Component, type ReactNode } from 'react'

// Kleine herbruikbare error-boundary: vangt render-/interactiefouten van één onderdeel op
// (werkt ook tijdens server-rendering) en toont een nette inline-melding met herprobeer-knop,
// i.p.v. de hele pagina te laten crashen.
export class ErrorCatch extends Component<
  { children: ReactNode; fallback?: ReactNode; label?: string },
  { hasError: boolean }
> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: unknown) {
    // Zichtbaar in de browserconsole/serverlog voor diagnose, zonder de gebruiker te storen.
    console.error('ErrorCatch:', this.props.label ?? '', error)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback !== undefined) return this.props.fallback
      return (
        <p className="empty">
          {this.props.label ?? 'Dit onderdeel'} kon niet laden.{' '}
          <button
            type="button"
            onClick={() => this.setState({ hasError: false })}
            style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', textDecoration: 'underline' }}
          >
            Opnieuw proberen
          </button>
        </p>
      )
    }
    return this.props.children
  }
}
