import { useCallback, useEffect, useRef, useState } from "react"
import {
  Camera,
  CameraOff,
  Image as ImageIcon,
  RefreshCw,
  SwitchCamera,
  Zap,
  ZapOff,
} from "lucide-react"
import { Modal } from "@/components/ui/Modal"
import { Dropdown } from "@/components/ui/Dropdown"
import { cn } from "@/lib/cn"

/**
 * Kamera web untuk PC.
 *
 * ## Kenapa komponen terpisah, bukan `<input capture>` di semua platform
 * `capture="environment"` di desktop sering diabaikan atau hanya membuka
 * dialog choose-file yang membingungkan - dan tidak ada kontrol apa pun:
 * tidak bisa pilih kamera depan/belakang, tidak ada zoom, tidak ada denyar.
 * Jadi: **ponsel memakai kamera native** (lebih cepat, hemat baterai, flash
 * ditangani kamera HP), **PC memakai kamera web** dengan kontrol lengkap.
 *
 * ## Kenapa kamera depan dicerminkan
 * Cermin hanya untuk kamera depan, supaya petugas bisa membingkai dirinya
 * sendiri seperti cermin. Kamera belakang ditampilkan apa adanya, supaya
 * hasil foto sama persis dengan yang terlihat di dunia.
 */
export interface KameraWebProps {
  open: boolean
  onClose: () => void
  /** Dipanggil sekali per jepretan, dengan Blob JPEG siap dikompresi & unggah. */
  onCapture: (blob: Blob) => void
}

type Facing = "environment" | "user"
type KameraStatus = "siap" | "meminta" | "ditolak" | "tidak-ada" | "tidak-aman"

const PETA_KESALAHAN: Record<string, string> = {
  NotAllowedError:
    "Izin kamera ditolak. Klik ikon kunci di bilah alamat, lalu izinkan kamera untuk situs ini.",
  PermissionDeniedError:
    "Izin kamera ditolak. Izinkan kamera lewat pengaturan situs di peramban Anda.",
  NotFoundError: "Tidak ada kamera yang terdeteksi pada perangkat ini.",
  DevicesNotFoundError: "Tidak ada kamera yang terdeteksi pada perangkat ini.",
  OverconstrainedError:
    "Kamera yang diminta tidak tersedia. Pilih kamera lain lewat dropdown di bawah.",
  NotReadableError:
    "Kamera sedang dipakai aplikasi lain. Tutup aplikasi yang memakai kamera, lalu coba lagi.",
  TrackStartError: "Kamera gagal dinyalakan. Colok ulang kamera atau muat ulang halaman.",
}

/** Deteksi environment: getUserMedia hanya boleh jalan di HTTPS atau localhost. */
function cameraTersedia(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia
}

/** True kalau perangkat terasa punya kamera native (ponsel/tablet). */
export function perangkatPunyaKameraNative(): boolean {
  if (typeof navigator === "undefined") return false
  return (
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) &&
    typeof window !== "undefined" &&
    "ontouchstart" in window
  )
}

