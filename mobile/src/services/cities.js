import api from './api'

export async function fetchCities() {
  const res = await api.get('/cities', { params: { isActive: true } })
  // A server that answers with something odd reads as "no cities", never a crash.
  return Array.isArray(res.data?.cities) ? res.data.cities : []
}

// A remembered city that no longer exists falls back to "all cities" ('').
export function resolveCityId(cities, storedId) {
  return cities.some((c) => c._id === storedId) ? storedId : ''
}
