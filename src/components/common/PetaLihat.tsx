import { useEffect, useRef, useState } from "react"
import { LocateFixed, MapPin } from "lucide-react"
import { Modal } from "@/components/ui/Modal"
import { ActionButton } from "@/components/ui/primitives"

/*
 * Peta lihat-lokasi di dalam aplikasi.
 *
 * ## Kenapa bukan `window.open` ke Google Maps
 * Aturan proyek ini: semua peninjauan terjadi di dalam aplikasi, tidak ada
 * tab/jendela baru. Alasannya bukan cuma seragam — petugas yang membuka peta
 * di tab baru kehilangan posisi gulir halaman dan harus mencari ulang data
 * yang sedang dikerjakan. Peta di dalam modal tidak pernah kehilangan itu.
 *
 * Di ponsel tetap dibukakan ke aplikasi peta asli (skema `geo:`): tampilan
 * kecil di iframe hampir tidak berguna, sedangkan aplikasi peta punya tombol
 * rute dan bisa dipakai luring.
 *
 * ## Kenapa lewat event, bukan state React
 * `bukaPeta(lat, lng)` dipanggil dari beberapa halaman (Riwayat, Data
 * Reklame, Rekam Laporan) dan dari dalam baris tabel. Meneruskan state
 * pemanggil ke komponen peta akan membuat semua halaman itu harus memasang
 * komponen sendiri. Lewat satu event global + satu komponen terpasang di
 * `AppLayout`, panggilannya tetap satu baris dan hanya ada satu peta.
 */

/** Nama event dipakai bersama oleh pemanggil & komponen peta. */
const EVENT_PETA = "janaka:buka-peta"

/** Bentuk data yang dibawa event. */
export interface DetailPeta {
  lat: number
  lng: number
  /** Nama titik, mis. nama usaha reklame. */
  nama?: string
}

/** Panggil dari mana saja untuk menampilkan lokasi di peta dalam aplikasi. */
export function mintaPeta(detail: DetailPeta): void {
  if (typeof window === "undefined") return
  if (!Number.isFinite(detail.lat) || !Number.isFinite(detail.lng)) return
  window.dispatchEvent(new CustomEvent<DetailPeta>(EVENT_PETA, { detail }))
}

/** Buka titik lewat peta dalam aplikasi atau aplikasi peta native di ponsel. */
export function bukaPeta(lat: number, lng: number, nama?: string): void {
  mintaPeta({ lat, lng, nama })
}

/** Ponsel dengan aplikasi peta terpasang → pakai deep-link native. */
function perangkatPonsel(): boolean {
  if (typeof navigator === "undefined") return false
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
}

declare global {
  interface WindowEventMap {
    "janaka:buka-peta": CustomEvent<DetailPeta>
  }
}

/**
 * Muat Leaflet dari CDN hanya saat dibutuhkan.
 *
 * Leaflet ~40 KB gzip dan hanya dipakai di tiga tempat. Memuatnya di bundel
 * utama berarti setiap pengguna mengunduhnya walau tidak pernah membuka
 * peta. Karena itu skrip & CSS baru disuntikkan saat modal pertama dibuka.
 */
