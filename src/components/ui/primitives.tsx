/**
 * Kit komponen kecil yang dipakai bersama oleh seluruh halaman JANAKA.
 *
 * Sengaja statis (bukan konfigurasi Tailwind) supaya konsisten dengan gaya
 * prabawa: sudut membulat `rounded-2xl`, warna slate + aksen biru, dan
 * `dark:` yang selalu punya pasangan terang/gelap.
 */

import {
  useLayoutEffect,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react"
import {
  AlertCircle,
  CircleAlert,
  CircleCheck,
  Eye,
  EyeOff,
  Inbox,
  Info,
  Loader2,
} from "lucide-react"
import { cn } from "@/lib/cn"

/* ══════════════════════════════════════════════════════════════════
 *  Judul halaman
 * ══════════════════════════════════════════════════════════════════ */

/**
 * Baris aksi di atas konten.
 *
 * ## Kenapa `title` boleh dikosongkan
 * Topbar sudah memuat nama halaman yang sedang aktif. Mengulangnya di sini
 * sebagai judul besar hanya memakan tinggi layar tanpa menambah informasi,
 * jadi halaman yang tidak butuh judul cukup mengosongkan `title` dan
 * menyisakan `action`.
 */
export function PageHeader({
  title,
  subtitle,
  icon,
  action,
}: {
  title?: string
  subtitle?: string
  icon?: ReactNode
  action?: ReactNode
}) {
  // Tanpa judul: sisakan baris aksi saja, tetap rata kanan di semua lebar.
  if (!title) {
    if (!action) return null
    return <div className="flex flex-wrap items-center justify-end gap-2">{action}</div>
  }

  return (
    <div className="flex items-start justify-between gap-3 sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {icon ? (
          <div className="w-11 h-11 rounded-2xl bg-blue-500/10 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 border border-blue-500/10">
            {icon}
          </div>
        ) : null}
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-slate-100 tracking-tight truncate">
            {title}
          </h1>
          {subtitle ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>
          ) : null}
        </div>
      </div>
      {/* Aksi tetap rata kanan pada semua lebar layar — tidak turun ke bawah
          judul di ponsel. `shrink-0` menjaga tombol agar tidak ikut tergesot
          saat judul punya `truncate`. */}
      {action ? (
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{action}</div>
      ) : null}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════
 *  Kartu / panel
 * ══════════════════════════════════════════════════════════════════ */

export function Card({
  children,
  className = "",
  padded = true,
  as: Tag = "section",
  ref,
}: {
  children: ReactNode
  className?: string
  padded?: boolean
  as?: "section" | "div" | "article"
  ref?: Ref<HTMLElement>
}) {
  return (
    <Tag
      ref={ref as never}
      className={cn(
        "bg-white dark:bg-slate-800/60 border border-slate-200/90 dark:border-slate-700/60 rounded-2xl shadow-[0_1px_3px_0_rgba(15,23,42,0.07),0_1px_2px_-1px_rgba(15,23,42,0.06)] dark:shadow-none hover:shadow-[0_4px_6px_-1px_rgba(15,23,42,0.06),0_2px_4px_-2px_rgba(15,23,42,0.04)] transition-shadow",
        padded && "p-5 sm:p-6",
        className,
      )}
    >
      {children}
    </Tag>
  )
}

