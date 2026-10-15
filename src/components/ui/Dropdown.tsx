import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Check, ChevronDown } from "lucide-react"
import { cn } from "@/lib/cn"

/**
 * Dropdown milik sendiri.
 *
 * `<select>` bawaan browser tidak bisa diberi gaya, opsi panjangnya terpotong
 * di layar kecil, panahnya bawaan OS, dan tidak bisa difilter. **Semua select
 * di aplikasi ini memakai komponen ini.**
 *
 * ## Arah buka: bawah dulu, ke atas hanya kalau perlu
 * Aturannya satu kalimat: buka ke bawah; ke atas hanya kalau bawah tidak muat
 * dan atas lebih luas.
 */

/** Jarak aman dari tepi layar, dalam piksel. */
const JARAK_TEPI = 8

/** Batas atas tinggi daftar. */
const TINGGI_DAFTAR_MAKS = 256

/**
 * Ruang minimum di bawah agar daftar tetap dibuka ke bawah.
 *
 * Angka ini adalah ambang "masih berguna", bukan ambang "cukup untuk seluruh
 * daftar". Selama ada 120px di bawah, daftar dibuka ke bawah dan digulir di
 * dalam panelnya — lebih dapat diprediksi daripada melompat ke atas.
 */
const TINGGI_MINIMUM = 120

export interface OpsiDropdown {
  value: string
  label: string
  /** Teks kecil di bawah label. */
  hint?: string
  disabled?: boolean
  /** Kelompok untuk header pengelompokan. Opsi diurutkan sesuai kemunculannya. */
  group?: string
  /** Ikon kecil di kiri. */
  icon?: React.ReactNode
}

export interface DropdownProps {
  value: string
  onChange: (value: string) => void
  opsi: OpsiDropdown[]
  placeholder?: string
  disabled?: boolean
  /** Tampilkan kolom pencarian di dalam daftar. */
  className?: string
  id?: string
  name?: string
  "aria-label"?: string
  /** Pesan saat daftar kosong. */
  kosong?: string
  /**
   * Versi tipis: garis lebih muda dan bayangan lebih dangkal.
   *
   * Dipakai filter baris tabel (Data Reklame, Riwayat) yang duduk
   * sejajar dengan kotak pencarian dan pemilih rentang tanggal.
   *
   * **Tingginya sengaja sama** dengan kontrol lain di baris filter itu.
   * Dulu `py-[9px] text-xs` menghasilkan tinggi 36px — enam piksel
   * lebih pendek dari kotak pencarian di sebelahnya, jadi sisi atasnya
   * tidak rata dan baris filter terlihat bergerigi. "Tipis" di sini
   * berarti lebih ringan dilihat, bukan lebih pendek.
   */
  tipis?: boolean
}

