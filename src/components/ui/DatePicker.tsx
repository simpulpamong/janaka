import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/cn"
import { formatTanggalLengkap, toDate } from "@/utils"

/**
 * Pemilih tanggal milik sendiri.
 *
 * `<input type="date">` bawaan browser: kalendernya milik OS (tidak bisa
 * diberi gaya), tampilannya berbeda tiap platform, dan di beberapa Android
 * memunculkan tombol native yang menimpa input. Di sini kalender penuh dengan
 * navigasi bulan,bihasan keyboard, dan gaya yang sama dengan aplikasi.
 *
 * ## Kenapa harus portal
 * Panel dirender `fixed` ke `document.body`. Kalau dirender `absolute` di dalam
 * field, ia akan terpotong oleh pembungkus `overflow-y-auto` — dan modal tambah
 * laporan adalah kasus itu: panel kalender akan tertutup setengah.
 *
 * `fixed` di dalam pohon DOM saja tidak cukup: leluhur yang punya `transform`
 * membuat containing block sendiri, dan `top`/`left` lalu dihitung relatif
 * kotak leluhur itu, bukan viewport. Portal menutup kelas bug itu sepenuhnya.
 */

const NAMA_BULAN = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
]

const NAMA_HARI = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"]

/** Jarak aman dari tepi layar. */
const JARAK_TEPI = 8

export interface DatePickerProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  id?: string
  name?: string
  "aria-label"?: string
  /** Batasi tanggal yang boleh dipilih. */
  min?: string
  max?: string
  /** Tandai tanggal dengan tanda kecil (mis. hari ada laporan). */
  tandai?: (iso: string) => boolean
}

