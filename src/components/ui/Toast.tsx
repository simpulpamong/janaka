import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { createPortal } from "react-dom"
import { AlertTriangle, CircleAlert, CircleCheck, Info, X } from "lucide-react"
import { cn } from "@/lib/cn"

/**
 * Toast milik sendiri.
 *
 * Bukan `<div role="alert">` yang menempel di halaman dan bukan pustaka pihak
 * ketiga: notifikasi di JANAKA bisa dipanggil dari mana saja (termasuk dari
 * dalam modal), jadi posisinya harus `fixed` di viewport, bukan di dalam
 * subtree yang sedang digulir.
 *
 * Prinsipnya: **tidak pernah menumpuk lebih dari 3.** Notifikasi menumpuk tanpa
 * batas menutupi isi; yang penting (galat) bisa tenggelam di bawah yang tidak.
 */

export type ToastTone = "success" | "error" | "warning" | "info"

export interface ToastItem {
  id: number
  tone: ToastTone
  title: string
  description?: string
  /**_MS_; 0 = tidak menutup sendiri_ */
  durasi: number
  action?: { label: string; onClick: () => void }
}

export interface ToastApi {
  success: (title: string, description?: string) => void
  error: (title: string, description?: string) => void
  warning: (title: string, description?: string) => void
  info: (title: string, description?: string) => void
  /** Tutup notifikasi tertentu (mis. setelah toast "Memuat…" selesai). */
  dismiss: (id: number) => void
}

const ToastContext = createContext<ToastApi | null>(null)

/** Batas jumlah toast yang tampil bersamaan. */
const MAKS_TAMPIL = 3

const TONE = {
  success: {
    ikon: <CircleCheck className="w-[18px] h-[18px]" />,
    kelas: "text-emerald-600 dark:text-emerald-400",
    garis: "bg-emerald-500",
    aura: "shadow-emerald-500/10",
  },
  error: {
    ikon: <CircleAlert className="w-[18px] h-[18px]" />,
    kelas: "text-rose-600 dark:text-rose-400",
    garis: "bg-rose-500",
    aura: "shadow-rose-500/10",
  },
  warning: {
    ikon: <AlertTriangle className="w-[18px] h-[18px]" />,
    kelas: "text-amber-600 dark:text-amber-400",
    garis: "bg-amber-500",
    aura: "shadow-amber-500/10",
  },
  info: {
    ikon: <Info className="w-[18px] h-[18px]" />,
    kelas: "text-blue-600 dark:text-blue-400",
    garis: "bg-blue-500",
    aura: "shadow-blue-500/10",
  },
} as const

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const nextId = useRef(1)
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const clearTimer = useCallback((id: number) => {
    const t = timers.current.get(id)
    if (t) {
      clearTimeout(t)
      timers.current.delete(id)
    }
  }, [])

  const dismiss = useCallback(
    (id: number) => {
      clearTimer(id)
      setItems((prev) => prev.filter((item) => item.id !== id))
    },
    [clearTimer],
  )

  const push = useCallback(
    (tone: ToastTone, title: string, description?: string, durasi = 4000) => {
      const id = nextId.current++
      setItems((prev) => {
        const berikutnya = [...prev, { id, tone, title, description, durasi }]
        // Buang yang paling lama kalau melebihi batas.
        return berikutnya.slice(-MAKS_TAMPIL)
      })
      if (durasi > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), durasi),
        )
      }
      return id
    },
    [dismiss],
  )

  /* Bersihkan semua timer saat provider dilepas, supaya tidak ada
   * setState setelah unmount. */
  useEffect(() => {
    const peta = timers.current
    return () => {
      for (const t of peta.values()) clearTimeout(t)
      peta.clear()
    }
  }, [])

  const api = useMemo<ToastApi>(
    () => ({
      success: (title, description) => void push("success", title, description),
      error: (title, description) => void push("error", title, description, 6500),
      warning: (title, description) => void push("warning", title, description, 5500),
      info: (title, description) => void push("info", title, description),
      dismiss,
    }),
    [push, dismiss],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      {typeof document !== "undefined"
        ? createPortal(
            <div
              role="region"
              aria-label="Notifikasi"
              className="pointer-events-none fixed z-[12000] right-3 bottom-3 sm:right-5 sm:bottom-5 flex w-[calc(100vw-1.5rem)] sm:w-auto sm:max-w-sm flex-col gap-2.5 janaka-no-print"
            >
              {items.map((item) => (
                <ToastCard key={item.id} item={item} onClose={() => dismiss(item.id)} />
              ))}
            </div>,
            document.body,
          )
        : null}
    </ToastContext.Provider>
  )
}

function ToastCard({ item, onClose }: { item: ToastItem; onClose: () => void }) {
  const tone = TONE[item.tone]
  return (
    <div
      role={item.tone === "error" ? "alert" : "status"}
      aria-live={item.tone === "error" ? "assertive" : "polite"}
      className={cn(
        "animate-fade-in pointer-events-auto relative flex items-start gap-3 overflow-hidden",
        "rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-800/95",
        "backdrop-blur-md px-4 py-3.5 shadow-xl shadow-slate-900/10 dark:shadow-black/40",
        tone.aura,
      )}
    >
      {/* Garis warna di kiri — penanda nada yang tidak bergantung pada ikon. */}
      <span
        className={cn("absolute left-0 top-0 bottom-0 w-1", tone.garis)}
        aria-hidden="true"
      />
      <span className={cn("shrink-0 mt-px", tone.kelas)} aria-hidden="true">
        {tone.ikon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold text-slate-800 dark:text-slate-100 break-words leading-snug">
          {item.title}
        </p>
        {item.description ? (
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 break-words leading-relaxed">
            {item.description}
          </p>
        ) : null}
        {item.action ? (
          <button
            type="button"
            onClick={() => {
              item.action?.onClick()
              onClose()
            }}
            className="mt-2 text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline"
          >
            {item.action.label}
          </button>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Tutup notifikasi"
        className="shrink-0 p-1 -mr-1 -mt-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

/** Akses toast dari mana saja. Aman dipanggil di luar provider (returns no-op). */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (ctx) return ctx
  return {
    success: () => {},
    error: () => {},
    warning: () => {},
    info: () => {},
    dismiss: () => {},
  }
}