function muatLeaflet(cb: () => void): void {
  if (typeof window === "undefined") return
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const w = window as any
  if (w.L) {
    cb()
    return
  }
  if (w.__leafletLoading) return
  w.__leafletLoading = true

  if (!document.getElementById("leaflet-css")) {
    const link = document.createElement("link")
    link.id = "leaflet-css"
    link.rel = "stylesheet"
    link.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css"
    document.head.appendChild(link)
  }

  const script = document.createElement("script")
  script.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"
  script.onload = () => {
    w.__leafletLoading = false
    cb()
  }
  script.onerror = () => {
    w.__leafletLoading = false
  }
  document.head.appendChild(script)
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

/**
 * Komponen pemantau event. Pasang satu kali di `AppLayout`.
 *
 * Di ponsel, event langsung diteruskan ke aplikasi peta asli dan komponen
 * ini tidak pernah menampilkan modal.
 */
export function PetaLihatOtomatis() {
  const [titik, setTitik] = useState<DetailPeta | null>(null)

  useEffect(() => {
    const onBuka = (e: CustomEvent<DetailPeta>) => {
      const d = e.detail
      if (!d || !Number.isFinite(d.lat) || !Number.isFinite(d.lng)) return

      /* Ponsel → aplikasi peta native, bukan modal. */
      if (perangkatPonsel()) {
        const k = `${d.lat},${d.lng}`
        const label = encodeURIComponent(d.nama || "Lokasi Reklame")
        window.location.href = `geo:${k}?q=${k}(${label})&ll=${k}`
        return
      }

      setTitik(d)
    }

    window.addEventListener(EVENT_PETA, onBuka as EventListener)
    return () => window.removeEventListener(EVENT_PETA, onBuka as EventListener)
  }, [])

  return <PetaLihatModal open={!!titik} titik={titik} onClose={() => setTitik(null)} />
}

/** Peta dalam aplikasi — penanda tidak bisa digeser (ini cuma peninjau). */
export function PetaLihatModal({
  open,
  titik,
  onClose,
}: {
  open: boolean
  titik: DetailPeta | null
  onClose: () => void
}) {
  const wadahRef = useRef<HTMLDivElement>(null)
  const petaRef = useRef<unknown>(null)
  const [label, setLabel] = useState("")

  useEffect(() => {
    if (!open || !titik) return
    setLabel(titik.nama?.trim() || "Lokasi Reklame")

    let hidup = true

    muatLeaflet(() => {
      if (!hidup || !wadahRef.current) return
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const L = (window as any).L
      if (!L) return

      /* Peta lama harus dibuang dulu — Leaflet menolak memakai wadah yang
         sudah diinisialisasi, dan gejalanya peta diam/abu-abu. */
      if (petaRef.current) {
        ;(petaRef.current as { remove: () => void }).remove()
        petaRef.current = null
      }

      const peta = L.map(wadahRef.current, {
        center: [titik.lat, titik.lng],
        zoom: 17,
        zoomControl: true,
        scrollWheelZoom: false,
      })
      petaRef.current = peta

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
        maxZoom: 19,
      }).addTo(peta)

      /*
       * Penanda kecil dan tidak bisa digeser. Ikon bawaan Leaflet ikut
       * gambar dari CDN; yang ini murni div jadi tidak ada permintaan
       * gambar tambahan dan warnanya konsisten dengan tema aplikasi.
       */
      const ikon = L.divIcon({
        className: "",
        html: `<div style="width:22px;height:22px;background:#ef4444;border:2px solid #fff;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 2px 6px rgba(0,0,0,.3)"></div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 22],
      })
      L.marker([titik.lat, titik.lng], { icon: ikon, draggable: false }).addTo(peta)

      /* Peta dirender sebelum modal selesai transisi, jadi ukuran wadahnya
         masih 0. Tanpa invalidateSize, ubin peta tidak pernah terisi. */
      const t = window.setTimeout(() => peta.invalidateSize(), 200)
      /* eslint-enable @typescript-eslint/no-explicit-any */

      return () => window.clearTimeout(t)
    })

    return () => {
      hidup = false
      if (petaRef.current) {
        ;(petaRef.current as { remove: () => void }).remove()
        petaRef.current = null
      }
    }
  }, [open, titik])

  return (
    <Modal
      open={open && !!titik}
      onClose={onClose}
      size="xl"
      title={
        <span className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-blue-500" />
          <span className="min-w-0 truncate">{label}</span>
        </span>
      }
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <span className="font-mono text-xs font-semibold text-slate-500 dark:text-slate-400">
            {titik ? `${titik.lat.toFixed(6)}, ${titik.lng.toFixed(6)}` : ""}
          </span>
          <ActionButton
            variant="secondary"
            onClick={() => {
              if (!titik) return
              const k = `${titik.lat},${titik.lng}`
              window.location.href = `geo:${k}?q=${k}(${encodeURIComponent(label)})&ll=${k}`
            }}
            icon={<LocateFixed className="h-4 w-4" />}
          >
            Buka di Aplikasi Peta
          </ActionButton>
        </div>
      }
    >
      <div className="h-[60dvh] w-full overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700/60">
        <div ref={wadahRef} className="h-full w-full" />
      </div>
    </Modal>
  )
}
