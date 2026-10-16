import { Pressable, TextInput, View } from 'react-native'
import Feather from '@expo/vector-icons/Feather'
import { colors, fonts, minTouch, radius, spacing } from '../../theme'

export default function SearchBar({ value, onChangeText, onSubmit, placeholder = 'Search…', autoFocus = false, label = 'Search' }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: minTouch,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: radius.md,
        backgroundColor: colors.surface,
        paddingLeft: spacing.md,
      }}
    >
      <Feather name="search" size={18} color={colors.muted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        accessibilityLabel={label}
        autoFocus={autoFocus}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        style={{ flex: 1, minHeight: minTouch - 2, paddingHorizontal: spacing.md, fontFamily: fonts.regular, fontSize: 15, color: colors.ink }}
      />
      {value ? (
        <Pressable
          onPress={() => onChangeText('')}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          hitSlop={8}
          style={{ width: minTouch, height: minTouch, alignItems: 'center', justifyContent: 'center' }}
        >
          <Feather name="x" size={18} color={colors.muted} />
        </Pressable>
      ) : null}
    </View>
  )
}
