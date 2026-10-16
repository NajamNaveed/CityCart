import { useState } from 'react'
import { Pressable } from 'react-native'
import AppText from './ui/AppText'
import { colors } from '../theme'

// Long text (a description, a review) shows a few lines behind "Read more".
export default function ExpandableText({ text, lines = 4, threshold = 220, variant = 'body', style }) {
  const [expanded, setExpanded] = useState(false)
  if (!text) return null
  const long = text.length > threshold
  return (
    <>
      <AppText variant={variant} numberOfLines={long && !expanded ? lines : undefined} style={style}>
        {text}
      </AppText>
      {long ? (
        <Pressable onPress={() => setExpanded((v) => !v)} accessibilityRole="button" hitSlop={8} style={{ alignSelf: 'flex-start', paddingVertical: 4 }}>
          <AppText variant="label" style={{ color: colors.clay }}>
            {expanded ? 'Show less' : 'Read more'}
          </AppText>
        </Pressable>
      ) : null}
    </>
  )
}
