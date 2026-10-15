import { useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { ChevronDown, ShieldCheck, UserCircle, Users } from "lucide-react"
import { initials } from "@/lib/cn"
import {
  KELAS_PANEL_MENU,
  perkiraanTinggiMenu,
  useMenuLayang,
  type NadaMenu,
} from "./menuLayang"

/**
 * Dropdown akun di topbar.
 *
 * Tombol compact menampilkan avatar inisial bulat; identitas lengkap tetap
 * tersedia di panel dropdown.
 *
 * Bentuknya "chip": lingkaran avatar setinggi kartu dan menempel di tepi kiri
 * (`pl-0`), sedangkan nama serta chevron diberi jarak di sebelah kanannya.
 */

export interface AkunDropdownItem {
  id: string
  label: string
  hint?: string
  icon: ReactNode
  onClick: () => void
  /** `danger` untuk keluar dari aplikasi. */
  tone?: NadaMenu
}

export interface AkunDropdownProps {
  /** Nama yang tampil. */
  displayName: string
  /** Email — ditampilkan di kepala menu. */
  email?: string
  /** Jabatan/NIP — baris ketiga kepala menu. */
  jabatan?: string
  role: "admin" | "user"
  items: AkunDropdownItem[]
  /** Bila `true`, tombol hanya menampilkan avatar inisial bulat. */
  compact?: boolean
}

/** Lebar menu. `min()` supaya tidak pernah melebihi layar sempit. */
const LEBAR_MENU = 264

export function AkunDropdown({
  displayName,
  email,
  jabatan,
  role,
  items,
  compact = false,
}: AkunDropdownProps) {
  const [terbuka, setTerbuka] = useState(false)
  const tinggi = perkiraanTinggiMenu(items) + 76 // + kepala menu

  const { pemicuRef, panelRef, posisi } = useMenuLayang({
    terbuka,
    tutup: () => setTerbuka(false),
    tinggi,
    lebar: LEBAR_MENU,
    sisi: "kanan",
  })

  const inisial = initials(displayName)
  const isAdmin = role === "admin"

  /**
   * Avatar lingkaran.
   *
   * Ukuran `sm` **sengaja setinggi isi chip** — 36px dikurangi 1px garis di
   * atas dan bawah, jadi 34px — dan tombolnya `p-0`. Hasilnya lingkaran
   * menempel rapat ke tepi kiri kartu, tanpa celah putih di pojoknya. Kalau
   * avatar ikut 36px, ia menutupi garis atas-bawah chip dan bentuknya terlihat
   * meluber, bukan menempel.
   *
   * Garis avatar pakai `ring-inset`, bukan `border`, supaya tidak jadi garis
   * kedua yang bertumpuk dengan border chip.
   */
  const avatar = (size: "sm" | "md") =>
    inisial ? (
      <div
        className={[
          size === "sm" ? "h-[34px] w-[34px] text-[11px]" : "h-11 w-11 text-sm",
          "rounded-full flex items-center justify-center shrink-0 font-bold ring-1 ring-inset",
          isAdmin
            ? "bg-gradient-to-br from-violet-500 to-violet-600 text-white ring-violet-500/30 dark:from-violet-400 dark:to-violet-600 dark:ring-white/15"
            : "bg-slate-200 text-slate-700 ring-slate-300/70 dark:bg-slate-700 dark:text-slate-100 dark:ring-white/10",
        ].join(" ")}
        aria-hidden="true"
      >
        {inisial}
      </div>
    ) : (
      <div
        className={[
          size === "sm" ? "h-[34px] w-[34px]" : "h-11 w-11",
          "rounded-full flex items-center justify-center shrink-0",
          "bg-slate-200 text-slate-500 ring-1 ring-inset ring-slate-300/70 dark:bg-slate-700 dark:text-slate-300 dark:ring-white/10",
        ].join(" ")}
      >
        <UserCircle className="w-4 h-4" />
      </div>
    )

  return (
    <>
      <button
        ref={pemicuRef}
        type="button"
        onClick={() => setTerbuka((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={terbuka}
        aria-label={`Menu akun — ${displayName}`}
        title={displayName}
        className={[
          "relative z-[92] flex shrink-0 items-center border transition-all duration-200 cursor-pointer",
          compact
            ? "h-9 w-9 justify-center rounded-full p-0 sm:w-auto sm:max-w-[190px] sm:justify-start sm:gap-2.5 sm:pr-3.5"
            : "h-9 w-auto max-w-[220px] justify-start rounded-full p-0 pr-3 gap-2",
          terbuka
            ? "border-blue-400 dark:border-blue-500/60 ring-2 ring-blue-500/20"
            : "border-slate-300 dark:border-slate-700/80 hover:border-slate-400 dark:hover:border-slate-600 hover:shadow-sm",
          "bg-white dark:bg-slate-800/50 shadow-xs",
        ].join(" ")}
      >
        {avatar("sm")}
        <span
          className={[
            "hidden min-w-0 truncate text-[13px] font-semibold leading-none text-slate-700 dark:text-slate-200 sm:inline",
            compact ? "max-w-[112px]" : "max-w-[130px]",
          ].join(" ")}
        >
          {compact ? displayName.trim().split(/\s+/)[0] || "Pengguna" : displayName}
        </span>
        <ChevronDown
          className={[
            "hidden h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform duration-200 sm:block",
            terbuka && "rotate-180",
          ].join(" ")}
          aria-hidden="true"
        />
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
              {/* Kepala: identitas + peran */}
              <div className="flex items-center gap-3 px-4 py-3.5 bg-slate-50 dark:bg-slate-900/40 border-b border-slate-200 dark:border-slate-700/60">
                {avatar("md")}
                <div className="min-w-0 flex-1">
                  {/* `break-words`, bukan `truncate` — nama instansi/pegawai
                      sering panjang dan tidak boleh terpotong di tengah. */}
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-100 break-words leading-snug">
                    {displayName}
                  </p>
                  {email || jabatan ? (
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 break-words leading-snug mt-0.5">
                      {email}
                      {email && jabatan ? " · " : ""}
                      {jabatan}
                    </p>
                  ) : null}
                  <span
                    className={[
                      "inline-flex items-center gap-1 mt-1.5 px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider",
                      isAdmin
                        ? "bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300"
                        : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300",
                    ].join(" ")}
                  >
                    {isAdmin ? (
                      <ShieldCheck className="w-2.5 h-2.5" />
                    ) : (
                      <Users className="w-2.5 h-2.5" />
                    )}
                    {isAdmin ? "Administrator" : "Petugas"}
                  </span>
                </div>
              </div>

              {/* Aksi */}
              <div className="p-1.5 space-y-0.5">
                {items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setTerbuka(false)
                      item.onClick()
                    }}
                    className={[
                      "w-full flex items-start gap-2.5 px-2.5 py-2 rounded-xl text-left text-xs font-semibold transition-colors",
                      item.tone === "danger"
                        ? "text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                        : "text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50",
                    ].join(" ")}
                  >
                    <span className="mt-0.5 shrink-0">{item.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block">{item.label}</span>
                      {/* Hint panjang tidak boleh terpotong di tengah kata. */}
                      {item.hint ? (
                        <span className="block text-[11px] font-normal text-slate-400 dark:text-slate-500 mt-0.5 break-words leading-snug">
                          {item.hint}
                        </span>
                      ) : null}
                    </span>
                  </button>
                ))}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}

/* Impor ulang agar tipe `NadaMenu` terpakai di tanda tangan publik. */
export type { NadaMenu }