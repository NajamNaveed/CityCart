import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react'
import { clearToastSink, registerToastSink } from './toast'

const ICONS = {
  success: CheckCircle2,
  error: TriangleAlert,
  info: Info,
}

const TONES = {
  success: 'border-success/25 [&_svg]:text-success',
  error: 'border-danger/25 [&_svg]:text-danger',
  info: 'border-line [&_svg]:text-muted',
}

export default function Toaster() {
  const [items, setItems] = useState([])

  useEffect(() => {
    let mounted = true
    registerToastSink((item) => {
      if (!mounted) return
      setItems((prev) => [...prev.slice(-3), item])
      setTimeout(() => {
        if (mounted) setItems((prev) => prev.filter((i) => i.id !== item.id))
      }, item.duration)
    })
    return () => {
      mounted = false
      clearToastSink()
    }
  }, [])

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[80] flex w-full max-w-sm flex-col gap-2">
      <AnimatePresence>
        {items.map((item) => {
          const Icon = ICONS[item.type] || Info
          return (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24, transition: { duration: 0.18 } }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className={`pointer-events-auto flex items-start gap-2.5 rounded-lg border bg-white px-4 py-3 shadow-lg shadow-ink/10 ${TONES[item.type] || TONES.info}`}
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p className="flex-1 text-[13px] leading-snug text-ink">{item.message}</p>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => setItems((prev) => prev.filter((i) => i.id !== item.id))}
                className="text-muted/60 transition hover:text-ink"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
