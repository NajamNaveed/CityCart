import { useState } from 'react'
import { ArrowRight, Inbox, MapPin, Plus, Search, Star } from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  PageHeader,
  SectionHead,
  Skeleton,
  Tabs,
  accent,
  arrowLink,
  body,
  caption,
  display,
  eyebrow,
  eyebrowOnDark,
  iconBtn,
  iconBtnLight,
  lede,
  meta,
  panel,
  panelDark,
  shell,
  textLink,
} from '../design'

const starBadge = 'inline-flex items-center gap-1.5 text-[12px] font-semibold'

const SURFACES = [
  { name: 'Canvas', hex: '#f8f2e7', className: 'bg-canvas text-ink' },
  { name: 'Paper warm', hex: '#fffcf6', className: 'bg-paper-warm text-ink' },
  { name: 'Sand', hex: '#f0e9df', className: 'bg-sand text-ink' },
  { name: 'Line warm', hex: '#e7ddcb', className: 'bg-line-warm text-ink' },
  { name: 'Cream', hex: '#fdf5ed', className: 'bg-cream text-ink' },
  { name: 'Sage', hex: '#dce5d8', className: 'bg-sage text-forest' },
  { name: 'Clay', hex: '#b6472a', className: 'bg-clay text-white' },
  { name: 'Noir', hex: '#15140f', className: 'bg-noir text-cream' },
  { name: 'Noir soft', hex: '#24211b', className: 'bg-noir-soft text-cream' },
  { name: 'Forest', hex: '#1c3a2e', className: 'bg-forest text-cream' },
]

const TONES = ['primary', 'noir', 'cream', 'outline', 'ghost']

function Block({ title, note, children }) {
  return (
    <section className="border-t border-line-warm py-12">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className={display.sm}>{title}</h2>
        {note && <p className={caption}>{note}</p>}
      </div>
      <div className="mt-6">{children}</div>
    </section>
  )
}