export function CardTitle({
  children,
  description,
  action,
}: {
  children: ReactNode
  description?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-3 mb-4">
      <div className="min-w-0">
        <h2 className="text-sm font-bold text-slate-950 dark:text-slate-100">{children}</h2>
        {description ? (
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════
 *  Statistik
 * ══════════════════════════════════════════════════════════════════ */

const TILE_TONES = {
  blue: "from-blue-500/10 to-blue-500/0 text-blue-600 dark:text-blue-400",
  emerald: "from-emerald-500/10 to-emerald-500/0 text-emerald-600 dark:text-emerald-400",
  amber: "from-amber-500/10 to-amber-500/0 text-amber-600 dark:text-amber-400",
  rose: "from-rose-500/10 to-rose-500/0 text-rose-600 dark:text-rose-400",
  violet: "from-violet-500/10 to-violet-500/0 text-violet-600 dark:text-violet-400",
  slate: "from-slate-500/10 to-slate-500/0 text-slate-600 dark:text-slate-400",
} as const

export type TileTone = keyof typeof TILE_TONES

export function StatTile({
  label,
  value,
  hint,
  icon,
  tone = "blue",
  onClick,
}: {
  label: string
  value: ReactNode
  hint?: string
  icon?: ReactNode
  tone?: TileTone
  /** Bila diisi, kartu jadi tombol (dipakai filter dashboard). */
  onClick?: () => void
}) {
  const isi = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100 truncate">
          {label}
        </p>
        {icon ? <span className="shrink-0">{icon}</span> : null}
      </div>
      <p className="mt-2 text-2xl font-bold font-mono text-slate-800 dark:text-slate-100 truncate">
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 truncate">{hint}</p> : null}
    </>
  )

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl bg-gradient-to-br",
        TILE_TONES[tone],
        "border border-slate-200/90 dark:border-slate-700/60 bg-white dark:bg-slate-800/60 p-4 shadow-[0_1px_3px_0_rgba(15,23,42,0.06),0_1px_2px_rgba(15,23,42,0.04)] dark:shadow-none",
        onClick &&
          "cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-blue-500/40",
      )}
    >
      {onClick ? (
        <button type="button" onClick={onClick} className="block w-full text-left">
          {isi}
        </button>
      ) : (
        isi
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════
 *  Tombol
 * ══════════════════════════════════════════════════════════════════ */

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "success"
  | "warning"
export type ButtonSize = "sm" | "md" | "lg"

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-blue-600 text-white hover:bg-blue-700 shadow-[0_1px_2px_rgba(0,0,0,0.06)]",
  secondary:
    "bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-700/70 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-600 shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-none",
  ghost:
    "bg-transparent text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800",
  danger: "bg-rose-600 text-white hover:bg-rose-700 shadow-[0_1px_2px_rgba(0,0,0,0.06)]",
  success: "bg-emerald-600 text-white hover:bg-emerald-700 shadow-[0_1px_2px_rgba(0,0,0,0.06)]",
  warning: "bg-amber-500 text-white hover:bg-amber-600 shadow-[0_1px_2px_rgba(0,0,0,0.06)]",
}

const SIZES: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs gap-1.5 rounded-lg",
  md: "px-4 py-2.5 text-sm gap-2 rounded-xl",
  lg: "px-6 py-3.5 text-sm gap-2 rounded-xl",
}

/** Kelas dasar tombol — dipakai `TombolMenu` agar warnanya sama persis. */
export function gayaTombol(variant: ButtonVariant = "primary", size: ButtonSize = "md"): string {
  return `${VARIANTS[variant]} ${SIZES[size]}`
}

export interface ActionButtonProps extends React.ComponentPropsWithRef<"button"> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  icon?: ReactNode
  block?: boolean
}

/*
 * ⚠️ `whitespace-nowrap` + `shrink-0` di dalam `className` — bukan detail tampilan.
 * Tanpa `whitespace-nowrap`, ruang yang kurang sedikit membuat label turun ke
 * baris kedua **di dalam tombol**. Tanpa `shrink-0`, tombol ikut menyusut lebih
 * dulu daripada teks di sebelahnya — padahal teks itu sudah punya `truncate`.
 */
export function ActionButton({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  block = false,
  className = "",
  children,
  disabled,
  type = "button",
  ...rest
}: ActionButtonProps) {
  return (
    <button
      type={type}
      {...rest}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center font-semibold transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40 whitespace-nowrap shrink-0",
        gayaTombol(variant, size),
        block && "w-full",
        className,
      )}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}
      {children}
    </button>
  )
}

/* ══════════════════════════════════════════════════════════════════
 *  Form
 * ══════════════════════════════════════════════════════════════════ */

const FIELD_BASE =
  "block w-full px-3.5 py-2.5 bg-white dark:bg-slate-900/50 border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all disabled:opacity-50"

export function Field({
  label,
  hint,
  error,
  required,
  children,
  className = "",
  htmlFor,
}: {
  label?: string
  hint?: string
  /** Bila ada, `aria-invalid` ikut dipasang agar pembaca layar membacanya
   * sebagai error, bukan teks biasa. */
  error?: string
  required?: boolean
  children: ReactNode
  className?: string
  htmlFor?: string
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {label ? (
        <label
          htmlFor={htmlFor}
          className="block text-[11px] font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100 ml-1"
        >
          {label}
          {required ? <span className="text-rose-500 ml-0.5">*</span> : null}
        </label>
      ) : null}
      {children}
      {/* Error menang atas hint. Menampilkan keduanya berarti field yang salah
       * juga menampilkan penjelasan normalnya — dua pesan untuk satu field,
       * dan yang salah justru yang tenggelam. */}
      {error ? (
        <p role="alert" className="text-[11px] text-rose-500 dark:text-rose-400 ml-1">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[11px] text-slate-400 dark:text-slate-500 ml-1">{hint}</p>
      ) : null}
    </div>
  )
}

