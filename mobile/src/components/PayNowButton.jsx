import { useState } from 'react'
import { Linking, View } from 'react-native'
import AppText from './ui/AppText'
import Button from './ui/Button'
import { getErrorMessage } from '../services/api'
import { startOnlinePayment } from '../services/orders'
import { colors, spacing } from '../theme'

// "Pay now" for one order paid online: asks the server for the gateway page and opens it in the
// phone's browser. Coming back to the app, the order screen refreshes and shows if it was paid.
export default function PayNowButton({ orderId, title = 'Pay now' }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function pay() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const { checkoutUrl } = await startOnlinePayment(orderId)
      await Linking.openURL(checkoutUrl)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={{ gap: spacing.xs }}>
      <Button title={title} onPress={pay} loading={busy} />
      {error ? (
        <AppText variant="small" accessibilityRole="alert" style={{ color: colors.danger }}>
          {error}
        </AppText>
      ) : null}
    </View>
  )
}
