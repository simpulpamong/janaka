import { useCallback, useState } from "react"

interface GeoState {
  lat: number
  lng: number
}

export interface UseGeolocationResult {
  coords: GeoState | null
  loading: boolean
  error: string | null
  requestLocation: () => void
}

export function useGeolocation(): UseGeolocationResult {
  const [coords, setCoords] = useState<GeoState | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const requestLocation = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setError("Perangkat tidak mendukung GPS")
      return
    }
    setLoading(true)
    setError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        })
        setLoading(false)
      },
      (err) => {
        setError(
          err.code === err.PERMISSION_DENIED
            ? "Izin lokasi ditolak. Aktifkan GPS perangkat."
            : "Gagal mengambil lokasi. Pastikan GPS aktif.",
        )
        setLoading(false)
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    )
  }, [])

  return { coords, loading, error, requestLocation }
}
