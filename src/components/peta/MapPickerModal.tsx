import { useEffect, useRef, useState } from "react"
import { Check, LocateFixed, MapPin } from "lucide-react"
import { ActionButton } from "@/components/ui/primitives"
import { Modal } from "@/components/ui/Modal"
import { cn } from "@/lib/cn"

declare const window: any

function ensureLeaflet(cb: () => void) {
  if (window.L) {
    cb()
    return
  }

  const injectStyle = (href: string, id: string) => {
    if (document.getElementById(id)) return
    const el = document.createElement("link")
    el.id = id
    el.rel = "stylesheet"
    el.href = href
    document.head.appendChild(el)
  }

  const injectScript = (src: string, onLoad: () => void) => {
    const el = document.createElement("script")
    el.src = src
    el.onload = onLoad
    document.head.appendChild(el)
  }

  injectStyle(
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css",
    "lf-picker-css",
  )

  injectScript(
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js",
    cb,
  )
}

export interface MapPickerModalProps {
  open: boolean
  onClose: () => void
  initialLat?: number
  initialLng?: number
  onSelect: (coords: { lat: number; lng: number }) => void
  title?: string
}

const PONOROGO_CENTER = { lat: -7.876, lng: 111.46 }

export function MapPickerModal({
  open,
  onClose,
  initialLat,
  initialLng,
  onSelect,
  title = "Pilih Titik di Peta",
}: MapPickerModalProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const markerRef = useRef<any>(null)

  const [picked, setPicked] = useState<{ lat: number; lng: number }>(() => ({
    lat: initialLat ?? PONOROGO_CENTER.lat,
    lng: initialLng ?? PONOROGO_CENTER.lng,
  }))

  const [locating, setLocating] = useState(false)

  // Sync initial coords when opened
  useEffect(() => {
    if (open) {
      const lat = initialLat ?? PONOROGO_CENTER.lat
      const lng = initialLng ?? PONOROGO_CENTER.lng
      setPicked({ lat, lng })
    }
  }, [open, initialLat, initialLng])

  // Initialize Leaflet map
  useEffect(() => {
    if (!open) {
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
        markerRef.current = null
      }
      return
    }

    let isMounted = true

    ensureLeaflet(() => {
      if (!isMounted || !mapContainerRef.current) return
      if (mapRef.current) return

      const L = window.L
      const centerLat = initialLat ?? PONOROGO_CENTER.lat
      const centerLng = initialLng ?? PONOROGO_CENTER.lng

      const map = L.map(mapContainerRef.current, {
        center: [centerLat, centerLng],
        zoom: initialLat && initialLng ? 16 : 13,
        zoomControl: true,
      })
      mapRef.current = map

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
        maxZoom: 19,
      }).addTo(map)

      /*
       * Penanda kustom.
       *
       * ⚠️ JANGAN tambahkan `transform: translate(...)` di dalam `html`.
       * Leaflet sudah memposisikan elemen memakai `iconAnchor`: ujung bawah
       * tengah elemen berada tepat di titik yang di-klik. Menambah transform
       * di dalam HTML berarti offset berlaku DUA KALI — hasilnya ujung pin
       * berada ~42px di ATAS kursor, persis keluhan "saya klik, titiknya
       * muncul di atasnya".
       *
       * `iconAnchor` menunjuk ke bawah-tengah elemen — ujung runcing pin.
       */
      const UKURAN_PIN = { pin: 34, jarum: 10 } as const
      const tinggi = UKURAN_PIN.pin + UKURAN_PIN.jarum
      const icon = L.divIcon({
        className: "janaka-picker-pin",
        html: `
          <div style="position:relative; display:flex; flex-direction:column; align-items:center;">
            <div style="width:${UKURAN_PIN.pin}px; height:${UKURAN_PIN.pin}px; background:#ef4444; border:1.5px solid #ffffff; border-radius:50% 50% 50% 0; transform:rotate(-45deg); box-shadow:0 3px 10px rgba(0,0,0,0.28); display:flex; align-items:center; justify-content:center;">
              <div style="width:9px; height:9px; background:#ffffff; border-radius:50%; transform:rotate(45deg);"></div>
            </div>
            <div style="width:10px; height:3px; background:rgba(0,0,0,0.25); border-radius:50%; margin-top:1px; filter:blur(1px);"></div>
          </div>
        `,
        iconSize: [UKURAN_PIN.pin, tinggi],
        iconAnchor: [UKURAN_PIN.pin / 2, tinggi],
      })

      const marker = L.marker([centerLat, centerLng], {
        icon,
        draggable: true,
      }).addTo(map)
      markerRef.current = marker

      // Drag marker
      marker.on("dragend", (e: any) => {
        const pos = e.target.getLatLng()
        setPicked({ lat: pos.lat, lng: pos.lng })
      })

      // Click on map to place marker
      map.on("click", (e: any) => {
        const { lat, lng } = e.latlng
        marker.setLatLng([lat, lng])
        setPicked({ lat, lng })
      })

      // Fix tile rendering size after modal transition
      setTimeout(() => {
        if (mapRef.current) {
          mapRef.current.invalidateSize()
        }
      }, 250)
    })

    return () => {
      isMounted = false
    }
  }, [open, initialLat, initialLng])

  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        setPicked({ lat, lng })
        if (mapRef.current && markerRef.current) {
          mapRef.current.setView([lat, lng], 17)
          markerRef.current.setLatLng([lat, lng])
        }
      },
      () => {
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  const handleConfirm = () => {
    onSelect(picked)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      icon={<MapPin className="w-5 h-5 text-blue-500" />}
      size="xl"
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Koordinat:
            </span>
            <span className="rounded-lg bg-slate-100 dark:bg-slate-800 px-2 py-1 font-mono text-xs font-bold text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700">
              {picked.lat.toFixed(6)}, {picked.lng.toFixed(6)}
            </span>
          </div>
          <div className="flex gap-2">
            <ActionButton variant="secondary" onClick={onClose}>
              Batal
            </ActionButton>
            <ActionButton onClick={handleConfirm} icon={<Check className="w-4 h-4" />}>
              Gunakan Titik Ini
            </ActionButton>
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
          <p>
            Klik di mana saja pada peta atau geser penanda merah untuk menentukan titik lokasi.
          </p>
          <button
            type="button"
            onClick={handleGetCurrentLocation}
            disabled={locating}
            className="inline-flex items-center gap-1.5 font-semibold text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
          >
            <LocateFixed className={cn("w-3.5 h-3.5", locating && "animate-spin")} />
            {locating ? "Mencari GPS…" : "Gunakan GPS Saya"}
          </button>
        </div>

        <div className="relative h-[420px] w-full overflow-hidden rounded-xl border border-slate-200/70 dark:border-slate-700/60 bg-slate-100 dark:bg-slate-800">
          <div ref={mapContainerRef} className="h-full w-full z-0" />
        </div>
      </div>
    </Modal>
  )
}
