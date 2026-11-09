import { Platform } from 'react-native'
import Constants, { ExecutionEnvironment } from 'expo-constants'
import api from './api'
import { notificationTarget } from '../utils/notificationTarget'

/**
 * Push notifications (docs/19 §11). The server sends a push for every in-app
 * notification, to the phones registered here, so a shopper hears about an
 * order or a booking even when the app is closed.
 *
 * Two limits, both handled without an error:
 *  - Expo Go cannot receive push notifications on Android (since SDK 53):
 *    this is skipped there. A development or production build is needed.
 *  - A token needs an Expo project id (`npx eas-cli init` writes it into
 *    app.json). Without it this is skipped and the app works as before.
 * `expo-notifications` is loaded only when it can work (a `require` inside
 * the function runs the module only when called), so Expo Go never starts it.
 */
const CHANNEL = 'default'

let registeredToken = null

export const pushPossible = () => Constants.executionEnvironment !== ExecutionEnvironment.StoreClient

const projectId = () => Constants.expoConfig?.extra?.eas?.projectId || Constants.easConfig?.projectId || null

/** Returns { status: 'registered' | 'unsupported' | 'not_configured' | 'denied' | 'error' }. Never throws. */
export async function registerForPush() {
  if (!pushPossible()) return { status: 'unsupported' }
  const id = projectId()
  if (!id) return { status: 'not_configured' }
  try {
    // Deliberately a require inside the function: see the note at the top.
    const Notifications = require('expo-notifications')

    // Show a notification even while the app is open; the badge is kept by the
    // server's counts, so this never sets one.
    Notifications.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
    })
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL, { name: 'Orders and updates', importance: Notifications.AndroidImportance.HIGH })
    }

    let { status } = await Notifications.getPermissionsAsync()
    if (status !== 'granted') ({ status } = await Notifications.requestPermissionsAsync())
    if (status !== 'granted') return { status: 'denied' }

    const token = (await Notifications.getExpoPushTokenAsync({ projectId: id })).data
    await api.put('/devices/push-token', { token, platform: Platform.OS === 'ios' ? 'ios' : 'android' })
    registeredToken = token
    return { status: 'registered', token }
  } catch {
    return { status: 'error' }
  }
}

// Sign-out: stop this phone receiving this person's notifications. Best effort;
// the server also forgets a phone as soon as another account registers it.
export async function unregisterPush() {
  const token = registeredToken
  registeredToken = null
  if (!token) return
  try {
    await api.delete('/devices/push-token', { data: { token } })
  } catch {
    /* the phone simply keeps an unused token until the server prunes it */
  }
}

// Where a tap should open: the same mapping as the in-app inbox, so a push and
// its notification row go to the same screen.
export function destinationFor(role, data) {
  if (!role) return null
  return notificationTarget({ data }, { role })
}

/** Calls `onOpen(data)` when the person taps a notification (also one that launched the app). Returns a stop function. */
export async function listenForNotificationTaps(onOpen) {
  if (!pushPossible() || !projectId()) return () => {}
  try {
    // Deliberately a require inside the function: see the note at the top.
    const Notifications = require('expo-notifications')
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => onOpen(response.notification.request.content.data))
    const last = await Notifications.getLastNotificationResponseAsync()
    if (last) onOpen(last.notification.request.content.data)
    return () => subscription.remove()
  } catch {
    return () => {}
  }
}
