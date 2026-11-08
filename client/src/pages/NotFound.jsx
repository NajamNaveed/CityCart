import { Compass } from 'lucide-react'
import { Button, EmptyState, eyebrow, shell } from '../design'
import { usePageMeta } from '../hooks/usePageMeta'

export default function NotFound() {
  usePageMeta({ title: 'Page not found', noindex: true })

  return (
    <div className="bg-canvas">
      <div className={`${shell} flex min-h-[56vh] flex-col justify-center py-16 sm:py-20`}>
        <div className="mx-auto w-full max-w-xl">
          <h1 className="sr-only">Page not found</h1>
          <p className={`text-center ${eyebrow}`}>404 — off the map</p>
          <EmptyState
            icon={Compass}
            title="That page doesn't exist."
            message="The link may be old, or the address was typed wrong. Your block is still right where you left it."
            className="mt-5"
            action={
              <div className="flex flex-wrap justify-center gap-2.5">
                <Button to="/" tone="noir" size="md">
                  Back to home
                </Button>
                <Button to="/nearby" tone="outline" size="md">
                  Browse stores
                </Button>
              </div>
            }
          />
        </div>
      </div>
    </div>
  )
}
