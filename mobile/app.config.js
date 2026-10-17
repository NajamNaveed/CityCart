// Adds one thing to app.json: the Google Maps key for ANDROID release builds, read
// from the GOOGLE_MAPS_API_KEY environment variable so the key is never committed.
// Without it the Nearby map is blank on Android release builds (Expo Go and iPhone
// are unaffected); everything else, including "Directions", still works.
// Restrict the key in Google Cloud to this app's package name.
module.exports = ({ config }) => {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) return config
  return {
    ...config,
    android: { ...config.android, config: { ...(config.android && config.android.config), googleMaps: { apiKey } } },
  }
}