export function Input({
  className = "",
  invalid,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={cn(
        FIELD_BASE,
        invalid && "border-rose-400 focus:border-rose-500 focus:ring-rose-500/20",
        className,
      )}
      {...rest}
    />
  )
}

export function Textarea({
  className = "",
  invalid,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return (
    <textarea
      aria-invalid={invalid || undefined}
      className={cn(
        FIELD_BASE,
        "resize-y min-h-[88px]",
        invalid && "border-rose-400 focus:border-rose-500 focus:ring-rose-500/20",
        className,
      )}
      {...rest}
    />
  )
}

/**
 * Input dengan awalan yang menempel (ikon di kiri).
 *
 * Ikon ikut bagian dalam satu `div` ber-border, bukan `position:absolute` di
 * atas input — jadi tidak ada ruang yang harus disisakan dan tidak ada
 * `--tw-ring` yang terpotong di tepi.
 */
export function InputWithIcon({
  icon,
  className = "",
  invalid,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { icon?: ReactNode; invalid?: boolean }) {
  if (!icon) return <Input className={className} invalid={invalid} {...rest} />
  return (
    <div
      className={cn(
        "flex items-stretch overflow-hidden rounded-xl border bg-white dark:bg-slate-900/50 shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-none transition-all",
        invalid
          ? "border-rose-400"
          : "border-slate-300 dark:border-slate-700 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20",
      )}
    >
      <span className="flex shrink-0 items-center pl-3.5 pr-0 text-slate-400">{icon}</span>
      <input
        aria-invalid={invalid || undefined}
        className={cn(
          "min-w-0 flex-1 rounded-none !border-0 bg-transparent px-3 py-2.5 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-0 dark:bg-transparent",
          className,
        )}
        {...rest}
      />
    </div>
  )
}

/**
 * Field password dengan tombol lihat/sembunyikan.
 *
 * Satu implementasi, bukan ditulis ulang di lima tempat dengan sedikit
 * perbedaan. Yang paling penting bukan keseragaman, tapi **penyejajaran**:
 * posisinya benar, ukurannya memenuhi target sentuh, `aria-pressed` ikut
 * berubah.
 */
export function PasswordField({
  id,
  value,
  onChange,
  placeholder,
  autoComplete = "current-password",
  maxLength,
  disabled,
  className = "",
  inputClassName = "",
  invalid,
  leadingIcon,
  "aria-label": ariaLabel,
}: {
  id?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  autoComplete?: string
  maxLength?: number
  disabled?: boolean
  className?: string
  /** Kelas tambahan untuk `<input>` — mis. `pl-10` saat ada ikon kiri. */
  inputClassName?: string
  invalid?: boolean
  /** Ikon di kiri input (mis. kunci) — supaya konsisten dengan field lain. */
  leadingIcon?: ReactNode
  "aria-label"?: string
}) {
  const [lihat, setLihat] = useState(false)
  return (
    <div className={cn("relative", className)}>
      {leadingIcon ? (
        <div className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
          {leadingIcon}
        </div>
      ) : null}
      <Input
        id={id}
        type={lihat ? "text" : "password"}
        value={value}
        onChange={(event) => {
          const next = event.target.value
          onChange(maxLength ? next.slice(0, maxLength) : next)
        }}
        placeholder={placeholder}
        autoComplete={autoComplete}
        disabled={disabled}
        invalid={invalid}
        aria-label={ariaLabel}
        // `pr-11` menyisakan ruang untuk tombol mata di kanan.
        // `pl-10` ditambahkan hanya saat ada ikon kiri.
        className={cn(leadingIcon && "pl-10", "pr-11", inputClassName)}
      />
      <button
        type="button"
        onClick={() => setLihat((prev) => !prev)}
        disabled={disabled}
        aria-label={lihat ? "Sembunyikan sandi" : "Tampilkan sandi"}
        aria-pressed={lihat}
        title={lihat ? "Sembunyikan sandi" : "Tampilkan sandi"}
        className="absolute right-1 top-1/2 -translate-y-1/2 p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors disabled:opacity-40"
      >
        {lihat ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  )
}

/** Indikator kekuatan password. */
export function StrengthMeter({ value }: { value: string }) {
  const hitung = (teks: string): number => {
    let skor = 0
    if (teks.length >= 6) skor++
    if (teks.length >= 10) skor++
    if (/[A-Z]/.test(teks)) skor++
    if (/[0-9]/.test(teks)) skor++
    if (/[^A-Za-z0-9]/.test(teks)) skor++
    return skor
  }
  const skor = hitung(value)
  const label = ["Sangat lemah", "Lemah", "Cukup", "Kuat", "Sangat kuat"][skor] ?? ""
  const warna = [
    "bg-rose-500",
    "bg-orange-500",
    "bg-amber-500",
    "bg-emerald-500",
    "bg-emerald-600",
  ][skor]

  return (
    <div className="space-y-1 pt-1">
      <div className="flex gap-1" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={cn("h-1 flex-1 rounded-full transition-colors", i < skor ? warna : "bg-slate-200 dark:bg-slate-700")}
          />
        ))}
      </div>
      <p className="text-[11px] text-slate-400 dark:text-slate-500">
        Kekuatan: <span className="font-semibold text-slate-600 dark:text-slate-300">{label}</span>
      </p>
    </div>
  )
}