export function Dropdown({
  value,
  onChange,
  opsi,
  placeholder = "— Pilih —",
  disabled = false,
  className = "",
  id,
  name,
  "aria-label": ariaLabel,
  kosong = "Tidak ada opsi yang cocok.",
  tipis = false,
}: DropdownProps) {
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  /**
 * ⚠️ `z-[11000]` BUKAN angka acak.
 *
 * Menu ini di-portal ke `document.body`, jadi `z-index`-nya bersaing langsung
 * dengan overlay modal (`10000`), bukan dengan elemen induknya. Kalau nilainya
 * di bawah `10000`, setiap dropdown yang dibuka **di dalam modal** — Jenis
 * Reklame pada formulir tambah titik, Peran pada Manajemen Pengguna, dan
 * sebiquitynya — akan muncul di belakang panel modal yang gelap dan praktis
 * tidak terlihat.
 *
 * Skala lengkap: isi halaman 10…900 · modal 10 000 · overlay 11 000 · toast 12 000.
 * `tools/cek-zindex.mts` menjaga urutannya.
 */
/**
   * Arah buka daftar. Default 'bawah' — bukan karena itu selalu benar, tapi
   * karena itu yang dipakai kalau pengukuran belum sempat jalan, dan membuka ke
   * bawah selalu lebih aman daripada membuka ke atas tanpa dasar.
   */
  const [arah, setArah] = useState<"bawah" | "atas">("bawah")
  const [tinggiMaks, setTinggiMaks] = useState(TINGGI_DAFTAR_MAKS)
  const [rect, setRect] = useState<DOMRect | null>(null)

  const rootRef = useRef<HTMLDivElement>(null)
  const pemicuRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  /**
   * Tinggi isi daftar sebenarnya, diukur setelah panel dirender.
   *
   * Awalnya 0 (bukan `TINGGI_DAFTAR_MAKS`) supaya hitungan pertama
   * cenderung membuka ke bawah. Kalau diisi nilai besar, daftar pendek pun
   * akan sempat terbalik ke atas pada frame pertama sebelum pengukuran
   * selesai — terlihat berkedip.
   */
  const tinggiKebutuhanRef = useRef(0)

  const terpilih = useMemo(() => opsi.find((item) => item.value === value) ?? null, [opsi, value])

  /* ── Tutup saat klik di luar atau Escape ── */
  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (rootRef.current?.contains(target)) return
      if (listRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // `capture` supaya Escape menutup daftar ini lebih dulu daripada
        // modal di belakangnya (listener modal ada di fase bubble).
        event.preventDefault()
        event.stopPropagation()
        setOpen(false)
      }
    }

    document.addEventListener("mousedown", onPointerDown)
    document.addEventListener("keydown", onKeyDown, true)
    return () => {
      document.removeEventListener("mousedown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown, true)
    }
  }, [open])

  /** Tanpa pencarian: daftar apa adanya. */
  const tersaring = opsi

  /** Kelompok hanya dipakai bila ada opsi yang menyatakannya. */
  const pakaiGrup = useMemo(() => opsi.some((item) => item.group), [opsi])

  /*
   * Arah buka, tinggi maksimum, dan posisi.
   *
   * ⚠️ Mengukur dengan `visualViewport`, bukan `innerHeight`: yang menyusut
   * saat keyboard virtual muncul adalah `visualViewport`. Mengukurnya di HP
   * tanpa memperhitungkan keyboard = daftar tertutup keyboard.
   */
  const hitung = useCallback(() => {
    const el = pemicuRef.current
    if (!el) return
    const box = el.getBoundingClientRect()
    setRect(box)

    const vv = typeof window !== "undefined" ? window.visualViewport : null
    const tinggiLayar = vv?.height ?? window.innerHeight
    const offsetLayar = vv?.offsetTop ?? 0

    const ruangBawah = tinggiLayar - (box.bottom - offsetLayar) - JARAK_TEPI
    const ruangAtas = box.top - offsetLayar - JARAK_TEPI

    /*
     * Arah: **ke bawah dulu**, ke atas HANYA kalau memang tidak muat.
     *
     * Tinggi yang dibandingkan bukan angka tetap, tapi tinggi sebenarnya
     * yang dibutuhkan daftar (diukur setelah render). Memakai ambang tetap
     * membuat daftar yang isinya 3 baris ikut terbalik ke atas padahal
     * masih muat di bawah dengan lega.
     *
     * Kalau dua sisi sama-sama sempit, tetap ke bawah: daftar bisa digulir,
     * sedangkan membuka ke atas di ruang sempit hanya memotong bagian atas.
     */
    const butuh = Math.min(TINGGI_DAFTAR_MAKS, tinggiKebutuhanRef.current)
    const keAtas = ruangBawah < Math.max(TINGGI_MINIMUM, butuh) && ruangAtas > ruangBawah
    setArah(keAtas ? "atas" : "bawah")

    const ruang = keAtas ? ruangAtas : ruangBawah
    setTinggiMaks(Math.max(TINGGI_MINIMUM, Math.min(TINGGI_DAFTAR_MAKS, ruang)))
  }, [])

  /* ── Ukur tinggi isi setelah render, lalu hitung ulang arah ── */
  useEffect(() => {
    if (!open || !listRef.current) return
    const el = listRef.current
    // Tanpa `maxHeight` dulu: kalau tidak, yang terukur adalah tinggi yang
    // sudah dipotong — dan daftar selalu terlihat "cukup muat".
    const sementara = el.style.maxHeight
    el.style.maxHeight = "none"
    const perlu = el.scrollHeight + 8
    el.style.maxHeight = sementara
    if (Math.abs(perlu - tinggiKebutuhanRef.current) > 1) {
      tinggiKebutuhanRef.current = perlu
      hitung()
    }
  }, [open, hitung])

  /* ── Hitung sebelum render agar panel muncul di posisi benar frame pertama ── */
  useEffect(() => {
    if (!open) return
    hitung()
    const raf = requestAnimationFrame(hitung)
    return () => cancelAnimationFrame(raf)
  }, [open, hitung])

  /* ── Hitung ulang saat isi daftar berubah (pencarian menyaring opsi) ── */
  useEffect(() => {
    if (!open) return
    hitung()
  }, [open, tersaring.length, pakaiGrup, hitung])

  /*
   * Hitung ulang saat jendela digulir/diubah. Tanpa ini, dropdown yang sudah
   * terbuka bisa tertinggal di sisi yang sekarang penuh.
   */
  useEffect(() => {
    if (!open) return
    const onResize = () => hitung()
    const onScroll = () => hitung()
    window.addEventListener("resize", onResize)
    // `capture` supaya gulir di dalam daftar lain (dialog) ikut terukur.
    window.addEventListener("scroll", onScroll, true)
    return () => {
      window.removeEventListener("resize", onResize)
      window.removeEventListener("scroll", onScroll, true)
    }
  }, [open, hitung])

  /* ── Gulir opsi yang sedang disorot ke dalam tampilan ── */
  useEffect(() => {
    if (!open) return
    const list = listRef.current
    const item = list?.querySelector<HTMLElement>(`[data-index="${highlight}"]`)
    item?.scrollIntoView({ block: "nearest" })
  }, [highlight, open])

  const pilih = (opsiValue: string) => {
    onChange(opsiValue)
    setOpen(false)
  }

  const geser = (arahGeser: 1 | -1) => {
    const jml = tersaring.length
    if (jml === 0) return
    setHighlight((prev) => (arahGeser === 1 ? (prev + 1) % jml : (prev - 1 + jml) % jml))
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
        event.preventDefault()
        setOpen(true)
        setHighlight(Math.max(0, tersaring.findIndex((item) => item.value === value)))
      }
      return
    }

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault()
        geser(1)
        break
      case "ArrowUp":
        event.preventDefault()
        geser(-1)
        break
      case "Enter": {
        event.preventDefault()
        const item = tersaring[highlight]
        if (item && !item.disabled) pilih(item.value)
        break
      }
      case "Tab":
        setOpen(false)
        break
      default:
        break
    }
  }

  /* ── Style panel dari posisi trigger ── */
  const gayaPanel: React.CSSProperties | undefined = rect
    ? {
        top: arah === "atas" ? undefined : rect.bottom + 6,
        bottom: arah === "atas" ? window.innerHeight - rect.top + 6 : undefined,
        left: Math.min(
          Math.max(JARAK_TEPI, rect.left),
          Math.max(JARAK_TEPI, window.innerWidth - rect.width - JARAK_TEPI),
        ),
        minWidth: rect.width,
        maxWidth: Math.min(rect.width, window.innerWidth - JARAK_TEPI * 2),
      }
    : undefined

  const panel = (
    <div
      ref={listRef}
      className={cn(
        animatePopClass(arah),
        /*
         * Panel sengaja tipis: radius kecil, garis `slate-200/70`, dan
         * bayangan dangkal. Versi sebelumnya `rounded-2xl` + `border-slate-200`
         * + bayangan berlapis terasa berat dan menutupi isi di bawahnya,
         * padahal daftar ini hanya beberapa baris.
         */
        "fixed z-[11000] overflow-hidden rounded-xl border bg-white dark:bg-slate-800",
        tipis
          ? "border-slate-200 dark:border-slate-700 shadow-[0_4px_12px_-2px_rgba(15,23,42,0.10)] dark:shadow-slate-950/20"
          : "border-slate-200/70 dark:border-slate-700/60 shadow-[0_4px_12px_-2px_rgba(15,23,42,0.10)] dark:shadow-slate-950/20",
      )}
      style={gayaPanel}
    >
      <div
        role="listbox"
        className="overflow-y-auto custom-scrollbar p-1"
        style={{ maxHeight: tinggiMaks }}
      >
        {tersaring.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-slate-400 dark:text-slate-500">{kosong}</p>
        ) : pakaiGrup ? (
          <GroupedList
            opsi={tersaring}
            highlight={highlight}
            value={value}
            onHighlight={setHighlight}
            onPilih={pilih}
          />
        ) : (
          tersaring.map((item, index) => (
            <OptionRow
              key={item.value}
              item={item}
              index={index}
              active={highlight === index}
              terpilih={value === item.value}
              onMouseEnter={() => setHighlight(index)}
              onClick={() => !item.disabled && pilih(item.value)}
            />
          ))
        )}
      </div>
    </div>
  )

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        ref={pemicuRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={onKeyDown}
        className={cn(
          "w-full flex items-center justify-between gap-2 border text-sm font-medium transition-colors",
          /*
           * Kedua varian tingginya identik: `py-2.5` + `text-sm` + garis
           * 1px menghasilkan 42px, sama dengan `Input` dan tombol
           * `DateRangePicker` yang berdampingan. Yang berbeda cuma
           * ketebalan garis — itu arti "tipis" di sini.
           */
          tipis
            ? "h-[42px] px-3.5 rounded-xl"
            : "py-2.5 px-3.5 rounded-xl text-sm",
          disabled
            ? "opacity-50 cursor-not-allowed"
            : "cursor-pointer hover:border-slate-400 dark:hover:border-slate-600",
          open
            ? "border-blue-500 ring-2 ring-blue-500/20 bg-white dark:bg-slate-800/60 shadow-xs"
            : tipis
              ? "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60"
              : "border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800/60 shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-none",
        )}
      >
        <span className="flex min-w-0 items-center gap-2 text-left">
          {terpilih?.icon ? <span className="shrink-0">{terpilih.icon}</span> : null}
          <span
            className={cn(
              "truncate",
              terpilih ? "text-slate-700 dark:text-slate-200" : "text-slate-400 dark:text-slate-500",
            )}
          >
            {terpilih ? terpilih.label : placeholder}
          </span>
        </span>
        {/* Panah ikut arah: saat daftar terbuka ke atas, panah tetap ke atas
            supaya terbaca sebagai "naik", bukan "turun lalu naik". */}
        <ChevronDown
          className={cn(
            "w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200",
            open && arah === "atas" && "rotate-180",
          )}
        />
      </button>

      {/* Nilai tersembunyi supaya form native tetap bisa membaca state. */}
      {name ? <input type="hidden" name={name} value={value} readOnly /> : null}

      {open && typeof document !== "undefined" ? createPortal(panel, document.body) : null}
    </div>
  )
}

