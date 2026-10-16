import { useState } from 'react'
import { Image, PixelRatio, View } from 'react-native'
import AppText from './ui/AppText'
import { optimizedUrl } from '../utils/image'
import { monogram } from '../utils/product'
import { colors } from '../theme'

/**
 * A product photo that always has something to show: the picture, or a quiet
 * monogram tile when there is none or it fails to load. `width` is the width on
 * screen in points; the photo is requested at the phone's real pixel width so a
 * sharp screen gets a sharp image without downloading more than it needs.
 */
export default function ProductImage({ src, name, width = 400, style, resizeMode = 'cover' }) {
  const [failed, setFailed] = useState(false)
  const showImage = Boolean(src) && !failed
  const uri = showImage ? optimizedUrl(src, Math.min(1600, PixelRatio.getPixelSizeForLayoutSize(width))) : null

  return (
    <View style={[{ backgroundColor: colors.sand, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }, style]}>
      {showImage ? (
        <Image
          source={{ uri }}
          accessibilityLabel={name}
          accessible
          resizeMode={resizeMode}
          onError={() => setFailed(true)}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
      ) : (
        <AppText accessibilityLabel={name} style={{ fontSize: 30, letterSpacing: 4, color: colors.clay, opacity: 0.4 }}>
          {monogram(name)}
        </AppText>
      )}
    </View>
  )
}
