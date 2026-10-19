import { View } from 'react-native'
import AppText from './ui/AppText'
import { humanize } from '../utils/format'
import { colors, radius } from '../theme'

const PROBLEM = new Set(['CANCELLED', 'REJECTED', 'FAILED', 'RETURNED', 'REFUNDED'])

// A neutral label for an order, payment or delivery status; trouble is drawn in the accent colour.
export default function StatusPill({ value, label }) {
  const problem = PROBLEM.has(value)
  return (
    <View style={{ alignSelf: 'flex-start', borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 2, borderColor: problem ? 'rgba(182,71,42,0.3)' : colors.line, backgroundColor: problem ? 'rgba(182,71,42,0.06)' : colors.paper }}>
      <AppText variant="small" style={{ fontSize: 11, lineHeight: 16, letterSpacing: 0.6, textTransform: 'uppercase', color: problem ? colors.clay : colors.ink, fontFamily: 'Poppins_500Medium' }}>
        {label || humanize(value)}
      </AppText>
    </View>
  )
}
