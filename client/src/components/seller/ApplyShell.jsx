import { Link } from 'react-router-dom'
import { Check, MailCheck } from 'lucide-react'
import ResendVerification from '../ResendVerification'
import { Button, display, eyebrow, lede, shell, stateIconOk } from '../../design'

// Shared frame for the brand and provider applications: a sticky note on the
// left explaining what the form creates, the form itself on the right.
export function ApplyShell({ kicker, title, intro, points = [], login, children }) {
  return (
    <div className={`${shell} grid gap-10 py-10 sm:py-14 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)] lg:gap-14 lg:py-16`}>
      <aside className="lg:sticky lg:top-28 lg:h-fit">
        <p className={eyebrow}>{kicker}</p>
        <h1 className={`${display.lg} mt-3`}>{title}</h1>
        <p className={`mt-4 ${lede}`}>{intro}</p>

        {points.length > 0 && (
          <ul className="mt-7 space-y-3 border-t border-line-warm pt-6">
            {points.map((point) => (
              <li key={point} className="flex items-start gap-2.5 text-[12.5px] leading-relaxed text-ink/65">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sage text-forest">
                  <Check className="h-3 w-3" strokeWidth={2.5} aria-hidden="true" />
                </span>
                {point}
              </li>
            ))}
          </ul>
        )}

        {login && (
          <p className="mt-7 text-[12.5px] text-ink/55">
            {login.lead}{' '}
            <Link to={login.to} className="font-medium text-clay underline-offset-4 hover:underline">
              {login.label}
            </Link>
          </p>
        )}
      </aside>

      <div className="min-w-0">{children}</div>
    </div>
  )
}

// Numbered form section. Fields inside keep the two-column rhythm on wide
// screens; a `wide` child can span the full row.
export function FormSection({ number, title, hint, children }) {
  return (
    <fieldset className="rounded-panel border border-line-warm bg-paper-warm p-5 sm:p-7">
      <legend className="sr-only">{title}</legend>
      <div className="border-b border-line-warm pb-4">
        <div className="flex items-baseline gap-3">
          <span className="font-display text-[15px] font-semibold text-clay">0{number}</span>
          <h2 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h2>
        </div>
        {hint && <p className="mt-1.5 text-[12px] leading-relaxed text-ink/50">{hint}</p>}
      </div>
      <div className="mt-5 grid gap-5 sm:grid-cols-2">{children}</div>
    </fieldset>
  )
}

// Post-submit screen shared by both applications. The email still needs to be
// proven before the shop (or the admin review) can move forward.
export function ApplySent({ kicker, title, intro, email, note, portal, login }) {
  return (
    <div className={`${shell} grid gap-10 py-10 sm:py-14 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)] lg:gap-14 lg:py-16`}>
      <aside className="lg:sticky lg:top-28 lg:h-fit">
        <p className={eyebrow}>{kicker}</p>
        <h1 className={`${display.lg} mt-3`}>{title}</h1>
        <p className={`mt-4 ${lede}`}>{intro}</p>
      </aside>

      <div className="rounded-panel border border-line-warm bg-paper-warm p-6 sm:p-8">
        <span className={stateIconOk}>
          <MailCheck className="h-5 w-5" aria-hidden="true" />
        </span>
        <h2 className="font-display mt-4 text-[22px] font-semibold tracking-tight text-ink">Check your inbox</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink/65">
          We sent a verification link to <span className="font-medium text-ink">{email}</span>. It works once and
          expires in 24 hours.
        </p>
        <p className="mt-5 rounded-tile bg-canvas px-4 py-3 text-[12.5px] leading-relaxed text-ink/60">{note}</p>
        <ResendVerification email={email} portal={portal} className="mt-5" />
        <p className="mt-6 text-[13px] text-ink/55">
          Already verified?{' '}
          <Link to={login.to} className="font-medium text-clay underline-offset-4 hover:underline">
            {login.label}
          </Link>
        </p>
      </div>
    </div>
  )
}

// Submitting from the bottom of a long form needs the same promise as the top.
export function SubmitRow({ submitting, children, note }) {
  return (
    <div className="flex flex-wrap items-center gap-4 pt-1">
      <Button type="submit" tone="noir" size="lg" disabled={submitting} className="w-full sm:w-auto sm:min-w-64">
        {children}
      </Button>
      {note && <p className="max-w-xs text-[11.5px] leading-relaxed text-ink/45">{note}</p>}
    </div>
  )
}
