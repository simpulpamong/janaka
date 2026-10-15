import { useEffect } from "react"
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react"
import { Modal } from "@/components/ui/Modal"
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

/**
 * Penampil foto bukti ukuran penuh — bisa dibuka dari mana saja.
 *
 * ## Kenapa modal sendiri, bukan `window.open`
 * Foto sudah berupa blob lokal hasil kompresi. `window.open` akan memuat
 * ulang gambar di tab baru (memboroskan memori dua kali), dan di banyak
 * browser popup diblokir sehingga tombol "lihat" tiap jadi tidak responsif.
 *
 * ## Kenapa `fotos` + `index`, bukan satu `foto`
 * Halaman Riwayat membuka galeri langsung dari baris tabel, bukan hanya
 * dari modal detail. Dengan daftar + indeks, navigasi prev/next dan strip
 * thumbnail tetap bekerja walau dipanggil dari dua tempat berbeda.
 */
export function FotoViewer({
  open,
  fotos,
  index,
  onIndexChange,
  onClose,
}: {
  open: boolean
  fotos: FotoViewerItem[]
  /** Indeks foto aktif; `null` bila ditutup. */
  index: number | null
  onIndexChange: (index: number) => void
  onClose: () => void
}) {
  const foto = index !== null ? fotos[index] : undefined
  const jumlah = fotos.length
  const adaBanyak = jumlah > 1

  // Panah kiri/kanan untuk pindah foto, seperti galeri biasa.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight" && adaBanyak) onIndexChange(((index ?? 0) + 1) % jumlah)
      if (event.key === "ArrowLeft" && adaBanyak) onIndexChange(((index ?? 0) - 1 + jumlah) % jumlah)
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [open, adaBanyak, jumlah, index, onIndexChange])

  if (!open || !foto) return null

  const unduh = () => {
    const a = document.createElement("a")
    a.href = foto.src
    a.download = foto.namaFile || "foto-bukti.jpg"
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      hideClose
      scrollable={false}
      tone="dark"
      className="!bg-slate-950 !border-slate-800"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-xs font-bold text-slate-100">{foto.namaFile}</p>
            <p className="text-[11px] text-slate-400">
              {foto.width && foto.height ? `${foto.width}×${foto.height} px · ` : ""}
              {foto.ukuranBytes ? formatBytes(foto.ukuranBytes) : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={unduh}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white transition-colors hover:bg-blue-700 active:scale-[0.98]"
          >
            <Download className="h-4 w-4" />
            Unduh Foto
          </button>
        </div>
      }
    >
      <div className="relative -mx-5 -my-4 flex items-center justify-center bg-slate-950 sm:-mx-6">
        <img
          src={foto.src}
          alt={foto.namaFile}
          className="max-h-[62dvh] w-auto max-w-full object-contain"
        />

        {/* Penghitung + navigasi — hanya muncul bila ada lebih dari satu foto. */}
        {adaBanyak ? (
          <>
            <span className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-black/60 px-2.5 py-1 font-mono text-[11px] font-bold text-white">
              {(index ?? 0) + 1} / {jumlah}
            </span>

            <button
              type="button"
              onClick={() => onIndexChange(((index ?? 0) - 1 + jumlah) % jumlah)}
              disabled={jumlah <= 1}
              className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white transition-colors hover:bg-black/80 disabled:opacity-30"
              aria-label="Foto sebelumnya"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>

            <button
              type="button"
              onClick={() => onIndexChange(((index ?? 0) + 1) % jumlah)}
              disabled={jumlah <= 1}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white transition-colors hover:bg-black/80 disabled:opacity-30"
              aria-label="Foto berikutnya"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        ) : null}

        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-full bg-black/60 p-2 text-white transition-colors hover:bg-black/80"
          aria-label="Tutup penampil foto"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Strip thumbnail — klik langsung lompat ke foto itu. */}
      {adaBanyak ? (
        <div className="-mx-5 mt-3 flex flex-wrap justify-center gap-1.5 px-1 sm:-mx-6">
          {fotos.map((f, i) => (
            <button
              key={`${f.namaFile}-${i}`}
              type="button"
              onClick={() => onIndexChange(i)}
              className={`h-9 w-[46px] shrink-0 overflow-hidden rounded-md border-2 transition-all ${
                i === index ? "border-white opacity-100" : "border-transparent opacity-45 hover:opacity-80"
              }`}
            >
              <img src={f.src} alt={`Foto ${i + 1}`} className="h-full w-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      ) : null}
    </Modal>
  )
}
