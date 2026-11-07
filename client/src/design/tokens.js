// Frozen v3 recipes. Pages compose these instead of inventing class strings;
// changing a value here changes it everywhere the design system is used.

export const shell = 'mx-auto w-full max-w-[1200px] px-5'

export const eyebrow = 'text-[11px] font-semibold uppercase tracking-[0.22em] text-ink/45'
export const eyebrowOnDark = 'text-[11px] font-semibold uppercase tracking-[0.22em] text-cream/45'

export const display = {
  xl: 'font-display text-[52px] font-semibold leading-[0.94] tracking-[-0.035em] text-ink sm:text-[76px]',
  lg: 'font-display text-[34px] font-semibold leading-[1.01] tracking-[-0.03em] text-ink sm:text-[46px]',
  md: 'font-display text-[30px] font-semibold leading-[1.04] tracking-[-0.02em] text-ink sm:text-[40px]',
  sm: 'font-display text-[22px] font-semibold leading-tight tracking-[-0.01em] text-ink',
}
export const accent = 'font-normal italic text-clay'

export const lede = 'text-[14px] leading-relaxed text-ink/60 sm:text-[15px]'
export const body = 'text-[13.5px] leading-relaxed text-ink/70'
export const meta = 'text-[11.5px] text-muted'
export const caption = 'text-[10.5px] font-medium uppercase tracking-[0.16em] text-muted'

export const textLink = 'font-medium text-clay underline-offset-4 hover:underline'
export const arrowLink =
  'inline-flex shrink-0 items-center gap-1.5 border-b border-ink/20 pb-1 text-[12.5px] font-medium text-ink/75 transition hover:border-ink hover:text-ink'

const buttonBase =
  'inline-flex shrink-0 items-center justify-center gap-2 rounded-tile font-semibold uppercase tracking-[0.1em] transition-colors duration-200 disabled:pointer-events-none disabled:opacity-50'

const BUTTON_TONES = {
  primary: 'bg-clay text-white hover:bg-clay-dark',
  noir: 'bg-noir text-cream hover:bg-noir-soft',
  cream: 'bg-cream text-noir hover:bg-white',
  outline: 'border border-ink/15 bg-transparent text-ink hover:border-ink/40 hover:bg-ink/5',
  ghost: 'text-ink/70 hover:bg-ink/5 hover:text-ink',
  outlineLight:
    'border border-white/20 bg-transparent text-white/80 hover:border-white/45 hover:bg-white/5 hover:text-white',
  ghostLight: 'text-cream/70 hover:text-cream',
}

const BUTTON_SIZES = {
  sm: 'h-9 px-4 text-[11px]',
  md: 'h-11 px-5 text-[12px]',
  lg: 'h-12 px-6 text-[13px]',
}

export function btn(tone = 'primary', size = 'md') {
  return `${buttonBase} ${BUTTON_TONES[tone] ?? BUTTON_TONES.primary} ${BUTTON_SIZES[size] ?? BUTTON_SIZES.md}`
}

export const iconBtn =
  'inline-flex h-9 w-9 items-center justify-center rounded-full border border-line-warm text-ink/55 transition hover:border-clay hover:text-clay'
export const iconBtnLight =
  'inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 text-white/60 transition hover:border-clay hover:bg-clay hover:text-cream'

export const fieldLabel = 'mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/55'
export const fieldHint = 'mt-1.5 text-[11.5px] text-muted'
export const fieldError = 'mt-1.5 text-[11.5px] text-clay'

const fieldBase =
  'w-full rounded-tile border bg-paper-warm text-[14px] text-ink outline-none transition placeholder:text-muted/60 focus:ring-2 disabled:cursor-not-allowed disabled:bg-canvas disabled:text-muted'
const fieldOk = 'border-line-warm focus:border-ink/40 focus:ring-ink/10'
const fieldBad = 'border-clay focus:border-clay focus:ring-clay/15'

export const fieldShape = {
  input: 'h-11 px-3.5',
  select: 'h-11 px-3.5',
  textarea: 'min-h-28 px-3.5 py-3 leading-relaxed',
}

export function fieldClass({ error = false, shape = 'input', className = '' } = {}) {
  return [fieldBase, error ? fieldBad : fieldOk, fieldShape[shape] ?? fieldShape.input, className]
    .filter(Boolean)
    .join(' ')
}

export const card = 'rounded-card border border-line-warm bg-paper-warm'
export const cardLift =
  'transition duration-300 hover:-translate-y-1 hover:shadow-[0_22px_45px_rgba(21,20,15,0.09)]'
export const panel = 'rounded-panel border border-line-warm bg-paper-warm'
export const panelDark = 'rounded-panel bg-noir text-cream'
export const tile = 'rounded-tile border border-line-warm bg-paper-warm'

const badgeBase =
  'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em]'

const BADGE_TONES = {
  soft: 'bg-cream/90 text-noir backdrop-blur-sm',
  noir: 'bg-noir/90 text-cream backdrop-blur-sm',
  clay: 'bg-clay text-white',
  sage: 'bg-sage text-forest',
}

export function badge(tone = 'soft') {
  return `${badgeBase} ${BADGE_TONES[tone] ?? BADGE_TONES.soft}`
}

export const statePanel =
  'flex flex-col items-center justify-center rounded-panel border border-dashed border-line-warm bg-paper-warm px-6 py-16 text-center'
export const stateIcon = 'flex h-12 w-12 items-center justify-center rounded-tile bg-sand text-clay'
export const stateIconOk = 'flex h-12 w-12 items-center justify-center rounded-tile bg-sage text-forest'

export const skeleton = 'animate-pulse rounded-tile bg-line-warm/60'
