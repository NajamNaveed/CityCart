/**
 * The shopper app's palette is the web app's v3 customer set. These checks keep
 * the two in step and stop a future tweak from quietly dropping text below the
 * WCAG AA contrast floor.
 */
import { colors, minTouch, radius, spacing } from '../src/theme'

function luminance(hex) {
  const channels = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255)
  const linear = channels.map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4))
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
}

function contrast(foreground, background) {
  const a = luminance(foreground)
  const b = luminance(background)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

describe('the v3 palette on a white canvas', () => {
  it('keeps the pages and cards white, with the web accents', () => {
    expect(colors.paper).toBe('#ffffff')
    expect(colors.surface).toBe('#ffffff')
    expect(colors.line).toBe('#e5e3dd')
    expect(colors.ink).toBe('#15140f')
    expect(colors.pine).toBe('#1c3a2e')
    expect(colors.clay).toBe('#b6472a')
  })

  it('keeps body text and labels at AA on every surface they sit on', () => {
    const pairs = [
      ['ink', 'paper', 7],
      ['ink', 'surface', 7],
      ['ink', 'sand', 7],
      ['muted', 'paper', 4.5],
      ['muted', 'surface', 4.5],
      ['muted', 'sand', 4.5],
      ['clay', 'paper', 4.5],
      ['clay', 'surface', 4.5],
      ['clay', 'cream', 4.5],
      ['white', 'clay', 4.5],
      ['white', 'ink', 7],
      ['white', 'success', 4.5],
      ['white', 'warning', 4.5],
      ['white', 'danger', 4.5],
      ['success', 'successSoft', 4.5],
      ['warning', 'warningSoft', 4.5],
      ['danger', 'dangerSoft', 4.5],
      ['info', 'infoSoft', 4.5],
    ]

    for (const [foreground, background, floor] of pairs) {
      const ratio = contrast(colors[foreground], colors[background])
      expect({ pair: `${foreground} on ${background}`, ratio: Number(ratio.toFixed(2)), meets: ratio >= floor }).toEqual({
        pair: `${foreground} on ${background}`,
        ratio: Number(ratio.toFixed(2)),
        meets: true,
      })
    }
  })
})

describe('sizing', () => {
  it('uses the v3 tile, card and panel corners', () => {
    expect(radius.md).toBe(10)
    expect(radius.lg).toBe(14)
    expect(radius.panel).toBe(20)
  })

  it('leaves a comfortable tap target', () => {
    expect(minTouch).toBeGreaterThanOrEqual(44)
    expect(spacing.xs).toBeLessThan(spacing.sm)
  })
})
