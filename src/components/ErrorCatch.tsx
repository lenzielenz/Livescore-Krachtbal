'use client'

import { Component, type ReactNode } from 'react'

// Kleine herbruikbare error-boundary: vangt render-/interactiefouten van één onderdeel op
// (werkt ook tijdens server-rendering) en toont een nette inline-melding met herprobeer-knop,
// i.p.v. de hele pagina te laten crashen. De fallback mag een functie zijn die de fout krijgt.
export class ErrorCatch extends Component<
  { children: ReactNode; fallback?: ReactNode | ((error: Error) => ReactNode); label?: string },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: unknown) {
    // Zichtbaar in de browserconsole/serverlog voor diagnose, zonder de gebruiker te storen.
    console.error('ErrorCatch:', this.props.label ?? '', error)
  }

  render() {
    const { error } = this.state
    if (error) {
      const { fallback } = this.props
      if (typeof fallback === 'function') return fallback(error)
      if (fallback !== undefined) return fallback
      return (
        <p className="empty">
          {this.props.label ?? 'Dit onderdeel'} kon niet laden.{' '}
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', textDecoration: 'underline' }}
          >
            Opnieuw proberen
          </button>
          {error.message && (
            <>
              <br />
              <small style={{ opacity: 0.7 }}>{error.message}</small>
            </>
          )}
        </p>
      )
    }
    return this.props.children
  }
}
