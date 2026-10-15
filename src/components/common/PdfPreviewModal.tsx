import { useEffect, useRef, useState } from "react"
import { Download, Loader2, Printer, X } from "lucide-react"
import type { jsPDF } from "jspdf"
import { Modal } from "@/components/ui/Modal"
import { ActionButton } from "@/components/ui/primitives"

export interface DokumenLampiran {
  /** Nama berkas lampiran. */
  namaFile: string
  /** Bangun dokumen lampiran. */
  buat: () => Promise<jsPDF>
}

/**
 * Pratinjau PDF sebelum diunduh atau dicetak.
 *
 * ## Kenapa pratinjau, bukan langsung `doc.save()`
 * `doc.save()` menulis berkas ke folder Unduhan tanpa memberi kesempatan
 * mengecek isinya. Kalau salah titik, salah periode, atau foto buktinya
 * gagal termuat, petugas baru tahu setelah masuk folder Unduhan. Dengan
 * pratinjau, semua itu terlihat lebih dulu dan tombol unduh hanya ditekan
 * kalau memang sudah benar.
 *
 * ## Kenapa iframe, bukan `<embed>` atau layar baru
 * PDF dibuat sebagai Blob lokal (`doc.output("blob")`) lalu dijadikan
 * object URL. iframe bisa menampilkannya tanpa plugin tambahan dan tanpa
 * URL yang bocor ke address bar browser.
 */
export function PdfPreviewModal({
  open,
  onClose,
  buatPdf,
  namaFile,
  judul = "Pratinjau Dokumen",
  lampiran,
}: {
  open: boolean
  onClose: () => void
  /** Bangun dokumen utama. Dipanggil setiap kali modal dibuka. */
  buatPdf: () => Promise<jsPDF>
  /** Nama berkas unduhan, mis. `BA-budi-2026-10-14.pdf`. */
  namaFile: string
  /** Judul modal. */
  judul?: string
  /** Lampiran opsional (mis. foto bukti) yang ikut diunduh. */
  lampiran?: DokumenLampiran
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [status, setStatus] = useState<"memuat" | "siap" | "gagal">("memuat")
  const [pesan, setPesan] = useState("")
  const iframeRef = useRef<HTMLIFrameElement>(null)

  /*
   * Bangun PDF jadi Blob URL.
   *
   * URL lama dicabut lebih dulu supaya tidak menumpuk: setiap kali modal
   * dibuka untuk titik yang berbeda, object URL lama tidak lagi dipakai
   * dan tidak ada gunanya menahannya di memori.
   */
  useEffect(() => {
    if (!open) return

    let urlAktif: string | null = null
    let dibatalkan = false

    setStatus("memuat")
    setPesan("")

    void (async () => {
      try {
        const doc = await buatPdf()
        if (dibatalkan) return
        const blob = doc.output("blob") as Blob
        urlAktif = URL.createObjectURL(blob)
        setUrl(urlAktif)
        setStatus("siap")
      } catch (err) {
        if (dibatalkan) return
        console.error("[PdfPreviewModal] Gagal membuat PDF:", err)
        setPesan(err instanceof Error ? err.message : "Dokumen gagal dibuat.")
        setStatus("gagal")
      }
    })()

    return () => {
      dibatalkan = true
      if (urlAktif) URL.revokeObjectURL(urlAktif)
    }
  }, [open, buatPdf])

  /* Tutup → bersihkan URL supaya iframe tidak menahan berkas lama. */
  useEffect(() => {
    if (open) return
    setUrl(null)
    setStatus("memuat")
  }, [open])

  const unduh = () => {
    if (!url) return
    const a = document.createElement("a")
    a.href = url
    a.download = namaFile
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  const unduhLampiran = async () => {
    if (!lampiran) return
    try {
      const doc = await lampiran.buat()
      const blob = doc.output("blob") as Blob
      const u = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = u
      a.download = lampiran.namaFile
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(u)
    } catch (err) {
      console.error("[PdfPreviewModal] Gagal membuat lampiran:", err)
    }
  }

  const cetak = () => {
    const frame = iframeRef.current
    if (!frame?.contentWindow) return
    // `focus()` sebelum `print()` — beberapa browser mengabaikan panggilan
    // print() kalau iframe belum punya fokus, hasilnya tidak terjadi apa-apa.
    frame.contentWindow.focus()
    frame.contentWindow.print()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      scrollable={false}
      title={judul}
      icon={<Printer className="h-4 w-4 text-blue-500" />}
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-2.5">
          <ActionButton variant="secondary" onClick={onClose} icon={<X className="h-4 w-4" />}>
            Tutup
          </ActionButton>
          {lampiran ? (
            <ActionButton
              variant="secondary"
              onClick={() => void unduhLampiran()}
              disabled={status !== "siap"}
              icon={<Download className="h-4 w-4" />}
            >
              Unduh Foto
            </ActionButton>
          ) : null}
          <ActionButton
            onClick={unduh}
            disabled={status !== "siap"}
            icon={<Download className="h-4 w-4" />}
          >
            Unduh PDF
          </ActionButton>
          <ActionButton
            variant="secondary"
            onClick={cetak}
            disabled={status !== "siap"}
            icon={<Printer className="h-4 w-4" />}
          >
            Cetak
          </ActionButton>
        </div>
      }
    >
      <div className="relative -mx-5 -my-3 h-[62dvh] bg-slate-100 dark:bg-slate-900 sm:-mx-6">
        {status === "memuat" ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-400 dark:text-slate-500">
            <Loader2 className="h-7 w-7 animate-spin" />
            <p className="text-sm font-semibold">Menyiapkan dokumen…</p>
          </div>
        ) : null}

        {status === "gagal" ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center">
            <p className="text-sm font-bold text-rose-600 dark:text-rose-400">Dokumen gagal dibuat</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{pesan}</p>
          </div>
        ) : null}

        {status === "siap" && url ? (
          <iframe
            ref={iframeRef}
            src={url}
            title={judul}
            className="h-full w-full border-0"
          />
        ) : null}
      </div>
    </Modal>
  )
}
