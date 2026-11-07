import { Component } from 'react'
import { RotateCcw, TriangleAlert } from 'lucide-react'
import { btn, stateIcon, statePanel } from '../design/tokens'

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
      <div className="flex min-h-screen items-center justify-center bg-canvas px-5 py-16">
        <div className={`${statePanel} w-full max-w-md`}>
          <span className={stateIcon}>
            <TriangleAlert className="h-5 w-5" aria-hidden="true" />
          </span>
          <p className="mt-4 text-[10.5px] font-semibold uppercase tracking-[0.2em] text-ink/45">Something went wrong</p>
          <h1 className="font-display mt-2 text-[22px] font-semibold leading-tight tracking-tight text-ink">
            This page could not be shown.
          </h1>
          <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-ink/60">
            Reload the page to try again. If it keeps happening, come back in a few minutes.
          </p>
          <button type="button" onClick={() => window.location.reload()} className={`${btn('noir', 'md')} mt-6`}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Reload
          </button>
        </div>
      </div>
    )
  }
}
