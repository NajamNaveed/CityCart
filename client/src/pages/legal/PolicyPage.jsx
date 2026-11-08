import { Link } from 'react-router-dom'
import { ArrowRight, ChevronRight, FileClock, LifeBuoy, Mail } from 'lucide-react'
import { usePublicSettings } from '../../hooks/usePublicSettings'
import { usePageMeta } from '../../hooks/usePageMeta'
import { Button, eyebrow, lede, shell, textLink } from '../../design'
import { DRAFT_NOTICE, POLICIES, POLICY_LINKS } from './policies'

export default function PolicyPage({ page }) {
  const policy = POLICIES[page]
  const { settings } = usePublicSettings()

  usePageMeta({
    title: policy ? `${policy.title} ${policy.accent}` : 'Policy',
    description: policy?.intro,
  })

  if (!policy) return null

  return (
    <div className="bg-canvas">
      <div className={`${shell} pb-16 pt-6 sm:pt-8`}>
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-[12px] text-ink/45">
          <Link to="/" className="transition hover:text-ink">
            Home
          </Link>
          <ChevronRight className="h-3 w-3" aria-hidden="true" />
          <Link to="/help" className="transition hover:text-ink">
            Help
          </Link>
          <ChevronRight className="h-3 w-3" aria-hidden="true" />
          <span className="max-w-48 truncate text-ink/70" aria-current="page">
            {policy.title} {policy.accent}
          </span>
        </nav>

        <header className="mt-6 max-w-2xl">
          <p className={eyebrow}>Legal · Working draft</p>
          <h1 className="font-display mt-3 text-[34px] font-semibold leading-[1.02] tracking-[-0.03em] text-ink sm:text-[46px]">
            {policy.title} <em className="font-normal italic text-clay">{policy.accent}</em>
          </h1>
          <p className={`mt-4 ${lede}`}>{policy.intro}</p>
        </header>

        <div
          role="note"
          className="mt-7 flex max-w-3xl gap-3 rounded-card border border-clay/25 bg-clay/[0.05] p-5"
        >
          <FileClock className="mt-0.5 h-5 w-5 shrink-0 text-clay" aria-hidden="true" />
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-clay">Being finalised</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink/70">{DRAFT_NOTICE}</p>
            <p className="mt-2 text-[12px] leading-relaxed text-ink/50">
              Until the approved version is published, this page does not create a contract or replace any right you
              have under the law that applies to you.
            </p>
          </div>
        </div>

        <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_19rem] lg:gap-12">
          <article className="max-w-2xl">
            {policy.sections.map((section, index) => (
              <section key={section.id} id={section.id} className="scroll-mt-28 border-t border-line-warm py-7 first:border-t-0 first:pt-0">
                <div className="flex items-baseline gap-3">
                  <span className="text-[11px] font-semibold tabular-nums text-clay/70">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <h2 className="font-display text-[22px] font-semibold tracking-[-0.01em] text-ink">{section.heading}</h2>
                </div>
                {section.paragraphs?.map((text) => (
                  <p key={text} className="mt-3 text-[13.5px] leading-relaxed text-ink/70">
                    {text}
                  </p>
                ))}
                {section.list && (
                  <ul className="mt-3 space-y-2.5">
                    {section.list.map((item) => (
                      <li key={item} className="flex gap-2.5 text-[13.5px] leading-relaxed text-ink/70">
                        <span aria-hidden="true" className="mt-2 h-1 w-1 shrink-0 rounded-full bg-clay" />
                        {item}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}

            <div className="mt-6 flex flex-wrap gap-2.5 border-t border-line-warm pt-7">
              <Button to="/contact" tone="noir" size="md">
                Contact support
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
              <Button to="/help" tone="outline" size="md">
                Back to help
              </Button>
            </div>
          </article>

          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <nav aria-label="On this page" className="rounded-card border border-line-warm bg-paper-warm p-5">
              <p className={eyebrow}>On this page</p>
              <ol className="mt-3 space-y-2 text-[12.5px]">
                {policy.sections.map((section) => (
                  <li key={section.id}>
                    <a href={`#${section.id}`} className="text-ink/60 transition hover:text-clay">
                      {section.heading}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>

            <div className="rounded-card border border-line-warm bg-paper-warm p-5">
              <span className="flex h-9 w-9 items-center justify-center rounded-tile bg-sand text-clay">
                <LifeBuoy className="h-4.5 w-4.5" aria-hidden="true" />
              </span>
              <p className={`mt-3 ${eyebrow}`}>Questions</p>
              <p className="mt-2 text-[12.5px] leading-relaxed text-ink/60">
                {settings.supportEmail
                  ? 'Ask the CityCart team if anything here is unclear.'
                  : 'Use the Help centre or Messages on an order while the support address is being published.'}
              </p>
              {settings.supportEmail ? (
                <a href={`mailto:${settings.supportEmail}`} className={`mt-3 inline-flex items-center gap-1.5 break-all ${textLink}`}>
                  <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {settings.supportEmail}
                </a>
              ) : (
                <Link to="/help" className={`mt-3 inline-flex items-center gap-1.5 ${textLink}`}>
                  Open the Help centre
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              )}
            </div>

            <div className="rounded-card border border-line-warm bg-paper-warm p-5">
              <p className={eyebrow}>Other policies</p>
              <ul className="mt-3 space-y-2 text-[12.5px]">
                {POLICY_LINKS.filter((link) => link.key !== page).map((link) => (
                  <li key={link.key}>
                    <Link to={link.to} className="text-ink/60 transition hover:text-clay">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
