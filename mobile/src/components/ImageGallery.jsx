import { useRef, useState } from 'react'
import { FlatList, Modal, Pressable, View, useWindowDimensions } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Feather from '@expo/vector-icons/Feather'
import AppText from './ui/AppText'
import ProductImage from './ProductImage'
import { colors, spacing } from '../theme'

/**
 * The product photos: swipe sideways, dots show where you are, tap for a
 * full-screen view that shows the whole photo without cropping. With no photos
 * it shows the product's monogram tile.
 */
export default function ImageGallery({ images = [], name }) {
  const { width, height } = useWindowDimensions()
  const photos = images.length > 0 ? images : [null]
  const [index, setIndex] = useState(0)
  const [viewing, setViewing] = useState(false)
  const listRef = useRef(null)

  const onScrollEnd = (event) => setIndex(Math.round(event.nativeEvent.contentOffset.x / width))
  const frameHeight = width * 1.15

  return (
    <View>
      <FlatList
        data={photos}
        keyExtractor={(src, i) => `${i}-${src}`}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        renderItem={({ item, index: i }) => (
          <Pressable onPress={() => item && setViewing(true)} accessibilityRole="imagebutton" accessibilityLabel={`${name}, photo ${i + 1} of ${photos.length}. Open full screen`}>
            <ProductImage src={item} name={name} width={width} style={{ width, height: frameHeight }} />
          </Pressable>
        )}
      />
      {photos.length > 1 ? (
        <View pointerEvents="none" style={{ position: 'absolute', bottom: spacing.md, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
          {photos.map((_, i) => (
            <View key={i} style={{ width: i === index ? 18 : 6, height: 6, borderRadius: 3, backgroundColor: i === index ? colors.ink : 'rgba(2,6,23,0.25)' }} />
          ))}
        </View>
      ) : null}

      <Modal visible={viewing} animationType="fade" onRequestClose={() => setViewing(false)} statusBarTranslucent>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.md }}>
            <AppText variant="small" style={{ color: '#fff' }}>
              {index + 1} / {photos.length}
            </AppText>
            <Pressable onPress={() => setViewing(false)} accessibilityRole="button" accessibilityLabel="Close photo" hitSlop={10}>
              <Feather name="x" size={28} color="#fff" />
            </Pressable>
          </View>
          <FlatList
            ref={listRef}
            data={photos}
            keyExtractor={(src, i) => `full-${i}-${src}`}
            horizontal
            pagingEnabled
            initialScrollIndex={index}
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onScrollEnd}
            getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
            renderItem={({ item }) => <ProductImage src={item} name={name} width={width} resizeMode="contain" style={{ width, height: height * 0.75, backgroundColor: '#000' }} />}
          />
        </SafeAreaView>
      </Modal>
    </View>
  )
}
