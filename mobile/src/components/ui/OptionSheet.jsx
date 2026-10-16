import { FlatList, Modal, Pressable, View } from 'react-native'
import Feather from '@expo/vector-icons/Feather'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors, minTouch, radius, spacing } from '../../theme'
import AppText from './AppText'

/**
 * A bottom sheet with one choice to make: city, sort order, brand.
 * options: [{ value, label, hint? }]. Tapping outside, or the Android back
 * button, closes it without choosing.
 */
export default function OptionSheet({ visible, title, options, selected, onSelect, onClose, emptyText = 'Nothing to choose from.' }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable onPress={onClose} accessibilityLabel="Close" style={{ flex: 1, backgroundColor: 'rgba(2,6,23,0.45)' }} />
      <SafeAreaView
        edges={['bottom']}
        style={{
          backgroundColor: colors.surface,
          borderTopLeftRadius: radius.lg * 1.5,
          borderTopRightRadius: radius.lg * 1.5,
          maxHeight: '70%',
        }}
      >
        <View style={{ padding: spacing.lg, paddingBottom: spacing.sm }}>
          <AppText variant="heading" accessibilityRole="header" style={{ fontSize: 20 }}>
            {title}
          </AppText>
        </View>
        <FlatList
          data={options}
          keyExtractor={(option) => String(option.value)}
          ListEmptyComponent={
            <AppText variant="small" style={{ padding: spacing.lg }}>
              {emptyText}
            </AppText>
          }
          renderItem={({ item }) => {
            const active = item.value === selected
            return (
              <Pressable
                onPress={() => onSelect(item.value)}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                style={({ pressed }) => ({
                  minHeight: minTouch,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingHorizontal: spacing.lg,
                  paddingVertical: spacing.sm,
                  backgroundColor: pressed ? colors.sand : colors.surface,
                })}
              >
                <View style={{ flex: 1, paddingRight: spacing.md }}>
                  <AppText variant={active ? 'strong' : 'body'}>{item.label}</AppText>
                  {item.hint ? <AppText variant="small">{item.hint}</AppText> : null}
                </View>
                {active ? <Feather name="check" size={20} color={colors.clay} /> : null}
              </Pressable>
            )
          }}
        />
      </SafeAreaView>
    </Modal>
  )
}