/** Ubah Date → `YYYY-MM-DD` dalam waktu lokal (bukan UTC). */
function keIso(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

export function DatePicker({
  value,
  onChange,
  placeholder = "— Pilih tanggal —",
  disabled = false,
  className = "",
  id,
  name,
  "aria-label": ariaLabel,
  min,
  max,
  tandai,
}: DatePickerProps) {
  const [terbuka, setTerbuka] = useState(false)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [arah, setArah] = useState<"bawah" | "atas">("bawah")

  const rootRef = useRef<HTMLDivElement>(null)
  const pemicuRef = useRef<HTMLButtonElement>(null)

  const terpilih = toDate(value)
  /** Bulan yang ditampilkan: bulan nilai terpilih, atau bulan hari ini. */
  const [kursor, setKursor] = useState<Date>(() => terpilih ?? new Date())
  const [draft, setDraft] = useState<string>(value)

  // Ikuti nilai dari luar saat field tidak sedang dibuka.
  useEffect(() => {
    if (terbuka) return
    setDraft(value)
    const d = toDate(value)
    if (d) setKursor(d)
  }, [value, terbuka])

  const hitungPosisi = useCallback(() => {
    const el = pemicuRef.current
    if (!el) return
    const box = el.getBoundingClientRect()
    setRect(box)

    const tinggiPanel = 340
    const ruangBawah = window.innerHeight - box.bottom - JARAK_TEPI
    const ruangAtas = box.top - JARAK_TEPI
    setArah(ruangBawah < tinggiPanel && ruangAtas > ruangBawah ? "atas" : "bawah")
  }, [])

  useLayoutEffect(() => {
    if (!terbuka) return
    hitungPosisi()
    const raf = requestAnimationFrame(hitungPosisi)
    return () => cancelAnimationFrame(raf)
  }, [terbuka, hitungPosisi])

  /* Tutup saat klik di luar atau Escape. */
  useEffect(() => {
    if (!terbuka) return
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (rootRef.current?.contains(target)) return
      if (panelRef.current?.contains(target)) return
      setTerbuka(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        event.stopPropagation()
        setTerbuka(false)
      }
    }
    const onScroll = () => setTerbuka(false)

    document.addEventListener("mousedown", onPointerDown)
    document.addEventListener("keydown", onKeyDown, true)
    window.addEventListener("scroll", onScroll, true)
    window.addEventListener("resize", onScroll)
    return () => {
      document.removeEventListener("mousedown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown, true)
      window.removeEventListener("scroll", onScroll, true)
      window.removeEventListener("resize", onScroll)
    }
  }, [terbuka])

  const panelRef = useRef<HTMLDivElement>(null)

  /** Kisi bulan yang sedang ditampilkan. */
  const sel = useMemo(() => {
    const tahun = kursor.getFullYear()
    const bulan = kursor.getMonth()
    const pertama = new Date(tahun, bulan, 1)
    const jumlahHari = new Date(tahun, bulan + 1, 0).getDate()

    // Kisi dimulai dari Minggu minggu berjalan bulan ini. Selalu 42 sel
    // (6 baris × 7 kolom) supaya tinggi panel tidak melompat saat berpindah
    // bulan — bulan dengan 5 baris tetap memakai tinggi yang sama.
    const mulai = new Date(pertama)
    mulai.setDate(1 - pertama.getDay())
    mulai.setHours(0, 0, 0, 0)

    const cells: { iso: string; tanggal: number; bulanIni: boolean }[] = []
    for (let i = 0; i < 42; i++) {
      const d = new Date(mulai)
      d.setDate(mulai.getDate() + i)
      cells.push({
        iso: keIso(d),
        tanggal: d.getDate(),
        bulanIni: d.getMonth() === bulan,
      })
    }

    return { tahun, bulan, cells, jumlahHari }
  }, [kursor])

  const geserBulan = (arahBulan: -1 | 1) => {
    setKursor((prev) => {
      const d = new Date(prev)
      d.setDate(1)
      d.setMonth(d.getMonth() + arahBulan)
      return d
    })
  }

  const pilihTanggal = (iso: string) => {
    setDraft(iso)
    onChange(iso)
    setTerbuka(false)
  }

  const label = terpilih ? formatTanggalLengkap(terpilih) : placeholder

  const gayaPanel: React.CSSProperties | undefined = rect
    ? {
        top: arah === "atas" ? undefined : rect.bottom + 6,
        bottom: arah === "atas" ? window.innerHeight - rect.top + 6 : undefined,
        left: Math.min(
          Math.max(JARAK_TEPI, rect.left),
          Math.max(JARAK_TEPI, window.innerWidth - 320 - JARAK_TEPI),
        ),
        minWidth: Math.min(300, Math.max(rect.width, 260)),
      }
    : undefined

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        ref={pemicuRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={terbuka}
        aria-label={ariaLabel}
        onClick={() => setTerbuka((prev) => !prev)}
        className={cn(
          "w-full flex items-center justify-between gap-2 py-2.5 px-3.5 rounded-xl border text-sm font-medium transition-colors text-left",
          disabled
            ? "opacity-50 cursor-not-allowed"
            : "cursor-pointer hover:border-slate-300 dark:hover:border-slate-600",
          terbuka
            ? "border-blue-500 ring-2 ring-blue-500/20 bg-white dark:bg-slate-800/60"
            : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60",
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          <Calendar className="w-4 h-4 shrink-0 text-slate-400" />
          <span
            className={cn(
              "truncate",
              terpilih ? "text-slate-700 dark:text-slate-200" : "text-slate-400 dark:text-slate-500",
            )}
          >
            {label}
          </span>
        </span>
        <ChevronRight
          className={cn(
            "w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200",
            terbuka && arah === "atas" && "-rotate-90",
            terbuka && arah === "bawah" && "rotate-90",
          )}
        />
      </button>

      {name ? <input type="hidden" name={name} value={draft} readOnly /> : null}

      {terbuka && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={panelRef}
              role="dialog"
              aria-label="Pilih tanggal"
              className={cn(
                arah === "atas" ? "animate-pop-in-above" : "animate-pop-in-below",
                "fixed z-[11000] rounded-2xl border border-slate-200/60 dark:border-slate-700/50 bg-white dark:bg-slate-800 shadow-2xl shadow-slate-950/25 p-3",
              )}
              style={gayaPanel}
            >
              {/* Kepala bulan */}
              <div className="flex items-center justify-between gap-2 mb-2.5">
                <button
                  type="button"
                  onClick={() => geserBulan(-1)}
                  aria-label="Bulan sebelumnya"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <p className="text-xs font-bold text-slate-800 dark:text-slate-100">
                  {NAMA_BULAN[sel.bulan]} {sel.tahun}
                </p>
                <button
                  type="button"
                  onClick={() => geserBulan(1)}
                  aria-label="Bulan berikutnya"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Kepala hari */}
              <div className="grid grid-cols-7 gap-1 mb-1">
                {NAMA_HARI.map((hari) => (
                  <div
                    key={hari}
                    className="text-center text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 py-1"
                  >
                    {hari}
                  </div>
                ))}
              </div>

              {/* Kisi tanggal */}
              <div className="grid grid-cols-7 gap-1">
                {sel.cells.map((cell) => {
                  const terpilihIni = draft === cell.iso
                  const hariIni = cell.iso === keIso(new Date())
                  const terlaluAwal = min ? cell.iso < min : false
                  const terlaluAkhir = max ? cell.iso > max : false
                  const mati = terlaluAwal || terlaluAkhir

                  return (
                    <button
                      key={cell.iso}
                      type="button"
                      disabled={mati}
                      onClick={() => pilihTanggal(cell.iso)}
                      aria-current={hariIni ? "date" : undefined}
                      aria-pressed={terpilihIni}
                      className={cn(
                        "relative h-8 rounded-lg text-[11px] font-semibold transition-colors",
                        cell.bulanIni
                          ? "text-slate-700 dark:text-slate-200"
                          : "text-slate-300 dark:text-slate-600",
                        mati && "opacity-30 cursor-not-allowed",
                        !mati && !terpilihIni && "hover:bg-slate-100 dark:hover:bg-slate-700/60",
                        hariIni && !terpilihIni && "ring-1 ring-blue-400 dark:ring-blue-500/60",
                        terpilihIni && "bg-blue-600 text-white hover:bg-blue-600",
                      )}
                    >
                      {cell.tanggal}
                      {/* Tanda kecil untuk hari yang punya catatan. */}
                      {tandai?.(cell.iso) && !terpilihIni ? (
                        <span
                          className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-amber-500"
                          aria-label="ada catatan"
                        />
                      ) : null}
                    </button>
                  )
                })}
              </div>

              {/* Aksi bawah */}
              <div className="flex items-center justify-between gap-2 mt-2.5 pt-2.5 border-t border-slate-100 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => {
                    const hariIni = keIso(new Date())
                    setDraft(hariIni)
                    onChange(hariIni)
                    setTerbuka(false)
                  }}
                  className="text-[11px] font-bold text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                >
                  Hari ini
                </button>
                <button
                  type="button"
                  onClick={() => setTerbuka(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors"
                >
                  Tutup
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}

export default DatePicker