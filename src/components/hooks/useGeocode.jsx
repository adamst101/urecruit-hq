// src/components/hooks/useGeocode.jsx
// Geocode a US city+state to lat/lng using Nominatim (OpenStreetMap) — free, no key needed.
// Nominatim handles city+state queries correctly unlike the Census onelineaddress endpoint.

export async function geocodeCity(city, state) {
  if (!city && !state) return null;
  const cityStr = String(city || "").trim();
  const stateStr = String(state || "").trim();
  if (!cityStr && !stateStr) return null;

  const params = new URLSearchParams({
    city: cityStr,
    state: stateStr,
    country: "US",
    format: "json",
    limit: "1",
  });
  const url = `https://nominatim.openstreetmap.org/search?${params}`;

  try {
    const res = await fetch(url, {
      headers: { "Accept-Language": "en-US,en", "User-Agent": "urecruit-hq/1.0" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const match = data?.[0];
    if (match?.lat && match?.lon) {
      return { lat: parseFloat(match.lat), lng: parseFloat(match.lon) };
    }
    return null;
  } catch {
    return null;
  }
}