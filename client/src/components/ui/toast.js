/**
 * Tiny event-based toast store: call toast() from anywhere, <Toaster />
 * (mounted once in App) renders whatever arrives. Split into its own module
 * so Toaster.jsx stays a components-only file for fast refresh.
 */
let push = () => {}

export function registerToastSink(sink) {
  push = sink
}

export function clearToastSink() {
  push = () => {}
}

export function toast(message, { type = 'info', duration = 3500 } = {}) {
  push({ id: `${Date.now()}-${Math.random()}`, message, type, duration })
}
