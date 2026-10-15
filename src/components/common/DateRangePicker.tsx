import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, RotateCcw, X } from "lucide-react"
import { cn } from "@/lib/cn"
import { formatTanggalSingkat } from "@/utils"

/**
 * Pemilih rentang tanggal — tampil sebagai **dropdown**, seperti kalender.
 *
 * ## Kenapa dropdown, bukan modal
 * Sebelumnya ini modal `lg` berisi blok "Tanggal Mulai → Tanggal Akhir",
 * badge "N Hari Terpilih", dan teks "Belum ada rentang". Semuanya cuma
 * pengulangan informasi: rentang yang dipilih sudah terbaca dari mana mana
 * tanggalnya menyala di kalender, dan dari tombol pemicu setelah dipakai.
 * Modal itu juga menutupi halaman untuk satu tugas yang sebenarnya kecil.
 *
 * Sekarang: tombol tipis memicu panel kecil berisi pilihan cepat + satu
 * kalender. Pilih dua tanggal, tekan **Terapkan**, panel menutup sendiri.
 *
 * ## Kenapa satu kalender, bukan dua
 * Panel dropdown lebarnya mengikuti tombolnya. Dua bulan berdampingan
 * memaksa panel jadi selebar layar, dan itulah yang bikin terasa berat.
 * Satu bulan + navigasi selalu cukup — bulan berikutnya hanya satu ketuk.
 *
 * ## Kenapa harus portal
 * Panel dirender `fixed` ke `document.body`. Kalau dirender `absolute` di
 * dalam field, ia terpotong oleh pembungkus `overflow-y-auto`. `fixed` di
 * dalam pohon DOM saja tidak cukup: leluhur yang punya `transform` membuat
 * containing block sendiri, dan `top`/`left` lalu dihitung relatif kotak
 * leluhur itu. Portal menutup kelas bug itu sepenuhnya.
 */

const NAMA_BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
]

const NAMA_HARI = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"]

/** Jarak aman dari tepi layar. */
const JARAK_TEPI = 8

/** Lebar panel — cukup satu kalender. */
const LEBAR_PANEL = 300

/** Tinggi panel, dipakai menghitung arah buka. */
const TINGGI_PANEL = 396

/** Ubah `YYYY-MM-DD` → Date (waktu lokal). */
function keDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number)
  return new Date(y, m - 1, d)
}

/** Date → `YYYY-MM-DD` (waktu lokal, bukan UTC). */
function keIso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

/** Jumlah hari dalam rentang (inklusif). */
function selisihHari(a: string, b: string): number {
  if (!a || !b) return 0
  return Math.round(Math.abs(keDate(b).getTime() - keDate(a).getTime()) / 86_400_000) + 1
}

export interface DateRangePickerProps {
  startDate: string
  endDate: string
  onChange: (start: string, end: string) => void
  disabled?: boolean
  className?: string
  id?: string
  "aria-label"?: string
}

/** Pilihan cepat. `semua` mengosongkan rentang. */
const PRESETS: { id: string; label: string }[] = [
  { id: "hariIni", label: "Hari Ini" },
  { id: "7hari", label: "7 Hari" },
  { id: "30hari", label: "30 Hari" },
]

