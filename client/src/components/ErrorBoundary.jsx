import { Component } from 'react'

// React unmounts the whole tree when a render throws, leaving a blank page.
// This keeps a usable screen in front of the user instead.
export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('Unhandled render error:', error, info?.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="flex min-h-screen items-center justify-center bg-paper px-6">
        <div className="max-w-md text-center">
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted">Something went wrong</p>
          <h1 className="font-display mt-3 text-2xl font-semibold tracking-tight text-ink">
            This page could not be shown.
          </h1>
          <p className="mt-3 text-[14px] leading-relaxed text-muted">
            Reload the page to try again. If it keeps happening, come back in a few minutes.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 inline-flex h-11 items-center justify-center rounded-md bg-ink px-6 text-[13px] font-medium uppercase tracking-[0.08em] text-white transition hover:bg-ink-soft"
          >
            Reload
          </button>
        </div>
      </div>
    )
  }
}
