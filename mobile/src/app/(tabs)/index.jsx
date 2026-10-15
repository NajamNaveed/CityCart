import { useCallback, useEffect, useState } from 'react'
import { View } from 'react-native'
import api, { getErrorMessage } from '../../services/api'
import { API_URL, apiIsInsecure } from '../../services/config'
import AppText from '../../components/ui/AppText'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import EmptyState from '../../components/ui/EmptyState'
import Screen from '../../components/ui/Screen'
import Spinner from '../../components/ui/Spinner'
import { colors, radius, spacing } from '../../theme'

// Phase 1 home: proves the app can reach the API (public city list). The real
// home screen (featured brands and products) arrives with Phase 3.
export default function Home() {
  const [state, setState] = useState({ status: 'loading', cities: [], error: '' })

  const load = useCallback(async () => {
    setState({ status: 'loading', cities: [], error: '' })
    try {
      const res = await api.get('/cities')
      setState({ status: 'ok', cities: res.data.cities || [], error: '' })
    } catch (err) {
      setState({ status: 'error', cities: [], error: getErrorMessage(err) })
    }
  }, [])

  // Runs once when the screen opens.
  useEffect(() => {
    let active = true
    api
      .get('/cities')
      .then((res) => active && setState({ status: 'ok', cities: res.data.cities || [], error: '' }))
      .catch((err) => active && setState({ status: 'error', cities: [], error: getErrorMessage(err) }))
    return () => {
      active = false
    }
  }, [])

  return (
    <Screen title="CityCart" subtitle="Shop the markets of your city, from your phone.">
      {state.status === 'loading' && <Spinner label="Connecting to the server…" />}

      {state.status === 'error' && (
        <EmptyState
          icon="wifi-off"
          tone="error"
          title="Can't reach the server"
          message={state.error}
          action={<Button title="Try again" onPress={load} />}
        />
      )}

      {state.status === 'ok' && (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <View style={{ width: 10, height: 10, borderRadius: radius.pill, backgroundColor: colors.success }} />
            <AppText variant="strong">Connected to the CityCart server</AppText>
          </View>
          <AppText variant="small" style={{ marginTop: spacing.sm }}>
            {state.cities.length > 0
              ? `Cities available: ${state.cities.map((c) => c.name).join(', ')}`
              : 'The server is reachable, but no cities have been set up yet.'}
          </AppText>
        </Card>
      )}

      {__DEV__ && API_URL ? (
        <AppText variant="small" style={{ marginTop: spacing.lg }}>
          Server: {API_URL}
          {apiIsInsecure ? '  (plain http: fine for testing, but release builds need https)' : ''}
        </AppText>
      ) : null}
    </Screen>
  )
}