export function DateRangePicker({
  startDate,
  endDate,
  onChange,
  disabled = false,
  className = "",
  id,
  "aria-label": ariaLabel,
}: DateRangePickerProps) {
  const [terbuka, setTerbuka] = useState(false)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [arah, setArah] = useState<"bawah" | "atas">("bawah")

  /* Rentang sementara — baru dikirim ke pemanggil saat "Terapkan". */
  const [draftAwal, setDraftAwal] = useState(startDate)
  const [draftAkhir, setDraftAkhir] = useState(endDate)
  const [hover, setHover] = useState("")

  const rootRef = useRef<HTMLDivElement>(null)
  const pemicuRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  /* Bulan yang ditampilkan: bulan awal rentang, atau bulan hari ini. */
  const [kursor, setKursor] = useState(() => {
    const dasar = startDate ? keDate(startDate) : new Date()
    return new Date(dasar.getFullYear(), dasar.getMonth(), 1)
  })

  /* Setiap kali dibuka, mulai dari rentang yang sedang dipakai. */
  useEffect(() => {
    if (!terbuka) return
    setDraftAwal(startDate)
    setDraftAkhir(endDate)
    setHover("")
    const dasar = startDate ? keDate(startDate) : new Date()
    setKursor(new Date(dasar.getFullYear(), dasar.getMonth(), 1))
  }, [terbuka, startDate, endDate])

  const hitungPosisi = useCallback(() => {
    const el = pemicuRef.current
    if (!el) return
    const box = el.getBoundingClientRect()
    setRect(box)

    const ruangBawah = window.innerHeight - box.bottom - JARAK_TEPI
    const ruangAtas = box.top - JARAK_TEPI
    setArah(ruangBawah < TINGGI_PANEL && ruangAtas > ruangBawah ? "atas" : "bawah")
  }, [])

  useLayoutEffect(() => {
    if (!terbuka) return
    hitungPosisi()
    const raf = requestAnimationFrame(hitungPosisi)
    return () => cancelAnimationFrame(raf)
  }, [terbuka, hitungPosisi])

  /*
   * Tutup saat klik di luar, Escape, atau halaman digulir.
   *
   * ⚠️ Tidak ada gulir **di dalam** panel ini (kisi tanggal tidak
   * menggulir), jadi tidak perlu pemeriksaan target seperti pada
   * `JamPicker`. Panel tinggi tetap, aman ditutup saat jendela digulir.
   */
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
        // `capture` supaya Escape menutup panel ini lebih dulu daripada
        // modal di belakangnya (listener modal ada di fase bubble).
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

  /* ── Kisi bulan ── */
  const kisi = useMemo(() => {
    const tahun = kursor.getFullYear()
    const bulan = kursor.getMonth()
    const pertama = new Date(tahun, bulan, 1)
    const jumlahHari = new Date(tahun, bulan + 1, 0).getDate()

    /* Kisi dimulai dari Minggu pada minggu berjalan bulan ini. */
    const mulai = new Date(pertama)
    mulai.setDate(1 - pertama.getDay())

    const sel: { iso: string; tanggal: number; bulanIni: boolean }[] = []
    for (let i = 0; i < 42; i++) {
      const d = new Date(mulai)
      d.setDate(mulai.getDate() + i)
      sel.push({ iso: keIso(d), tanggal: d.getDate(), bulanIni: d.getMonth() === bulan })
    }

    return { tahun, bulan, sel, jumlahHari }
  }, [kursor])

  const geserBulan = (langkah: -1 | 1) =>
    setKursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + langkah, 1))

  /**
   * Klik tanggal: klik pertama menetapkan awal, klik kedua menetapkan akhir.
   *
   * Klik ketiga memulai rentang baru — sama seperti pemilih rentang di
   * alat perencana perjalanan, pola yang sudah dikenal.
   */
  const pilihHari = (iso: string) => {
    if (!draftAwal || (draftAwal && draftAkhir)) {
      setDraftAwal(iso)
      setDraftAkhir("")
      return
    }
    if (iso < draftAwal) {
      setDraftAkhir(draftAwal)
      setDraftAwal(iso)
    } else {
      setDraftAkhir(iso)
    }
  }

  const pakaiPreset = (id: string) => {
    const now = new Date()
    if (id === "hariIni") {
      const t = keIso(now)
      setDraftAwal(t)
      setDraftAkhir(t)
      setKursor(new Date(now.getFullYear(), now.getMonth(), 1))
    } else if (id === "7hari" || id === "30hari") {
      const akhir = keIso(now)
      const d = new Date(now)
      d.setDate(d.getDate() - (id === "7hari" ? 6 : 29))
      setDraftAwal(keIso(d))
      setDraftAkhir(akhir)
      setKursor(new Date(d.getFullYear(), d.getMonth(), 1))
    } else {
      setDraftAwal("")
      setDraftAkhir("")
    }
  }

  /* Terapkan. Awal tanpa akhir berarti rentang satu hari. */
  const terapkan = () => {
    if (!draftAwal) {
      onChange("", "")
    } else if (!draftAkhir) {
      onChange(draftAwal, draftAwal)
    } else {
      onChange(draftAwal, draftAkhir)
    }
    setTerbuka(false)
  }

  const hariIniIso = useMemo(() => keIso(new Date()), [])

  /* Label tombol: rentang aktif, atau ajakan memilih. */
  const labelPemicu = startDate && endDate
    ? `${formatTanggalSingkat(startDate)} – ${formatTanggalSingkat(endDate)}`
    : startDate
      ? formatTanggalSingkat(startDate)
      : "Rentang tanggal"

  const jumlahHari = selisihHari(draftAwal, draftAkhir) || (draftAwal ? 1 : 0)

  const gayaPanel: React.CSSProperties | undefined = rect
    ? {
        top: arah === "atas" ? undefined : rect.bottom + 6,
        bottom: arah === "atas" ? window.innerHeight - rect.top + 6 : undefined,
        left: Math.min(
          Math.max(JARAK_TEPI, rect.left),
          Math.max(JARAK_TEPI, window.innerWidth - LEBAR_PANEL - JARAK_TEPI),
        ),
        width: LEBAR_PANEL,
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
        aria-label={ariaLabel ?? "Pilih rentang tanggal"}
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
          <CalendarIcon
            className={cn(
              "w-4 h-4 shrink-0",
              startDate ? "text-blue-500" : "text-slate-400",
            )}
          />
          <span
            className={cn(
              "truncate text-xs font-semibold",
              startDate ? "text-slate-700 dark:text-slate-200" : "text-slate-400 dark:text-slate-500",
            )}
          >
            {labelPemicu}
          </span>
        </span>

        {/* Hapus rentang tanpa membuka panel — klik × langsung mengosongkan. */}
        {startDate && !disabled ? (
          <span
            role="button"
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation()
              onChange("", "")
            }}
            className="shrink-0 rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200"
            title="Hapus rentang tanggal"
          >
            <X className="w-3.5 h-3.5" />
          </span>
        ) : null}
      </button>

      {terbuka && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={panelRef}
              role="dialog"
              aria-label="Pilih rentang tanggal"
              className={cn(
                arah === "atas" ? "animate-pop-in-above" : "animate-pop-in-below",
                "fixed z-[11000] rounded-2xl border border-slate-200/60 bg-white p-2.5 shadow-2xl shadow-slate-950/25 dark:border-slate-700/50 dark:bg-slate-800",
              )}
              style={gayaPanel}
            >
              {/* Pilihan cepat */}
              <div className="mb-2 flex flex-wrap gap-1">
                {PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => pakaiPreset(p.id)}
                    className="rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-500 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600 dark:border-slate-700 dark:text-slate-400 dark:hover:border-blue-600 dark:hover:bg-blue-900/30 dark:hover:text-blue-400"
                  >
                    {p.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => pakaiPreset("semua")}
                  className="rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-500 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600 dark:border-slate-700 dark:text-slate-400 dark:hover:border-blue-600 dark:hover:bg-blue-900/30 dark:hover:text-blue-400"
                >
                  Semua
                </button>
              </div>

              {/* Kepala bulan */}
              <div className="mb-1 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => geserBulan(-1)}
                  aria-label="Bulan sebelumnya"
                  className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <p className="text-[11px] font-bold text-slate-800 dark:text-slate-100">
                  {NAMA_BULAN[kisi.bulan]} {kisi.tahun}
                </p>
                <button
                  type="button"
                  onClick={() => geserBulan(1)}
                  aria-label="Bulan berikutnya"
                  className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Kepala hari */}
              <div className="mb-0.5 grid grid-cols-7 gap-0.5">
                {NAMA_HARI.map((h, i) => (
                  <div
                    key={h}
                    className={cn(
                      "py-0.5 text-center text-[9px] font-bold",
                      i === 0 ? "text-rose-400" : "text-slate-400 dark:text-slate-500",
                    )}
                  >
                    {h}
                  </div>
                ))}
              </div>

              {/* Kisi tanggal */}
              <div className="grid grid-cols-7 gap-0.5">
                {kisi.sel.map((sel) => {
                  const isAwal = draftAwal === sel.iso
                  const isAkhir = draftAkhir === sel.iso
                  const dalam = draftAwal && draftAkhir && sel.iso >= draftAwal && sel.iso <= draftAkhir
                  /*
                   * Selagi awal sudah dipilih tapi akhir belum, rentang
                   * mengikuti kursor (hover) supaya petugas melihat dulu
                   * panjang rentangnya sebelum menekan.
                   */
                  /* Tanggal ISO (`YYYY-MM-DD`) urut secara leksikografis sama
                     dengan urutan waktunya, jadi cukup dibandingkan sebagai
                     teks — tanpa perlu diubah ke Date lebih dulu. */
                  const pratinjau =
                    draftAwal && !draftAkhir && hover
                      ? sel.iso >= (draftAwal < hover ? draftAwal : hover) &&
                        sel.iso <= (draftAwal < hover ? hover : draftAwal)
                      : false

                  return (
                    <button
                      key={sel.iso}
                      type="button"
                      onClick={() => pilihHari(sel.iso)}
                      onMouseEnter={() => {
                        if (draftAwal && !draftAkhir) setHover(sel.iso)
                      }}
                      aria-pressed={isAwal || isAkhir}
                      className={cn(
                        "relative h-7 rounded-lg text-[11px] font-semibold transition-colors",
                        sel.bulanIni
                          ? "text-slate-700 dark:text-slate-200"
                          : "text-slate-300 dark:text-slate-600",
                        isAwal || isAkhir
                          ? "bg-blue-600 font-bold text-white"
                          : dalam || pratinjau
                            ? "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300"
                            : "hover:bg-slate-100 dark:hover:bg-slate-700/60",
                        sel.iso === hariIniIso &&
                          !isAwal &&
                          !isAkhir &&
                          "ring-1 ring-blue-400 ring-inset dark:ring-blue-500/60",
                      )}
                    >
                      {sel.tanggal}
                    </button>
                  )
                })}
              </div>

              {/* Aksi bawah */}
              <div className="mt-2 flex items-center justify-between gap-2 border-t border-slate-100 pt-2 dark:border-slate-700">
                <span className="min-w-0 truncate text-[10px] font-semibold text-slate-400 dark:text-slate-500">
                  {draftAwal
                    ? `${formatTanggalSingkat(draftAwal)}${draftAkhir ? ` – ${formatTanggalSingkat(draftAkhir)}` : ""} · ${jumlahHari} hari`
                    : "Belum dipilih"}
                </span>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      onChange("", "")
                      setTerbuka(false)
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700/60"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reset
                  </button>
                  <button
                    type="button"
                    onClick={terapkan}
                    disabled={!draftAwal}
                    className="rounded-lg bg-blue-600 px-2.5 py-1 text-[10px] font-bold text-white transition-colors hover:bg-blue-700 disabled:opacity-40"
                  >
                    Terapkan
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}

export default DateRangePicker
