import { View } from 'react-native'
import AppText from './ui/AppText'
import { humanize } from '../utils/format'
import { colors, radius, weights } from '../theme'

const LOOKS = {
  DELIVERED: { fg: colors.success, bg: colors.successSoft, border: 'rgba(21,128,61,0.25)' },
  FAILED: { fg: colors.clay, bg: 'rgba(182,71,42,0.06)', border: 'rgba(182,71,42,0.3)' },
  OUT_FOR_DELIVERY: { fg: colors.pine, bg: colors.pineSoft, border: 'rgba(30,58,47,0.3)' },
}
const NEUTRAL = { fg: colors.ink, bg: colors.paper, border: colors.line }

// A label for a delivery status; trouble and "on the road" stand out, the rest stay quiet.
export default function StatusPill({ value }) {
  const look = LOOKS[value] || NEUTRAL
  return (
    <View style={{ alignSelf: 'flex-start', borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 2, borderColor: look.border, backgroundColor: look.bg }}>
      <AppText variant="small" style={{ fontSize: 11, lineHeight: 16, letterSpacing: 0.6, textTransform: 'uppercase', color: look.fg, fontWeight: weights.medium }}>
        {humanize(value)}
      </AppText>
    </View>
  )
}
