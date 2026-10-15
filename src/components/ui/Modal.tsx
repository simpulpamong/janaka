import { useEffect, useRef, type ReactNode } from "react"
import { AlertTriangle, Info, X, XCircle } from "lucide-react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/cn"

/**
 * Skala lapisan (lihat juga `Dropdown.tsx`):
 *   10 000 modal · 11 000 overlay di dalam modal · 12 000 toast.
 *
 * Overlay di dalam modal **harus** bernomor lebih tinggi dari modal. Kalau
 * tidak, dropdown atau kalender di dalam modal akan muncul di belakang panel
 * modal yang gelap.
 */
/**
 * Modal & dialog konfirmasi milik sendiri.
 *
 * Semua konfirmasi di aplikasi ini lewat komponen ini — **tidak ada**
 * `window.confirm` / `window.alert` / `window.prompt` bawaan browser. Dialog
 * native tidak bisa diberi gaya, memblokir pengetikan di input yang sama, dan
 * tampilannya berbeda tiap OS.
 *
 * ## Kenapa tanpa `motion/react`
 * Modal ini paling sering dibuka-tutup, jadi animasinya harus murah. Tiga hal
 * yang membuat modal terasa berat, dan ketiganya dihilangkan:
 *  1. `backdrop-blur` pada overlay — browser mengambil ulang & mengaburkan
 *     seluruh isi layar **di setiap frame**.
 *  2. `scale` pada panel — memaksa hitung ulang isi panel tiap frame;
 *     `translate` tidak.
 *  3. Perubahan `overflow` pada `<body>` — shell sudah mengunci gulir.
 *
 * Sekarang: keyframe CSS (`.modal-panel-enter`), overlay tanpa blur, panel
 * hanya dianimasikan `translateY`. Semuanya compositor-only, dan modal langsung
 * hilang saat ditutup — lebih responsif daripada menunggu animasi keluar.
 */

/**
 * Kunci gulir halaman dengan penghitung.
 *
 * Diperlukan karena beberapa modal bisa bertumpuk. Tanpa penghitung, modal
 * yang menutup paling dalam akan membuka gulir halaman padahal masih ada modal
 * di atasnya.
 */
let kunciGulir = 0
let overflowSebelum = ""

function kunciGulirHalaman(): void {
  if (kunciGulir === 0) {
    overflowSebelum = document.body.style.overflow
    document.body.style.overflow = "hidden"
  }
  kunciGulir += 1
}

function bukaGulirHalaman(): void {
  kunciGulir = Math.max(0, kunciGulir - 1)
  if (kunciGulir === 0) {
    document.body.style.overflow = overflowSebelum
  }
}

export interface ModalProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  /** Ikon di sebelah judul. */
  icon?: ReactNode
  size?: "xs" | "sm" | "md" | "lg" | "xl"
  children: ReactNode
  /** Aksi di footer; kalau kosong, tombol Tutup otomatis. */
  footer?: ReactNode
  /** Sembunyikan tombol × di kanan atas. */
  hideClose?: boolean
  /** Sembunyikan seluruh footer modal. */
  hideFooter?: boolean
  /** Kunci gulir di dalam panel (default untuk modal berisi tabel panjang). */
  scrollable?: boolean
  /**
   * Paksa panel gelap apa pun tema aplikasi.
   *
   * Diperlukan untuk penampil kamera/foto: panelnya dibikin gelap supaya
   * foto jadi fokus, tapi header & footer masih memakai warna berbasis tema.
   * Di mode terang, teks terang di footer berlatar terang tidak terbaca.
   */
  tone?: "default" | "dark"
  className?: string
}

const SIZES = {
  xs: "max-w-xs",
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
} as const

