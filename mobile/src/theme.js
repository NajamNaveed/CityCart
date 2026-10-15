// The web app's design tokens (client/src/index.css), so the two look like one product.
export const colors = {
  paper: '#f8f9fa', // page background
  surface: '#ffffff', // cards, bars
  cream: '#fdf5ed', // warm accent wash
  sand: '#f0e9df', // image placeholders
  line: '#e7e5e4', // hairlines
  ink: '#020617', // primary text, solid buttons
  inkSoft: '#0f172a',
  muted: '#64748b', // secondary text
  clay: '#b6472a', // the shop's accent
  clayDark: '#98381f',
  pine: '#1e3a2f', // seller side (not used in the shopper app)
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
export const radius = { sm: 6, md: 8, lg: 12, pill: 999 }
// Smallest comfortable tap target (Apple and Google both recommend about 44-48).
export const minTouch = 48
