import { View } from 'react-native'
import Feather from '@expo/vector-icons/Feather'
import AppText from './ui/AppText'
import { stageRows } from '../services/orders'
import { formatDateTime } from '../utils/format'
import { colors, spacing } from '../theme'

const LOOKS = {
  done: { ring: colors.success, fill: colors.success, icon: colors.white, text: colors.ink, line: colors.success },
  current: { ring: colors.warning, fill: colors.warningSoft, icon: colors.warning, text: colors.ink, line: colors.line },
  ahead: { ring: colors.line, fill: colors.surface, icon: colors.muted, text: colors.muted, line: colors.line },
}

// The order's journey, top to bottom: Placed -> Confirmed -> ... -> Delivered.
export default function OrderProgress({ history, orderStatus }) {
  const rows = stageRows(history, orderStatus)
  return (
    <View accessibilityRole="list">
      {rows.map((row, i) => {
        const look = LOOKS[row.state]
        const last = i === rows.length - 1
        const when = row.at ? formatDateTime(row.at) : ''
        return (
          <View
            key={row.status}
            accessible
            accessibilityLabel={`${row.label}: ${row.state === 'done' ? 'done' : row.state === 'current' ? 'in progress' : 'not yet'}${when ? `, ${when}` : ''}`}
            style={{ flexDirection: 'row', gap: spacing.md }}
          >
            <View style={{ alignItems: 'center' }}>
              <View style={{ width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: look.ring, backgroundColor: look.fill, alignItems: 'center', justifyContent: 'center' }}>
                <Feather name={row.icon} size={15} color={look.icon} />
              </View>
              {!last ? <View style={{ width: 2, flex: 1, minHeight: 18, backgroundColor: look.line }} /> : null}
            </View>
            <View style={{ flex: 1, paddingBottom: last ? 0 : spacing.md, justifyContent: 'flex-start' }}>
              <AppText variant="label" style={{ color: look.text, marginTop: 5 }}>
                {row.label}
              </AppText>
              {when ? (
                <AppText variant="small" style={{ fontSize: 12 }}>
                  {when}
                </AppText>
              ) : null}
            </View>
          </View>
        )
      })}
    </View>
  )
}
