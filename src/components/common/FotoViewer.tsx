import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react"
import { createPortal } from "react-dom"
import { ChevronLeft, ChevronRight, Download, LoaderCircle, Minus, Plus, RotateCcw, X } from "lucide-react"
import { formatBytes } from "@/lib/cloudinary/config"

export interface FotoViewerItem {
  /** Nama berkas untuk judul & nama unduhan. */
  namaFile: string
  /** Sumber tampilan besar (data URL hasil kompresi / URL Cloudinary). */
  src: string
  width?: number
  height?: number
  ukuranBytes?: number
}

const BATAS_ZOOM = 4

/** Penampil foto layar penuh dengan navigasi, zoom, geser, dan unduh. */
export function FotoViewer({
  open,
  fotos,
  index,
  onIndexChange,
  onClose,
}: {
  open: boolean
  fotos: FotoViewerItem[]
  index: number | null
  onIndexChange: (index: number) => void
  onClose: () => void
}) {
  const foto = index !== null ? fotos[index] : undefined
  const jumlah = fotos.length
  const adaBanyak = jumlah > 1
  const stageRef = useRef<HTMLDivElement>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef({
    kind: "none" as "none" | "drag" | "pinch" | "swipe",
    x: 0,
    y: 0,
    startX: 0,
    startY: 0,
    distance: 0,
    scale: 1,
    moved: false,
  })
  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isLoading, setIsLoading] = useState(true)
  const [downloadBusy, setDownloadBusy] = useState(false)
  const [loadError, setLoadError] = useState(false)

  const ubahIndeks = useCallback((arah: -1 | 1) => {
    if (jumlah < 2 || index === null) return
    onIndexChange((index + arah + jumlah) % jumlah)
  }, [index, jumlah, onIndexChange])

  const aturZoom = useCallback((nilai: number) => {
    const baru = Math.max(1, Math.min(BATAS_ZOOM, nilai))
    setScale(baru)
    if (baru === 1) setPosition({ x: 0, y: 0 })
  }, [])

  useEffect(() => {
    if (!open) return
    const gayaBody = document.body.style
    const gayaHtml = document.documentElement.style
    const sebelumnya = {
      bodyOverflow: gayaBody.overflow,
      bodyOverscroll: gayaBody.overscrollBehaviorY,
      htmlOverflow: gayaHtml.overflow,
      htmlOverscroll: gayaHtml.overscrollBehaviorY,
    }
    gayaBody.overflow = "hidden"
    gayaBody.overscrollBehaviorY = "contain"
    gayaHtml.overflow = "hidden"
    gayaHtml.overscrollBehaviorY = "contain"
    return () => {
      gayaBody.overflow = sebelumnya.bodyOverflow
      gayaBody.overscrollBehaviorY = sebelumnya.bodyOverscroll
      gayaHtml.overflow = sebelumnya.htmlOverflow
      gayaHtml.overscrollBehaviorY = sebelumnya.htmlOverscroll
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
      if (event.key === "ArrowLeft" && adaBanyak) ubahIndeks(-1)
      if (event.key === "ArrowRight" && adaBanyak) ubahIndeks(1)
      if (event.key === "+" || event.key === "=") aturZoom(scale + 0.25)
      if (event.key === "-") aturZoom(scale - 0.25)
      if (event.key === "0") aturZoom(1)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open, adaBanyak, ubahIndeks, onClose, aturZoom, scale])

  useEffect(() => {
    if (!open || !foto) return
    setIsLoading(true)
    setLoadError(false)
    setScale(1)
    setPosition({ x: 0, y: 0 })
    pointers.current.clear()
    gesture.current.kind = "none"

    if (jumlah > 1) {
      for (const i of [(index! - 1 + jumlah) % jumlah, (index! + 1) % jumlah]) {
        const berikutnya = fotos[i]
        if (berikutnya?.src) {
          const image = new Image()
          image.src = berikutnya.src
        }
      }
    }
  }, [open, foto?.src, index, fotos, jumlah])

  const mulaiPointer = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const titik = [...pointers.current.values()]

    if (titik.length === 2) {
      const [a, b] = titik
      gesture.current = {
        ...gesture.current,
        kind: "pinch",
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        scale,
        moved: true,
      }
    } else {
      gesture.current = {
        kind: scale > 1 ? "drag" : "swipe",
        x: event.clientX - position.x,
        y: event.clientY - position.y,
        startX: event.clientX,
        startY: event.clientY,
        distance: 0,
        scale,
        moved: false,
      }
    }
  }

  const gerakPointer = (event: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const titik = [...pointers.current.values()]
    const aksi = gesture.current

    if (titik.length >= 2 && aksi.kind === "pinch") {
      const [a, b] = titik
      const jarak = Math.hypot(a.x - b.x, a.y - b.y)
      if (aksi.distance > 0) aturZoom(aksi.scale * (jarak / aksi.distance))
      return
    }
    if (titik.length !== 1) return

    const dx = event.clientX - aksi.startX
    const dy = event.clientY - aksi.startY
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) aksi.moved = true
    if (aksi.kind === "drag" && scale > 1) {
      setPosition({ x: event.clientX - aksi.x, y: event.clientY - aksi.y })
    }
  }

  const selesaiPointer = (event: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId)
    const aksi = gesture.current
    if (pointers.current.size === 0 && aksi.kind === "swipe" && scale === 1) {
      const dx = event.clientX - aksi.startX
      const dy = event.clientY - aksi.startY
      if (Math.abs(dx) > 64 && Math.abs(dx) > Math.abs(dy) * 1.2) ubahIndeks(dx < 0 ? 1 : -1)
    }
    if (pointers.current.size < 2) gesture.current.kind = scale > 1 ? "drag" : "none"
    if (pointers.current.size === 1) {
      const [satu] = [...pointers.current.values()]
      gesture.current.x = satu.x - position.x
      gesture.current.y = satu.y - position.y
      gesture.current.kind = scale > 1 ? "drag" : "swipe"
    }
  }

  const unduh = async () => {
    if (!foto || downloadBusy) return
    setDownloadBusy(true)
    let objectUrl: string | null = null
    try {
      const response = await fetch(foto.src, { mode: "cors" })
      if (!response.ok) throw new Error("Foto tidak dapat diunduh")
      objectUrl = URL.createObjectURL(await response.blob())
      const a = document.createElement("a")
      a.href = objectUrl
      a.download = foto.namaFile || "foto-bukti.jpg"
      document.body.appendChild(a)
      a.click()
      a.remove()
    } catch {
      // URL langsung tetap memberi opsi buka/simpan saat sumber tidak mengizinkan CORS.
      const a = document.createElement("a")
      a.href = foto.src
      a.target = "_blank"
      a.rel = "noreferrer"
      a.download = foto.namaFile || "foto-bukti.jpg"
      document.body.appendChild(a)
      a.click()
      a.remove()
    } finally {
      if (objectUrl) window.setTimeout(() => URL.revokeObjectURL(objectUrl!), 1000)
      setDownloadBusy(false)
    }
  }

  if (!open || !foto || typeof document === "undefined") return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Penampil foto ${foto.namaFile}`}
      className="fixed inset-0 z-[10000] flex flex-col bg-slate-950 text-white select-none overscroll-none"
    >
      <header className="flex min-h-16 shrink-0 items-center justify-between gap-3 border-b border-slate-800 bg-slate-950/95 px-4 py-2.5 sm:px-6">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold sm:text-base">{foto.namaFile || "Foto Bukti"}</p>
          <p className="mt-0.5 truncate text-[11px] text-slate-400">
            {index !== null ? `${index + 1} dari ${jumlah} foto` : "Foto bukti"}
            {foto.width && foto.height ? ` · ${foto.width} × ${foto.height} px` : ""}
            {foto.ukuranBytes ? ` · ${formatBytes(foto.ukuranBytes)}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button type="button" onClick={() => aturZoom(scale - 0.25)} disabled={scale <= 1} aria-label="Perkecil foto" className="rounded-xl p-2 text-slate-300 hover:bg-slate-800 disabled:opacity-40">
            <Minus className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => aturZoom(1)} aria-label="Atur ulang zoom" className="min-w-12 rounded-xl px-1 py-2 text-xs font-mono text-slate-300 hover:bg-slate-800">
            {Math.round(scale * 100)}%
          </button>
          <button type="button" onClick={() => aturZoom(scale + 0.25)} disabled={scale >= BATAS_ZOOM} aria-label="Perbesar foto" className="rounded-xl p-2 text-slate-300 hover:bg-slate-800 disabled:opacity-40">
            <Plus className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => void unduh()} disabled={downloadBusy} className="ml-1 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-500 disabled:opacity-60 sm:px-4">
            {downloadBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            <span className="hidden sm:inline">Unduh</span>
          </button>
          <button type="button" onClick={onClose} aria-label="Tutup penampil foto" className="ml-1 rounded-xl p-2 text-slate-300 hover:bg-slate-800 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>
      </header>

      <main className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[radial-gradient(ellipse_at_center,_rgba(30,41,59,0.55),_rgb(2,6,23)_75%)] px-2 py-3 sm:px-6">
        <div
          ref={stageRef}
          className="relative flex h-full w-full touch-none items-center justify-center overflow-hidden"
          onPointerDown={mulaiPointer}
          onPointerMove={gerakPointer}
          onPointerUp={selesaiPointer}
          onPointerCancel={selesaiPointer}
          onWheel={(event) => {
            if (event.ctrlKey || event.metaKey) {
              event.preventDefault()
              aturZoom(scale + (event.deltaY < 0 ? 0.15 : -0.15))
            }
          }}
        >
          {isLoading && !loadError ? <div className="absolute z-10 flex flex-col items-center gap-3 text-slate-400" role="status"><LoaderCircle className="h-8 w-8 animate-spin text-blue-400" /><span className="text-xs">Memuat foto…</span></div> : null}
          {loadError ? <div className="max-w-sm px-6 text-center text-sm text-slate-300" role="alert">Foto tidak dapat dimuat. Periksa koneksi lalu coba buka kembali.</div> : null}
          <img
            key={foto.src}
            src={foto.src}
            alt={foto.namaFile}
            draggable={false}
            referrerPolicy="no-referrer"
            onLoad={() => { setIsLoading(false); setLoadError(false) }}
            onError={() => { setIsLoading(false); setLoadError(true) }}
            onDoubleClick={() => aturZoom(scale > 1 ? 1 : 2.5)}
            className={`max-h-full max-w-full rounded-sm object-contain shadow-2xl transition-opacity duration-200 ${isLoading ? "opacity-30" : "opacity-100"}`}
            style={{ transform: `translate3d(${position.x}px, ${position.y}px, 0) scale(${scale})`, cursor: scale > 1 ? (gesture.current.kind === "drag" ? "grabbing" : "grab") : "zoom-in", willChange: "transform" }}
          />
          {adaBanyak ? <>
            <button type="button" onClick={() => ubahIndeks(-1)} aria-label="Foto sebelumnya" className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full border border-white/10 bg-slate-950/70 p-2.5 text-white shadow-lg transition hover:bg-slate-800 sm:left-4 sm:p-3"><ChevronLeft className="h-5 w-5 sm:h-6 sm:w-6" /></button>
            <button type="button" onClick={() => ubahIndeks(1)} aria-label="Foto berikutnya" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full border border-white/10 bg-slate-950/70 p-2.5 text-white shadow-lg transition hover:bg-slate-800 sm:right-4 sm:p-3"><ChevronRight className="h-5 w-5 sm:h-6 sm:w-6" /></button>
          </> : null}
        </div>
        <div className="pointer-events-none absolute bottom-3 left-1/2 hidden -translate-x-1/2 items-center gap-2 rounded-full border border-slate-800 bg-slate-950/70 px-3 py-1.5 text-[10px] text-slate-400 sm:flex">
          <RotateCcw className="h-3 w-3" /> Klik dua kali untuk zoom · Geser untuk melihat · Tombol panah untuk pindah foto
        </div>
      </main>

      {adaBanyak ? <nav aria-label="Pilih foto" className="flex shrink-0 items-center justify-center gap-2 overflow-x-auto border-t border-slate-800 bg-slate-950 px-3 py-3">
        {fotos.map((item, i) => <button key={`${item.src}-${i}`} type="button" onClick={() => onIndexChange(i)} aria-label={`Tampilkan foto ${i + 1}`} aria-current={i === index ? "true" : undefined} className={`h-12 w-16 shrink-0 overflow-hidden rounded-lg border-2 bg-slate-900 transition sm:h-14 sm:w-20 ${i === index ? "border-blue-400 opacity-100" : "border-transparent opacity-55 hover:opacity-90"}`}>
          <img src={item.src} alt="" loading="lazy" className="h-full w-full object-cover" />
        </button>)}
      </nav> : <div className="h-3 shrink-0 border-t border-slate-800 bg-slate-950" />}
    </div>,
    document.body,
  )
}