function animatePopClass(arah: "bawah" | "atas"): string {
  return arah === "atas" ? "animate-pop-in-above" : "animate-pop-in-below"
}

/* ── Baris opsi ── */
function OptionRow({
  item,
  index,
  active,
  terpilih,
  onMouseEnter,
  onClick,
}: {
  item: OpsiDropdown
  index: number
  active: boolean
  terpilih: boolean
  onMouseEnter: () => void
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={terpilih}
      data-index={index}
      disabled={item.disabled}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left transition-colors",
        item.disabled
          ? "opacity-40 cursor-not-allowed"
          : active
            ? "bg-blue-50 dark:bg-blue-500/15"
            : "hover:bg-slate-50 dark:hover:bg-slate-700/50",
      )}
    >
      {item.icon ? <span className="shrink-0">{item.icon}</span> : null}
      <Check
        className={cn(
          "w-3.5 h-3.5 shrink-0 text-blue-600 dark:text-blue-400 transition-opacity",
          terpilih ? "opacity-100" : "opacity-0",
        )}
        strokeWidth={3}
      />
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block text-xs font-semibold truncate",
            terpilih ? "text-blue-700 dark:text-blue-300" : "text-slate-700 dark:text-slate-200",
          )}
        >
          {item.label}
        </span>
        {item.hint ? (
          <span className="block text-[11px] text-slate-400 dark:text-slate-500 truncate mt-0.5">
            {item.hint}
          </span>
        ) : null}
      </span>
    </button>
  )
}