/**
 * Tab.
 *
 * Penanda aktif memakai `layoutId` dari `motion/react` sehinggaBergeser
 *mulut di bawah label — bukan sekadar berubah warna.
 */
export function Tabs<T extends string>({
  value,
  onChange,
  items,
  className = "",
  layoutId = "janaka-tab",
  iconOnlyMobile = false,
}: {
  value: T
  onChange: (value: T) => void
  items: { id: T; label: string; icon?: ReactNode; badge?: ReactNode }[]
  className?: string
  layoutId?: string
  iconOnlyMobile?: boolean
}) {
  return (
    <div
      role="tablist"
      className={cn(
        "flex gap-1 overflow-x-auto rounded-2xl border border-slate-200/90 dark:border-slate-700/60 bg-slate-100/90 dark:bg-slate-800/40 p-1.5 shadow-xs",
        iconOnlyMobile && "grid grid-flow-col auto-cols-fr sm:flex",
        className,
      )}
    >
      {items.map((item) => {
        const aktif = item.id === value
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={aktif}
            aria-label={iconOnlyMobile ? item.label : undefined}
            onClick={() => onChange(item.id)}
            className={cn(
              "relative flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors",
              iconOnlyMobile && "min-w-0 justify-center px-2.5 sm:flex-initial sm:justify-start sm:px-3.5",
              aktif
                ? "text-white"
                : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/60",
            )}
          >
            {aktif ? (
              <TabIndicator layoutId={layoutId} className="absolute inset-0 rounded-xl bg-blue-600" />
            ) : null}
            {/*
             * `icon` adalah *node*, bukan tipe komponen. Memakainya sebagai
             * `<Icon />` hanya bekerja kalau pemanggil mengirim `Building2`
             * (fungsi), bukan `<Building2 />` (elemen yang sudah jadi) —
             * yang kedua membuat React mengira sebuah literal JSX diekspor
             * sebagai komponen.
             */}
            <span className="relative flex items-center gap-2">
              {item.icon ? (
                <span className="[&>svg]:h-4 [&>svg]:w-4" aria-hidden="true">
                  {item.icon}
                </span>
              ) : null}
              <span className={iconOnlyMobile ? "sr-only sm:not-sr-only" : undefined}>
                {item.label}
              </span>
              {item.badge}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/* Diimpor terpisah supaya `Tabs` tetap bisa dipakai tanpa menarik `motion`
 * ke bundle komponen lain. */
import { motion } from "motion/react"

function TabIndicator({
  layoutId,
  className,
}: {
  layoutId: string
  className?: string
}) {
  return (
    <motion.span
      layoutId={layoutId}
      className={className}
      transition={{ type: "spring", stiffness: 420, damping: 34 }}
      aria-hidden="true"
    />
  )
}

/* ══════════════════════════════════════════════════════════════════
 *  Status
 * ══════════════════════════════════════════════════════════════════ */

const BADGE_TONES = {
  slate:
    "bg-slate-100 dark:bg-slate-700/60 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-600",
  blue: "bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-300/80 dark:border-blue-500/20",
  emerald:
    "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-300/80 dark:border-emerald-500/20",
  amber:
    "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-300/80 dark:border-amber-500/20",
  rose: "bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-300/80 dark:border-rose-500/20",
  violet:
    "bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-300/80 dark:border-violet-500/20",
  outline: "border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-500",
} as const

export type BadgeTone = keyof typeof BADGE_TONES

export function Badge({
  children,
  tone = "slate",
  className = "",
}: {
  children: ReactNode
  tone?: BadgeTone
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

/**
 * Kotak informasi dengan warna sesuai nada.
 *
 * | nada      | ikon          | artinya                 |
 * |-----------|---------------|-------------------------|
 * | `amber`   | `AlertCircle` | perlu-hatian            |
 * | `rose`    | `CircleAlert` | gagal                   |
 * | `blue`    | `Info`        | memberi tahu, netral    |
 * | `emerald` | `CircleCheck` | berhasil / dalam aturan |
 */
export function Alert({
  children,
  tone = "amber",
  icon,
  action,
  className = "",
}: {
  children: ReactNode
  tone?: "amber" | "rose" | "blue" | "emerald"
  /** Ikon kustom, atau `false` untuk mematikan ikon bawaan. */
  icon?: ReactNode | false
  /** Aksi di kanan (mis. tombol "Muat Ulang"). */
  action?: ReactNode
  className?: string
}) {
  const tones = {
    amber:
      "bg-amber-50 border-amber-300 text-amber-800 dark:bg-amber-500/10 dark:border-amber-500/20 dark:text-amber-400 shadow-xs",
    rose: "bg-rose-50 border-rose-300 text-rose-800 dark:bg-rose-500/10 dark:border-rose-500/20 dark:text-rose-400 shadow-xs",
    blue: "bg-blue-50 border-blue-300 text-blue-800 dark:bg-blue-500/10 dark:border-blue-500/20 dark:text-blue-400 shadow-xs",
    emerald:
      "bg-emerald-50 border-emerald-300 text-emerald-800 dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-400 shadow-xs",
  } as const

  const bawaan = {
    amber: <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />,
    rose: <CircleAlert className="w-4 h-4 shrink-0 mt-0.5" />,
    blue: <Info className="w-4 h-4 shrink-0 mt-0.5" />,
    emerald: <CircleCheck className="w-4 h-4 shrink-0 mt-0.5" />,
  } as const

  const ikon = icon === false ? null : (icon ?? bawaan[tone])

  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-2.5 p-3.5 rounded-xl text-sm font-medium border",
        tones[tone],
        className,
      )}
    >
      {ikon}
      <span className="leading-relaxed break-words flex-1">{children}</span>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

export function EmptyState({
  message,
  hint,
  icon,
  action,
}: {
  message: string
  hint?: string
  icon?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-3">
        {icon ?? <Inbox className="w-6 h-6 text-slate-400 dark:text-slate-500" />}
      </div>
      <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">{message}</p>
      {hint ? <p className="mt-1 text-xs text-slate-400 dark:text-slate-500 max-w-sm">{hint}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════
 *  Skeleton
 * ══════════════════════════════════════════════════════════════════ */

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={cn("janaka-skeleton rounded-lg", className)} />
}

/**
 * Kerangka tabel.
 *
 * Tingginya sengaja mengikuti tabel yang asli: header `pb-3`, sel `py-3`.
 * Kalau lebih rapat dari aslinya, baris pertama yang tiba akan mendorong
 * isi ke bawah — itulah "lompatan layout" yang paling sering dikeluhkan.
 *
 * `bordered` reproducing the `bg-slate-100/75` header and the rounded box used
 * by the `bordered` prop on `DataTable`.
 */
export function SkeletonTable({
  columns = 6,
  rows = 5,
  bordered = false,
}: {
  columns?: number
  rows?: number
  bordered?: boolean
}) {
  return (
    <div className="space-y-3" role="status" aria-label="Memuat tabel">
      <div
        aria-hidden="true"
        className={cn(
          "grid gap-3 border-b border-slate-200 px-3 pb-3 dark:border-slate-700",
          bordered &&
            "rounded-t-xl border border-b-0 border-slate-200 bg-slate-100/75 dark:border-slate-700 dark:bg-slate-800/40",
        )}
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: columns }).map((_, index) => (
          <Skeleton key={index} className="h-2.5 w-3/4" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, row) => (
        <div
          key={row}
          aria-hidden="true"
          className={cn(
            "grid items-center gap-3 rounded-xl border border-slate-100 px-3 py-3 dark:border-slate-700/60",
            bordered &&
              "rounded-b-xl rounded-t-none border-slate-200 border-t-0 last:rounded-b-xl dark:border-slate-700",
          )}
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: columns }).map((_, column) => (
            <Skeleton
              key={column}
              className={cn(
                "h-3",
                column === 0 ? "w-4/5" : column === columns - 1 ? "w-1/2" : "w-3/5",
              )}
            />
          ))}
        </div>
      ))}
      <span className="sr-only">Memuat data…</span>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════
 *  Tabel
 * ══════════════════════════════════════════════════════════════════ */

export interface Column<T> {
  key: string
  header: string
  render: (row: T, index: number) => ReactNode
  className?: string
  /**
   * Kolom ini jadi **judul kartu** di layar sempit.
   * Default: kolom pertama yang punya header.
   */
  mobileTitle?: boolean
}

/**
 * Toleransi pembulatan piksel saat membandingkan min-content tabel dengan
 * lebar wadah. Tanpa ini tabel bisa tertukar ke kartu karena selisih pecahan
 * satu piksel dari `getBoundingClientRect`.
 */
const TOLERANSI_PX = 2

/**
 * Min-content tabel, diukur dari DOM — bukan ditebak dari daftar breakpoint.
 *
 * Tabel asli tidak bisa diukur begitu saja karena diberi `w-full`. Karena itu
 * yang diukur adalah **klon** yang dititipkan sebentar di luar layar lalu
 * langsung dibuang.
 */
function ukurMinContentTabel(tabel: HTMLElement): number {
  const wadah = document.createElement("div")
  wadah.setAttribute("aria-hidden", "true")
  wadah.style.cssText =
    "position:fixed;left:-99999px;top:0;width:min-content;pointer-events:none;visibility:hidden;"
  const klon = tabel.cloneNode(true) as HTMLElement
  // Klon hidup di luar React, jadi tidak punya `ownerDocument` yang sama
  // dengan event handler. Id pun disalin mentah; dua elemen ber-id sama di
  // satu dokumen bisa membuat `aria-controls` melompat ke klon.
  klon.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"))
  klon.style.width = "auto"
  wadah.appendChild(klon)
  document.body.appendChild(wadah)
  const lebar = wadah.getBoundingClientRect().width
  wadah.remove()
  return Math.ceil(lebar)
}

/**
 * Tabel data, dengan tampilan kartu untuk wadah sempit.
 *
 * ## Kenapa bukan `overflow-x-auto` saja
 * Pada tabel 7–8 kolom, pengguna harus menggulir horizontal untuk melihat kolom
 * paling kanan, lalu menggulir vertikal — dua sumbu untuk satu tabel. Bentuk
 * kartu memaksa satu sumbu saja.
 *
 * ## Kenapa diukur, bukan breakpoint
 * **Satu.** Min-content tiap tabel berbeda jauh (Laporan 629px, Riwayat 994px).
 * **Dua.** Lebar wadah tidak monoton terhadap lebar viewport — sidebar melebar
 * tepat pada `lg` (1024px), jadi wadah justru lebih sempit di 1024px daripada
 * di 768px.
 *
 * ## Kolom teks panjang wajib punya plafon `max-width`
 * `truncate` sendirian **tidak membatasi apa pun**. Yang benar-benar menurunkan
 * min-content hanyalah `max-width` pada `Column.className`.
 */
export function DataTable<T>({
  columns,
  rows,
  keyOf,
  emptyMessage = "Belum ada data.",
  loading = false,
  skeletonRows = 5,
  alwaysTable = false,
  bordered = false,
}: {
  columns: Column<T>[]
  rows: T[]
  keyOf: (row: T, index: number) => string
  emptyMessage?: string
  loading?: boolean
  skeletonRows?: number
  alwaysTable?: boolean
  /** Beri garis vertikal pemisah antar kolom. */
  bordered?: boolean
}) {
  const wadahRef = useRef<HTMLDivElement>(null)
  const tabelRef = useRef<HTMLTableElement>(null)
  const ukurRef = useRef<() => void>(() => {})
  const [muatTabel, setMuatTabel] = useState(false)

  /*
   * Tabel ditampilkan kalau min-content-nya benar-benar muat di wadah.
   * Default `false` (kartu) dipilih supaya render pertama di layar sempit
   * tidak sempat menampilkan tabel yang meluber; `useLayoutEffect` di bawah
   * membetulkan sebelum browser menggambar.
   */
  useLayoutEffect(() => {
    ukurRef.current = () => {
      const wadah = wadahRef.current
      const tabel = tabelRef.current
      if (!wadah || !tabel) return
      /*
       * Wadah sedang disembunyikan (mis. tab lain yang aktif). `clientWidth` 0
       * bukan berarti tabel tidak muat, jadi pengukuran ini diabaikan.
       */
      const tersedia = wadah.clientWidth
      if (tersedia <= 0) return
      setMuatTabel(ukurMinContentTabel(tabel) <= tersedia + TOLERANSI_PX)
    }
    ukurRef.current()
    const wadah = wadahRef.current
    if (!wadah) return
    const ro = new ResizeObserver(() => ukurRef.current())
    ro.observe(wadah)
    // Web font baru bisa mengubah min-content setelah tabel dirender.
    void document.fonts?.ready.then(() => ukurRef.current())
    return () => ro.disconnect()
  }, [])

  // Data atau susunan kolom berubah → angka min-content lamanya sudah basi.
  useLayoutEffect(() => {
    ukurRef.current()
  }, [rows, columns])

  /*
   * Judul kartu: kolom yang ditandai `mobileTitle`, atau kolom pertama yang
   * punya header. Fallback "semua kolom punya label" dipakai supaya tabel
   * yang kolom pertamanya tidak bergelar (mis. kolom aksi di depan) tidak
   * kehilangan kolomnya di kartu.
   */
  const judulKey =
    columns.find((column) => column.mobileTitle && column.header)?.key ??
    columns.find((column) => column.header)?.key ??
    columns[0]?.key
  const judul = columns.find((column) => column.key === judulKey)
  const sisa = columns.filter((column) => column.key !== judulKey)
  /** Kolom tanpa header = kolom aksi; di kartu tidak perlu label. */
  const aksi = sisa.filter((column) => !column.header)
  const berlabel = sisa.filter((column) => column.header)

  if (loading) {
    return <SkeletonTable columns={Math.min(columns.length, 6)} rows={skeletonRows} bordered={bordered} />
  }
  if (rows.length === 0) return <EmptyState message={emptyMessage} />

  return (
    <div ref={wadahRef}>
      {/* ── Wadah sempit: kartu (disembunyikan bila alwaysTable aktif) ── */}
      {!alwaysTable && (
        <ul
          className={cn(muatTabel && "hidden ", "space-y-3 print:hidden")}
          aria-hidden={muatTabel}
        >
          {rows.map((row, index) => (
            <li
              key={keyOf(row, index)}
              className="rounded-xl border border-slate-200 dark:border-slate-700/70 bg-white dark:bg-slate-900/40 p-4 space-y-2 shadow-[0_1px_3px_rgba(0,0,0,0.05)] dark:shadow-none"
            >
              {judul ? (
                <div className="min-w-0 border-b border-slate-200 dark:border-slate-700 pb-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {judul.render(row, index)}
                </div>
              ) : null}
              <dl className="divide-y divide-slate-200/80 dark:divide-slate-800">
                {berlabel.map((column) => (
                  <div
                    key={column.key}
                    className="grid min-w-0 grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] items-start gap-3 py-2 first:pt-0 last:pb-0"
                  >
                    <dt className="min-w-0 break-words pt-0.5 text-[10px] font-bold uppercase leading-relaxed tracking-wider text-slate-900 dark:text-slate-100">
                      {column.header}
                    </dt>
                    <dd className="min-w-0 text-right text-sm text-slate-900 dark:text-slate-100">
                      {column.render(row, index)}
                    </dd>
                  </div>
                ))}
              </dl>
              {aksi.length > 0 ? (
                <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                  {aksi.map((column) => (
                    <span key={column.key} className="inline-flex">
                      {column.render(row, index)}
                    </span>
                  ))}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {/* ── Wadah cukup lebar atau mode paksa tabel: tabel ────────────────── */}
      {/*
       * `print:!block` ikut meng-override visibility berbasis JS: media query
       * cetak mengevaluasi lebar kertas, sedangkan keputusan di atas
       * mengevaluasi lebar wadah layar.
       */}
      <div
        className={cn(
          alwaysTable || muatTabel ? "" : "hidden ",
          "overflow-x-auto -mx-5 px-5 sm:-mx-6 sm:px-6 print:!block print:mx-0 print:px-0 custom-scrollbar",
        )}
        aria-hidden={!alwaysTable && !muatTabel}
      >
        {/*
         * `min-w` bukan penentu lebar sebenarnya — hanya lantai. Yang
         * menentukan adalah jumlah `min-content` kolom, dan itu berbeda tiap
         * tabel. Jadi lantai ini sengaja longgar.
         */}
        <table
          ref={tabelRef}
          className={cn(
            "w-full min-w-[560px] border-collapse",
            bordered && "border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-xs",
          )}
        >
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-100/75 dark:bg-slate-800/40">
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cn(
                    "px-3 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-950 dark:text-slate-100",
                    bordered && "border-r border-slate-200 dark:border-slate-700 last:border-r-0",
                    column.className,
                  )}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={keyOf(row, index)}
                className="border-b border-slate-200/80 dark:border-slate-800/70 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(
                      "px-3 py-3 text-sm text-slate-900 dark:text-slate-100 align-top",
                      bordered && "border-r border-slate-200/80 dark:border-slate-800/80 last:border-r-0",
                      column.className,
                    )}
                  >
                    {column.render(row, index)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════
 *  Pagination
 * ══════════════════════════════════════════════════════════════════ */

export function Pagination({
  page,
  totalPages,
  onChange,
  className = "",
}: {
  page: number
  totalPages: number
  onChange: (page: number) => void
  className?: string
}) {
  if (totalPages <= 1) return null

  // Jendela halaman: selalu tampilkan awal & akhir, sisanya bergeser.
  const halaman: (number | "…")[] = []
  const dorong = (n: number) => {
    if (halaman[halaman.length - 1] !== n) halaman.push(n)
  }
  dorong(1)
  for (let n = page - 1; n <= page + 1; n++) {
    if (n > 1 && n < totalPages) dorong(n)
  }
  dorong(totalPages)

  return (
    <nav
      className={cn("flex flex-wrap items-center justify-between gap-3", className)}
      aria-label="Navigasi halaman"
    >
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Halaman <span className="font-semibold text-slate-700 dark:text-slate-200">{page}</span> dari{" "}
        <span className="font-semibold text-slate-700 dark:text-slate-200">{totalPages}</span>
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          aria-label="Halaman sebelumnya"
          className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800/40 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60 shadow-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Sebelumnya
        </button>
        {halaman.map((item, i) =>
          item === "…" ? (
            <span key={`gap-${i}`} className="px-1.5 text-xs text-slate-400">
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              onClick={() => onChange(item)}
              aria-current={item === page ? "page" : undefined}
              className={cn(
                "min-w-[34px] rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors shadow-xs",
                item === page
                  ? "bg-blue-600 text-white shadow-blue-500/20"
                  : "border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800/40 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60",
              )}
            >
              {item}
            </button>
          ),
        )}
        <button
          type="button"
          onClick={() => onChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          aria-label="Halaman berikutnya"
          className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800/40 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60 shadow-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Berikutnya
        </button>
      </div>
    </nav>
  )
}

/* ══════════════════════════════════════════════════════════════════
 *  Spinner
 * ══════════════════════════════════════════════════════════════════ */

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Memuat"
      className={cn(
        "inline-block w-5 h-5 border-2 border-slate-300 dark:border-slate-600 border-t-blue-500 rounded-full animate-spin",
        className,
      )}
    />
  )
}

/** Layar penuh saat status autentikasi belum diketahui. */
export function FullLoader({ label = "Memuat…" }: { label?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-slate-50 dark:bg-[#0B1120]">
      <div className="w-10 h-10 rounded-full border-4 border-slate-200 dark:border-slate-800 border-t-blue-500 animate-spin" />
      <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
    </div>
  )
}

/** Stub agar `SelectHTMLAttributes` tetap terpakai bila Component menambah select native. */
export type { SelectHTMLAttributes }