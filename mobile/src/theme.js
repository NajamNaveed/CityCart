// The web app's v3 customer accents (clay, forest, warm washes) on a clean
// white canvas, so the shopper app reads light and the two look like one product.
export const colors = {
  paper: '#ffffff', // canvas: page background
  surface: '#ffffff', // cards, bars, sheets; separated by hairlines
  cream: '#fdf5ed', // warm accent wash
  sand: '#f2f0eb', // image placeholders, quiet wells
  line: '#e5e3dd', // hairlines
  ink: '#15140f', // noir: primary text, solid buttons
  inkSoft: '#24211b',
  // Darker than the web's slate-500 so small text clears WCAG AA (4.5:1) on
  // the canvas (5.01:1), cards (5.45:1) and sand wells (4.63:1).
  muted: '#5d6979',
  clay: '#b6472a', // the shop's accent
  clayDark: '#98381f',
  pine: '#1c3a2e', // forest: service providers
  success: '#15803d',
  successSoft: '#ecfdf3',
  warning: '#b45309',
  warningSoft: '#fff8eb',
  danger: '#b42318',
  dangerSoft: '#fef3f2',
  info: '#175cd3',
  infoSoft: '#eff6ff',
  white: '#ffffff',
}

// Loaded in the root layout. Poppins for text, Fraunces for headings, like the web.
export const fonts = {
  regular: 'Poppins_400Regular',
  medium: 'Poppins_500Medium',
  semibold: 'Poppins_600SemiBold',
  bold: 'Poppins_700Bold',
  display: 'Fraunces_600SemiBold',
}

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 }
// v3 tile (10) and card (14); sheets round to a 20-point panel.
export const radius = { sm: 6, md: 10, lg: 14, panel: 20, pill: 999 }
// Smallest comfortable tap target (Apple and Google both recommend about 44-48).
export const minTouch = 48