export function KameraWeb({ open, onClose, onCapture }: KameraWebProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [status, setStatus] = useState<KameraStatus>("siap")
  const [pesan, setPesan] = useState("")
  const [facing, setFacing] = useState<Facing>("environment")
  const [sedangJepret, setSedangJepret] = useState(false)
  const [daftarKamera, setDaftarKamera] = useState<MediaDeviceInfo[]>([])
  const [kameraAktif, setKameraAktif] = useState<string>("")
  const [denyar, setDenyar] = useState(false)
  const [sudahDenyar, setSudahDenyar] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [sudahZoom, setSudahZoom] = useState(false)

  /**
   * Matikan semua track kamera.
   *
   * Wajib, bukan opsional: track yang dibiarkan hidup akan membuat kamera
   * depan menyala terus setelah modal ditutup - lampu indikator menyala,
   * dan aplikasi berikutnya yang minta kamera gagal.
   */
  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  /** Nyalakan kamera dengan deviceId tertentu, atau facing mode sebagai cadangan. */
  const bukaKamera = useCallback(
    async (deviceId?: string, mode: Facing = "environment") => {
      if (!cameraTersedia()) {
        const aman =
          typeof window !== "undefined" &&
          (window.location.protocol === "https:" || window.location.hostname === "localhost")
        setStatus("tidak-aman")
        setPesan(
          aman
            ? "Peramban ini tidak mendukung akses kamera."
            : "Kamera hanya bisa dipakai pada alamat HTTPS (atau saat pengembangan di localhost).",
        )
        return
      }

      stopStream()
      setStatus("meminta")

      const batasan: MediaTrackConstraints = {
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: mode } }),
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: batasan })
        streamRef.current = stream

        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => {})
        }

        setStatus("siap")
        setPesan("")
        setKameraAktif(stream.getVideoTracks()[0]?.getSettings().deviceId ?? deviceId ?? "")

        // Tidak semua webcam punya denyar atau zoom.
        const track = stream.getVideoTracks()[0]
        const kapabilitas = track?.getCapabilities?.()
        setSudahDenyar(!!kapabilitas && "torch" in kapabilitas)
        setDenyar(false)
        setSudahZoom(!!kapabilitas && "zoom" in kapabilitas)
        setZoom(1)

        try {
          const devices = await navigator.mediaDevices.enumerateDevices()
          setDaftarKamera(devices.filter((d) => d.kind === "videoinput"))
        } catch {
          /* Label perangkat tersembunyi sebelum izin diberikan - abaikan. */
        }
      } catch (err) {
        const nama = (err as { name?: string })?.name ?? ""
        const ditolak =
          nama === "NotAllowedError" || nama === "PermissionDeniedError" || nama === "SecurityError"
        setStatus(ditolak ? "ditolak" : "tidak-ada")
        setPesan(PETA_KESALAHAN[nama] ?? `Kamera gagal dinyalakan (${nama || "kesalahan tidak dikenal"}).`)
      }
    },
    [stopStream],
  )

  // Nyalakan kamera saat modal dibuka; matikan saat ditutup/unmounted.
  useEffect(() => {
    if (!open) return
    setFacing("environment")
    void bukaKamera(undefined, "environment")
    return () => stopStream()
  }, [open, bukaKamera, stopStream])

  const gantiKamera = useCallback(() => {
    const berikut: Facing = facing === "environment" ? "user" : "environment"
    setFacing(berikut)
    void bukaKamera(undefined, berikut)
  }, [facing, bukaKamera])

  const pilihKamera = (deviceId: string) => {
    setKameraAktif(deviceId)
    void bukaKamera(deviceId)
  }

  const toggleDenyar = () => {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    const nyala = !denyar
    setDenyar(nyala)
    void track
      .applyConstraints({ advanced: [{ torch: nyala } as MediaTrackConstraintSet] })
      .catch(() => setDenyar(false))
  }

  const terapkanZoom = (nilai: number) => {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    const dibatasi = Math.min(5, Math.max(1, nilai))
    setZoom(dibatasi)
    void track
      .applyConstraints({ advanced: [{ zoom: dibatasi } as MediaTrackConstraintSet] })
      .catch(() => setSudahZoom(false))
  }

  /** Jepret frame dari video menjadi Blob JPEG. */
  const takeShot = useCallback(async () => {
    const video = videoRef.current
    if (!video || !video.videoWidth) return

    setSedangJepret(true)
    try {
      const canvas = document.createElement("canvas")
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight

      const ctx = canvas.getContext("2d")
      if (!ctx) return
      if (facing === "user") {
        ctx.translate(canvas.width, 0)
        ctx.scale(-1, 1)
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.95),
      )
      if (blob) onCapture(blob)
    } catch {
      /* Gagal encode - diamkan saja, pengguna bisa menjepret ulang. */
    } finally {
      setSedangJepret(false)
    }
  }, [facing, onCapture])

  // Spasi untuk jepret, C untuk ganti kamera.
  useEffect(() => {
    if (!open || status !== "siap") return
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return
      if (e.code === "Space") {
        e.preventDefault()
        void takeShot()
      }
      if (e.key.toLowerCase() === "c") gantiKamera()
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [open, status, takeShot, gantiKamera])

  const cermin = facing === "user"

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      hideClose
      hideFooter
      tone="dark"
      className="!bg-slate-950 !border-slate-800"
      title={
        <span className="flex items-center gap-2 text-slate-100">
          <Camera className="h-4 w-4" />
          Ambil Foto dengan Kamera
        </span>
      }
    >
      <div className="space-y-3">
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-black">
          {status === "siap" || status === "meminta" ? (
            <>
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                className={cn("h-full w-full object-cover", cermin && "-scale-x-100")}
              />
              {/* Grid regra-of-thirds: bantu membingkai foto bukti tetap lurus. */}
              <div className="pointer-events-none absolute inset-0" aria-hidden="true">
                {[33.33, 66.66].map((pos) => (
                  <div key={pos}>
                    <div className="absolute inset-y-0 w-px bg-white/20" style={{ left: `${pos}%` }} />
                    <div className="absolute inset-x-0 h-px bg-white/20" style={{ top: `${pos}%` }} />
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
              <CameraOff className="h-9 w-9 text-slate-500" />
              <p className="max-w-sm text-xs leading-relaxed text-slate-300">{pesan}</p>
              <button
                type="button"
                onClick={() => void bukaKamera(kameraAktif || undefined, facing)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-800 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-slate-700"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Coba Lagi
              </button>
            </div>
          )}

          {status === "meminta" ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/70">
              <span className="flex items-center gap-2 text-xs font-semibold text-white">
                <RefreshCw className="h-4 w-4 animate-spin" />
                Menyalakan kamera...
              </span>
            </div>
          ) : null}

          {status === "siap" ? (
            <button
              type="button"
              onClick={() => void takeShot()}
              disabled={sedangJepret}
              aria-label="Ambil foto"
              className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border-4 border-white/80 bg-white/90 p-2 shadow-lg transition-all hover:scale-105 active:scale-95 disabled:opacity-60"
            >
              <span className="block h-11 w-11 rounded-full bg-slate-900" />
            </button>
          ) : null}
        </div>

        {status === "siap" ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            {daftarKamera.length > 1 ? (
              <Dropdown
                value={kameraAktif}
                onChange={pilihKamera}
                aria-label="Pilih kamera"
                className="min-w-0 flex-1"
                opsi={daftarKamera.map((d, i) => ({
                  value: d.deviceId,
                  label: d.label || `Kamera ${i + 1}`,
                }))}
              />
            ) : (
              <span className="flex-1" />
            )}

            <div className="flex items-center gap-1.5">
              {sudahDenyar ? (
                <TombolKontrol
                  aktif={denyar}
                  onClick={toggleDenyar}
                  label={denyar ? "Matikan denyar" : "Nyalakan denyar"}
                  Icon={denyar ? Zap : ZapOff}
                />
              ) : null}

              {sudahZoom ? (
                <div className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-2 py-1">
                  <span className="text-[10px] font-bold text-slate-400">{zoom.toFixed(1)}x</span>
                  <input
                    type="range"
                    min={1}
                    max={5}
                    step={0.1}
                    value={zoom}
                    onChange={(e) => terapkanZoom(Number(e.target.value))}
                    aria-label="Zoom"
                    className="h-1 w-20 cursor-pointer appearance-none rounded-full bg-slate-700 accent-blue-500"
                  />
                </div>
              ) : null}

              <TombolKontrol onClick={gantiKamera} label="Ganti kamera" Icon={SwitchCamera} />
            </div>
          </div>
        ) : null}

        {status === "siap" ? (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-500">
            <span className="flex items-center gap-1">
              <ImageIcon className="h-3 w-3" />
              Klik bulatan besar atau tekan Spasi untuk menjepret
            </span>
            <span className="flex items-center gap-1">
              <SwitchCamera className="h-3 w-3" />
              Tekan C untuk ganti kamera
            </span>
          </p>
        ) : null}
      </div>
    </Modal>
  )
}

function TombolKontrol({
  onClick,
  label,
  Icon,
  aktif,
}: {
  onClick: () => void
  label: string
  Icon: typeof Camera
  aktif?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={aktif}
      className={cn(
        "rounded-lg border p-1.5 transition-colors",
        aktif
          ? "border-amber-400 bg-amber-400/15 text-amber-300"
          : "border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800",
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  )
}