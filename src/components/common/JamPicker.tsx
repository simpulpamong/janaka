import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { ChevronDown, Clock } from "lucide-react"
import { cn } from "@/lib/cn"

/**
 * Pemilih waktu 24 jam.
 *
 * Satu panel dropdown berisi dua daftar bisa-gulir (Jam & Menit). Pilihan
 * diterapkan lewat tombol atau klik luar; `Esc` membatalkan draft.
 */

const LEBAR = 232
const TINGGI = 240
const JARAK = 8

const JAM = Array.from({ length: 24 }, (_, i) => i)
const MENIT = Array.from({ length: 60 }, (_, i) => i)

function dua(n: number): string {
  return String(n).padStart(2, "0")
}

function baca(value: string): { jam: number; menit: number } {
  const cocok = /^(\d{1,2}):(\d{1,2})$/.exec(value || "")
  if (!cocok) return { jam: 0, menit: 0 }
  return { jam: Math.min(23, Number(cocok[1])), menit: Math.min(59, Number(cocok[2])) }
}

export interface JamPickerProps {
  value: string
  onChange: (jam: string) => void
  disabled?: boolean
  className?: string
  id?: string
  "aria-label"?: string
}

export function JamPicker({
  value,
  onChange,
  disabled = false,
  className = "",
  id,
  "aria-label": ariaLabel,
}: JamPickerProps) {
  const pemicuRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [terbuka, setTerbuka] = useState(false)
  const [draft, setDraft] = useState(value || "00:00")
  const [posisi, setPosisi] = useState<{ atas: number; kiri: number; tinggi: number } | null>(null)
  const { jam: draftJam, menit: draftMenit } = baca(draft)

  const hitungPosisi = useCallback(() => {
    const el = pemicuRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const lebar = Math.min(LEBAR, Math.max(0, window.innerWidth - JARAK * 2))
    const tinggi = Math.max(1, Math.min(TINGGI, window.innerHeight - JARAK * 2))
    const ruangBawah = window.innerHeight - r.bottom - JARAK
    const ruangAtas = r.top - JARAK
    const keAtas = ruangBawah < tinggi && ruangAtas > ruangBawah
    const atasIdeal = keAtas ? r.top - tinggi - 6 : r.bottom + 6
    const atas = Math.min(
      Math.max(JARAK, atasIdeal),
      Math.max(JARAK, window.innerHeight - tinggi - JARAK),
    )
    setPosisi({
      atas,
      kiri: Math.min(Math.max(JARAK, r.left), Math.max(JARAK, window.innerWidth - lebar - JARAK)),
      tinggi,
    })
  }, [])

  useLayoutEffect(() => {
    if (!terbuka) return
    hitungPosisi()
    const frame = requestAnimationFrame(hitungPosisi)
    return () => cancelAnimationFrame(frame)
  }, [terbuka, hitungPosisi])

  useEffect(() => {
    if (!terbuka) return

    const terapkanDanTutup = () => {
      onChange(draft)
      setTerbuka(false)
    }
    const klikLuar = (e: Event) => {
      const t = e.target
      if (t instanceof Node && panelRef.current?.contains(t)) return
      if (t instanceof Node && pemicuRef.current?.contains(t)) return
      terapkanDanTutup()
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      e.stopPropagation()
      setTerbuka(false)
      pemicuRef.current?.focus({ preventScroll: true })
    }

    document.addEventListener("pointerdown", klikLuar)
    document.addEventListener("keydown", esc, true)
    window.addEventListener("resize", hitungPosisi)
    window.addEventListener("scroll", hitungPosisi, true)
    return () => {
      document.removeEventListener("pointerdown", klikLuar)
      document.removeEventListener("keydown", esc, true)
      window.removeEventListener("resize", hitungPosisi)
      window.removeEventListener("scroll", hitungPosisi, true)
    }
  }, [terbuka, draft, onChange, hitungPosisi])

  const terapkanDraft = () => {
    onChange(draft)
    setTerbuka(false)
    pemicuRef.current?.focus({ preventScroll: true })
  }

  const kolom = (
    judul: string,
    opsi: number[],
    terpilih: number,
    pilih: (n: number) => void,
  ) => (
    <div className="flex min-w-0 flex-1 flex-col">
      <p className="px-1 pb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {judul}
      </p>
      <ul
        role="listbox"
        aria-label={judul}
        tabIndex={-1}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-xl p-1"
      >
        {opsi.map((n) => (
          <li key={n}>
            <button
              type="button"
              role="option"
              aria-selected={n === terpilih}
              onClick={() => pilih(n)}
              className={cn(
                "block w-full rounded-lg py-1.5 font-mono text-sm font-bold tabular-nums transition-colors",
                n === terpilih
                  ? "bg-blue-600 text-white"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700",
              )}
            >
              {dua(n)}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )

  return (
    <div className={cn("relative w-full", className)}>
      <button
        ref={pemicuRef}
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={terbuka}
        aria-label={ariaLabel || "Pilih waktu"}
        disabled={disabled}
        onClick={() => {
          if (terbuka) {
            terapkanDraft()
            return
          }
          setDraft(value || "00:00")
          setTerbuka(true)
        }}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-2xl border px-3.5 py-2.5 text-left text-sm",
          "transition-colors disabled:cursor-not-allowed disabled:opacity-50",
          terbuka
            ? "border-blue-500 bg-white ring-2 ring-blue-500/15 dark:bg-slate-800"
            : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800/60 dark:hover:border-slate-600",
        )}
      >
        <span className="flex items-center gap-2">
          <Clock className="h-4 w-4 shrink-0 text-slate-400" />
          <span className="font-mono font-bold tabular-nums text-slate-700 dark:text-slate-200">
            {value || "--:--"}
          </span>
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-slate-400 transition-transform",
            terbuka && "rotate-180",
          )}
        />
      </button>

      {terbuka &&
        posisi &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label="Pilih waktu"
            className="fixed z-[11000] flex flex-col animate-drop rounded-[20px] border border-slate-200 bg-white p-3 shadow-dropdown dark:border-slate-700 dark:bg-slate-800"
            style={{
              top: posisi.atas,
              left: posisi.kiri,
              width: Math.min(LEBAR, window.innerWidth - JARAK * 2),
              height: posisi.tinggi,
            }}
          >
            <div className="mb-2 flex items-center justify-between gap-2 px-1">
              <span className="font-mono text-lg font-bold tabular-nums text-slate-800 dark:text-slate-100">
                {draft}
              </span>
              <button
                type="button"
                onClick={() => {
                  const sekarang = new Date()
                  setDraft(`${dua(sekarang.getHours())}:${dua(sekarang.getMinutes())}`)
                }}
                className="rounded-lg px-2 py-1 text-xs font-bold text-blue-600 transition-colors hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-slate-700"
              >
                Sekarang
              </button>
            </div>

            <div className="flex min-h-0 flex-1 gap-2">
              {kolom("Jam", JAM, draftJam, (n) => setDraft(`${dua(n)}:${dua(draftMenit)}`))}
              {kolom("Menit", MENIT, draftMenit, (n) => setDraft(`${dua(draftJam)}:${dua(n)}`))}
            </div>
            <div className="mt-2 flex justify-end border-t border-slate-100 pt-2 dark:border-slate-700">
              <button
                type="button"
                onClick={terapkanDraft}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-blue-700"
              >
                Pilih
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}

export default JamPicker