/** Daftar opsi yang dikelompokkan mengikuti nilai `group`. */
function GroupedList({
  opsi,
  highlight,
  value,
  onHighlight,
  onPilih,
}: {
  opsi: OpsiDropdown[]
  highlight: number
  value: string
  onHighlight: (index: number) => void
  onPilih: (value: string) => void
}) {
  // `data-index` harus memakai indeks global supaya sorotan keyboard dan
  // `scrollIntoView` tetap cocok.
  const groups: { name: string; items: { item: OpsiDropdown; index: number }[] }[] = []
  opsi.forEach((item, index) => {
    const name = item.group ?? ""
    const last = groups[groups.length - 1]
    if (last && last.name === name) last.items.push({ item, index })
    else groups.push({ name, items: [{ item, index }] })
  })

  return (
    <>
      {groups.map((group) => (
        <div key={group.name || "_"} className="mb-1 last:mb-0">
          {group.name ? (
            <p className="px-2.5 pt-1.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              {group.name}
            </p>
          ) : null}
          {group.items.map(({ item, index }) => (
            <OptionRow
              key={`${group.name}-${item.value}`}
              item={item}
              index={index}
              active={highlight === index}
              terpilih={value === item.value}
              onMouseEnter={() => onHighlight(index)}
              onClick={() => !item.disabled && onPilih(item.value)}
            />
          ))}
        </div>
      ))}
    </>
  )
}

export default Dropdown