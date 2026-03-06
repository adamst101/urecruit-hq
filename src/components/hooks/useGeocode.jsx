// src/components/hooks/useGeocode.jsx
// Geocode a US city+state to lat/lng using the free Census Geocoding API (no key needed).

export async function geocodeCity(city, state) {
  if (!city && !state) return null;
  const cityStr = String(city || "").trim();
  const stateStr = String(state || "").trim();
  if (!cityStr && !stateStr) return null;

  const query = encodeURIComponent(`${cityStr}, ${stateStr}`);
  const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${query}&benchmark=2020&format=json`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const match = data?.result?.addressMatches?.[0];
    if (match?.coordinates) {
      return {
        lat: match.coordinates.y,
        lng: match.coordinates.x,
      };
    }
    return null;
  } catch {
    return null;
  }
}