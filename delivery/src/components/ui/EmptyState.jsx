import { View } from 'react-native'
import Feather from '@expo/vector-icons/Feather'
import { colors, radius, spacing } from '../../theme'
import AppText from './AppText'

// A friendly "nothing here" or "something went wrong" block, with an optional action.
export default function EmptyState({ icon = 'inbox', title, message, action, tone = 'default' }) {
  return (
    <View
      style={{
        alignItems: 'center',
        padding: spacing.xl,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: colors.line,
        backgroundColor: colors.surface,
      }}
    >
      <Feather name={icon} size={30} color={tone === 'error' ? colors.danger : colors.muted} />
      <AppText variant="heading" style={{ marginTop: spacing.md, textAlign: 'center', fontSize: 19 }}>
        {title}
      </AppText>
      {message ? (
        <AppText variant="small" style={{ marginTop: spacing.xs, textAlign: 'center' }}>
          {message}
        </AppText>
      ) : null}
      {action ? <View style={{ marginTop: spacing.lg, alignSelf: 'stretch' }}>{action}</View> : null}
    </View>
  )
}
