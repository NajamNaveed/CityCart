// The web app's design tokens (client/src/index.css), like the shopper app, but
// the accent is the seller side's pine green, so the two apps are easy to tell apart.
export const colors = {
  paper: '#f8f9fa', // page background
  surface: '#ffffff', // cards, bars
  sand: '#f0e9df', // pressed rows, placeholders
  line: '#e7e5e4', // hairlines
  ink: '#020617', // primary text
  inkSoft: '#0f172a',
  muted: '#64748b', // secondary text
  pine: '#1e3a2f', // this app's accent
  pineDark: '#142a21',
  pineSoft: '#eaf1ed',
  clay: '#b6472a', // trouble
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

// The system font: no font files to download, and nothing to wait for at start.
export const weights = { regular: '400', medium: '500', semibold: '600', bold: '700' }

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 }
export const radius = { sm: 6, md: 8, lg: 12, pill: 999 }
// Smallest comfortable tap target (Apple and Google both recommend about 44-48).
// Riders use this with one hand and often outdoors, so tap targets stay generous.
export const minTouch = 52
