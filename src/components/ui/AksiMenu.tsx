import { useState } from "react"
import { createPortal } from "react-dom"
import { MoreVertical } from "lucide-react"
import { cn } from "@/lib/cn"
import {
  KELAS_PANEL_MENU,
  kelasItemMenu,
  perkiraanTinggiMenu,
  useMenuLayang,
  type ItemMenu,
} from "./menuLayang"

/**
 * Menu aksi "⋯" di baris tabel.
 *
 * Menu ini berada di dalam `overflow-x-auto`, jadi ia **wajib** dirender lewat
 * portal — lihat penjelasan panjang di `menuLayang.ts`.
 */
export function AksiMenu({
  items,
  label = "Aksi baris",
  className = "",
  disabled = false,
}: {
  items: ItemMenu[]
  label?: string
  className?: string
  disabled?: boolean
}) {
  const [terbuka, setTerbuka] = useState(false)
  const tinggi = perkiraanTinggiMenu(items)
  const pakaiHint = items.some((item) => item.hint)

  const { pemicuRef, panelRef, posisi } = useMenuLayang({
    terbuka,
    tutup: () => setTerbuka(false),
    tinggi,
    lebar: pakaiHint ? 280 : 200,
    sisi: "kanan",
  })

  if (items.length === 0) return null

  return (
    <>
      <button
        ref={pemicuRef}
        type="button"
        onClick={() => setTerbuka((prev) => !prev)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={terbuka}
        aria-label={label}
        title={label}
        className={cn(
          "relative z-[92] inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors",
          "border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 bg-white dark:bg-transparent shadow-xs",
          "hover:bg-slate-100 dark:hover:bg-slate-700/60 hover:text-slate-800 dark:hover:text-slate-200",
          "disabled:opacity-40 disabled:cursor-not-allowed",
          className,
        )}
      >
        <MoreVertical className="w-4 h-4" />
      </button>

      {terbuka && posisi && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={panelRef}
              role="menu"
              className={KELAS_PANEL_MENU}
              style={{
                top: posisi.top,
                left: posisi.left,
                maxHeight: posisi.maxHeight,
                width: posisi.width,
              }}
            >
              {items.map((item) => (
                <BarisMenu key={item.id} item={item} tutup={() => setTerbuka(false)} />
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}

/**
 * Tombol yang membuka menu melayang — untuk pilihan yang terlalu banyak untuk
 * tombol biasa (mis. format unduhan).
 */
export function TombolMenu({
  items,
  children,
  className = "",
  variant = "secondary",
  size = "md",
  disabled = false,
  align = "kanan",
  label = "Buka menu",
}: {
  items: ItemMenu[]
  children: React.ReactNode
  className?: string
  variant?: "primary" | "secondary" | "ghost"
  size?: "sm" | "md"
  disabled?: boolean
  align?: "kiri" | "kanan"
  label?: string
}) {
  const [terbuka, setTerbuka] = useState(false)
  const tinggi = perkiraanTinggiMenu(items)
  const pakaiHint = items.some((item) => item.hint)

  const { pemicuRef, panelRef, posisi } = useMenuLayang({
    terbuka,
    tutup: () => setTerbuka(false),
    tinggi,
    lebar: pakaiHint ? 280 : 220,
    sisi: align,
  })

  const warna = {
    primary: "bg-blue-600 text-white hover:bg-blue-700",
    secondary:
      "bg-slate-100 dark:bg-slate-700/70 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 hover:bg-slate-200 dark:hover:bg-slate-700",
    ghost:
      "bg-transparent text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800",
  }[variant]

  const ukuran = size === "sm" ? "px-3 py-1.5 text-xs gap-1.5 rounded-lg" : "px-4 py-2.5 text-sm gap-2 rounded-xl"

  return (
    <>
      <button
        ref={pemicuRef}
        type="button"
        onClick={() => setTerbuka((prev) => !prev)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={terbuka}
        aria-label={label}
        className={cn(
          "relative z-[92] inline-flex items-center justify-center font-semibold transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap shrink-0",
          warna,
          ukuran,
          className,
        )}
      >
        {children}
        <ChevronIkon terbuka={terbuka} />
      </button>

      {terbuka && posisi && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={panelRef}
              role="menu"
              className={KELAS_PANEL_MENU}
              style={{
                top: posisi.top,
                left: posisi.left,
                maxHeight: posisi.maxHeight,
                width: posisi.width,
              }}
            >
              {items.map((item) => (
                <BarisMenu key={item.id} item={item} tutup={() => setTerbuka(false)} />
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}

function ChevronIkon({ terbuka }: { terbuka: boolean }) {
  return (
    <svg
      className={cn(
        "w-3.5 h-3.5 shrink-0 transition-transform duration-200",
        terbuka && "rotate-180",
      )}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

/** Satu baris menu — dipakai kedua komponen agar identik. */
function BarisMenu({ item, tutup }: { item: ItemMenu; tutup: () => void }) {
  const Ikon = item.icon

  return (
    <button
      type="button"
      role="menuitem"
      disabled={item.disabled}
      onClick={() => {
        if (item.disabled) return
        tutup()
        item.onClick()
      }}
      className={cn(
        "w-full flex items-start gap-2.5 px-3 py-2 text-left text-xs font-semibold transition-colors",
        item.pemisah && "mt-1 border-t border-slate-100 dark:border-slate-700/70 pt-2.5",
        kelasItemMenu(item),
      )}
    >
      {Ikon ? <Ikon className="w-4 h-4 mt-px shrink-0" /> : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate">{item.label}</span>
        {item.hint ? (
          <span className="block text-[11px] font-normal text-slate-400 dark:text-slate-500 mt-0.5 break-words leading-snug">
            {item.hint}
          </span>
        ) : null}
      </span>
    </button>
  )
}