export function Modal({
  open,
  onClose,
  title,
  icon,
  size = "md",
  children,
  footer,
  hideClose = false,
  hideFooter = false,
  scrollable = true,
  tone = "default",
  className = "",
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)

  /*
   * `onClose` biasanya arrow function inline di pemanggil, jadi identitasnya
   * berubah tiap render. Kalau masuk ke dependensi `useEffect` di bawah, efek
   * berjalan ulang terus-menerus — setiap render memasang ulang listener
   * Escape, menulis ulang `overflow` body, dan memfokuskan panel lagi. Itu
   * penyebab modal terasa "nyangkut" saat dipakai.
   */
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation()
        onCloseRef.current()
      }
    }
    document.addEventListener("keydown", onKeyDown)
    kunciGulirHalaman()

    // Fokuskan panel supaya keyboard & screen reader masuk ke dialog.
    // `preventScroll` mencegah halaman ikut ter-scroll ke panel.
    panelRef.current?.focus({ preventScroll: true })

    return () => {
      document.removeEventListener("keydown", onKeyDown)
      bukaGulirHalaman()
    }
  }, [open])

  if (!open) return null

  const gelap = tone === "dark"

  const modal = (
    <div
      className="modal-overlay-enter fixed inset-0 z-[10000] flex items-end sm:items-center justify-center overscroll-none p-0 sm:p-6 bg-slate-950/70"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        onClick={(event) => event.stopPropagation()}
        className={cn(
          "modal-panel-enter w-full sm:rounded-2xl rounded-t-2xl",
          SIZES[size],
          "max-h-[92dvh] sm:max-h-[calc(100dvh-3rem)] flex flex-col",
          "bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/50",
          "shadow-2xl shadow-slate-950/30 overflow-hidden overscroll-contain outline-none",
          className,
        )}
      >
        {title ? (
          <div
            className={cn(
              "flex items-center justify-between gap-3 px-5 py-3 border-b shrink-0",
              gelap ? "border-slate-700/60" : "border-slate-200/60 dark:border-slate-700/50",
            )}
          >
            <h3
              className={cn(
                "text-sm sm:text-base font-bold flex items-center gap-2 min-w-0",
                gelap ? "text-slate-100" : "text-slate-800 dark:text-slate-100",
              )}
            >
              {icon}
              <span className="truncate">{title}</span>
            </h3>
            {!hideClose ? (
              <button
                type="button"
                onClick={onClose}
                className={cn(
                  "p-1.5 rounded-lg transition-colors shrink-0",
                  gelap
                    ? "text-slate-400 hover:text-slate-100 hover:bg-slate-800"
                    : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700",
                )}
                aria-label="Tutup"
              >
                <X className="w-4 h-4" />
              </button>
            ) : null}
          </div>
        ) : null}

        <div
          className={cn(
            "px-5 py-3",
            scrollable && "min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y custom-scrollbar",
          )}
        >
          {children}
        </div>

        {!hideFooter ? (
          <div
            className={cn(
              "janaka-modal-footer shrink-0 px-5 py-2.5 border-t flex items-center justify-center gap-3 flex-wrap sm:justify-end",
              gelap
                ? "border-slate-700/60 bg-slate-900/60"
                : "border-slate-200/60 dark:border-slate-700/50 bg-slate-50 dark:bg-slate-900/30",
            )}
          >
            {footer ?? (
              <button
                type="button"
                onClick={onClose}
                className={cn(
                  "w-full rounded-xl border px-4 py-2.5 text-sm font-bold shadow-xs transition-colors",
                  gelap
                    ? "border-slate-700 text-slate-200 hover:bg-slate-800"
                    : "border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700",
                )}
              >
                Tutup
              </button>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )

  return typeof document === "undefined" ? modal : createPortal(modal, document.body)
}

/* ══════════════════════════════════════════════════════════════════
 *  Dialog konfirmasi
 * ══════════════════════════════════════════════════════════════════ */

export interface ConfirmDialogProps {
  open: boolean
  title: string
  message: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** `danger` untuk aksi merusak (hapus, keluar). */
  tone?: "default" | "danger" | "warning"
  onConfirm: () => void
  onCancel: () => void
  loading?: boolean
}

const CONFIRM_TONES = {
  default: {
    icon: <Info className="w-5 h-5" />,
    iconClass: "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400",
    button: "bg-blue-600 hover:bg-blue-700 focus-visible:ring-blue-500",
  },
  warning: {
    icon: <AlertTriangle className="w-5 h-5" />,
    iconClass: "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400",
    button: "bg-amber-600 hover:bg-amber-700 focus-visible:ring-amber-500",
  },
  danger: {
    icon: <XCircle className="w-5 h-5" />,
    iconClass: "bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400",
    button: "bg-rose-600 hover:bg-rose-700 focus-visible:ring-rose-500",
  },
} as const

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Ya, Lanjutkan",
  cancelLabel = "Batal",
  tone = "default",
  onConfirm,
  onCancel,
  loading = false,
}: ConfirmDialogProps) {
  const konf = CONFIRM_TONES[tone]

  return (
    <Modal
      open={open}
      onClose={onCancel}
      size="sm"
      hideClose
      footer={
        <div className="flex flex-col-reverse sm:flex-row gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={cn(
              "px-5 py-2.5 rounded-xl text-white text-sm font-bold transition-colors disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-800 whitespace-nowrap",
              konf.button,
            )}
          >
            {loading ? "Memproses…" : confirmLabel}
          </button>
        </div>
      }
    >
      <div className="flex gap-3.5">
        <div
          className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
            konf.iconClass,
          )}
        >
          {konf.icon}
        </div>
        <div className="min-w-0 pt-0.5">
          <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{title}</p>
          <div className="mt-1.5 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            {message}
          </div>
        </div>
      </div>
    </Modal>
  )
}