export default function DesignSystem() {
  const [tab, setTab] = useState('all')

  return (
    <div className={`${shell} pb-20 pt-12`}>
      <PageHeader
        eyebrow="Phase 4 · design system"
        title="The v3 system,"
        accent="frozen."
        lede="The landing's approved tokens and components in one place. Customer surfaces use these; dashboards keep the older set until their usability pass."
        actions={
          <>
            <Button tone="noir" size="md">
              Primary action
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
            <Button tone="outline" size="md">
              Secondary
            </Button>
          </>
        }
      />

      <Block title="Colour" note="Surfaces, ink and accents">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {SURFACES.map((swatch) => (
            <div key={swatch.name} className={`rounded-card border border-line-warm ${swatch.className} p-4`}>
              <p className="text-[12px] font-semibold">{swatch.name}</p>
              <p className="mt-6 font-mono text-[10.5px] opacity-60">{swatch.hex}</p>
            </div>
          ))}
        </div>
      </Block>

      <Block title="Type" note="Fraunces display, Poppins UI">
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <p className={`${eyebrow} mb-3`}>Display xl</p>
            <p className={display.xl}>
              One bag.
              <br />
              <em className={accent}>The whole block.</em>
            </p>
            <p className={`${eyebrow} mb-3 mt-8`}>Display lg</p>
            <p className={display.lg}>
              Good things,
              <br />
              <em className={accent}>close to home.</em>
            </p>
          </div>
          <div>
            <p className={`${eyebrow} mb-3`}>Display md / sm</p>
            <p className={display.md}>Stores on your street.</p>
            <p className={`${display.sm} mt-4`}>Card and panel titles</p>
            <p className={`${lede} mt-6`}>
              Lede text introduces a section without competing with the headline. It stays at a comfortable measure.
            </p>
            <p className={`${body} mt-3`}>Body text carries descriptions, order notes and form help.</p>
            <p className={`${meta} mt-3`}>Meta text · 11.5px · dates and counts</p>
            <p className={`${caption} mt-3`}>Caption · uppercase · labels</p>
            <p className={`${textLink} mt-4 inline-block`}>Text link</p>
            <span className={`${arrowLink} ml-6`}>Arrow link</span>
          </div>
        </div>
      </Block>

      <Block title="Buttons" note="Tones, sizes, disabled">
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            {TONES.map((tone) => (
              <Button key={tone} tone={tone}>
                {tone}
              </Button>
            ))}
            <Button tone="primary" disabled>
              Disabled
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button tone="primary" size="sm">
              Small
            </Button>
            <Button tone="primary" size="md">
              Medium
            </Button>
            <Button tone="primary" size="lg">
              Large
            </Button>
          </div>
          <div className={`${panelDark} flex flex-wrap items-center gap-3 p-6`}>
            <Button tone="cream">Cream</Button>
            <Button tone="outlineLight">Outline light</Button>
            <Button tone="ghostLight">Ghost light</Button>
            <span className="ml-2 flex gap-2">
              <button type="button" className={iconBtnLight} aria-label="Light icon button">
                <Plus className="h-4 w-4" aria-hidden="true" />
              </button>
              <button type="button" className={iconBtnLight} aria-label="Light search">
                <Search className="h-4 w-4" aria-hidden="true" />
              </button>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className={iconBtn} aria-label="Icon button">
              <Plus className="h-4 w-4" aria-hidden="true" />
            </button>
            <button type="button" className={iconBtn} aria-label="Search">
              <Search className="h-4 w-4" aria-hidden="true" />
            </button>
            <p className={`${meta} ml-2`}>Icon buttons</p>
          </div>
        </div>
      </Block>

      <Block title="Fields" note="Input, select, textarea, error, hint">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Your name" placeholder="Ayesha Khan" hint="As it should appear on the parcel." />
          <Field label="Email" type="email" placeholder="you@example.com" error="That email is not valid." />
          <Field as="select" label="City" defaultValue="lahore">
            <option value="lahore">Lahore</option>
            <option value="islamabad">Islamabad</option>
            <option value="faisalabad">Faisalabad</option>
          </Field>
          <Field as="textarea" label="Delivery note" placeholder="Gate code, landmark, floor…" />
          <Field label="Disabled" defaultValue="Not editable" disabled />
        </div>
      </Block>

      <Block title="Badges" note="Soft, noir, clay, sage">
        <div className="flex flex-wrap items-center gap-2.5">
          <Badge>New on CityCart</Badge>
          <Badge tone="noir">Your block</Badge>
          <Badge tone="clay">20% off</Badge>
          <Badge tone="sage">Open now</Badge>
        </div>
      </Block>

      <Block title="Cards" note="Shopper card, panel, dark panel">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <Card lift padded={false} className="overflow-hidden">
            <div className="relative flex aspect-[4/3] items-center justify-center bg-sand">
              <span className="font-display text-4xl italic text-ink/15">Cc</span>
              <span className="absolute left-3 top-3">
                <Badge>
                  <MapPin className="h-3 w-3 text-clay" aria-hidden="true" />
                  850 m away
                </Badge>
              </span>
            </div>
            <div className="p-4">
              <p className="font-display text-[19px] font-semibold tracking-tight text-ink">Loom & Co.</p>
              <p className={`${meta} mt-1`}>Block D · 2 branches</p>
              <div className="mt-4 flex items-end justify-between border-t border-line-warm pt-3.5">
                <p>
                  <span className={`${meta} block`}>From</span>
                  <span className="text-[14px] font-semibold text-ink">Rs 1,200</span>
                </p>
                <Button tone="noir" size="sm">
                  Visit
                  <ArrowRight className="h-3 w-3" aria-hidden="true" />
                </Button>
              </div>
            </div>
          </Card>
          <div className={`${panel} p-5`}>
            <p className={eyebrow}>Warm panel</p>
            <p className={`${display.sm} mt-3`}>Paper-warm surface</p>
            <p className={`${body} mt-2`}>Used for forms, summaries and quiet content blocks.</p>
          </div>
          <div className={`${panelDark} p-5`}>
            <p className={eyebrowOnDark}>Dark panel</p>
            <p className={`${display.sm} mt-3 text-cream`}>Noir surface</p>
            <p className="mt-2 text-[13px] leading-relaxed text-cream/60">Used for promises, the footer and closing calls to action.</p>
          </div>
        </div>
      </Block>

      <Block title="States" note="Empty, error, loading">
        <div className="grid gap-5 lg:grid-cols-2">
          <EmptyState
            icon={Inbox}
            title="No orders yet"
            message="When you order from a shop on your block, it will show up here."
            action={<Button tone="primary" size="sm">Browse your block</Button>}
          />
          <ErrorState
            message="We could not load this section. Check your connection and try again."
            onRetry={() => {}}
          />
        </div>
        <div className="mt-5 grid gap-5 sm:grid-cols-3">
          {[0, 1, 2].map((key) => (
            <Card key={key} padded={false} className="overflow-hidden">
              <Skeleton className="aspect-[4/3] w-full rounded-none" />
              <div className="space-y-2 p-4">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </Card>
          ))}
        </div>
      </Block>

      <Block title="Tabs" note="Filters and account sections">
        <Tabs
          label="Order filters"
          value={tab}
          onChange={setTab}
          items={[
            { value: 'all', label: 'All orders', count: 12 },
            { value: 'active', label: 'In progress', count: 3 },
            { value: 'past', label: 'Delivered', count: 9 },
          ]}
        />
        <p className={`${body} mt-4`}>Selected: {tab}</p>
      </Block>

      <Block title="Section header" note="Landing pattern">
        <SectionHead
          index="01"
          eyebrow="Shop your block"
          title="Stores on your street."
          accent="Not across town."
          lede="Numbered sections introduce landing content and link onward to the full directory."
          to="/nearby"
          linkLabel="All shops"
        />
      </Block>

      <div className="mt-12 rounded-panel border border-line-warm bg-paper-warm p-6">
        <p className={eyebrow}>Hover states</p>
        <div className="mt-4 flex items-center gap-3">
          <span className={`${starBadge} text-clay`}>
            <Star className="h-4 w-4 fill-clay" aria-hidden="true" />
            4.8
          </span>
          <span className={meta}>Cards lift 4px, links slide, buttons shift tone — all disabled under reduced motion.</span>
        </div>
      </div>
    </div>
  )
}
