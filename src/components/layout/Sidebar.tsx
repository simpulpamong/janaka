import { NavLink, useLocation } from "react-router-dom"
import { AnimatePresence, motion } from "motion/react"
import {
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  History,
  LayoutDashboard,
  ListFilter,
  LogOut,
  MapPinned,
  Settings,
  ShieldCheck,
  X,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { useAuth } from "@/context/AuthContext"
import type { AppPermissions, UserRole } from "@/lib/access"
import { cn } from "@/lib/cn"
import { JanakaLogo } from "./JanakaLogo"

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
  /** Izin yang harus dimiliki agar menu tampil. */
  permission: keyof AppPermissions
  /** Peran khusus. */
  role?: UserRole
  group: NavGroup
  description: string
}

export type NavGroup = "utama" | "referensi" | "admin"

export const NAV_ITEMS: NavItem[] = [
  {
    to: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    end: true,
    permission: "menuDashboard",
    group: "utama",
    description: "Ringkasan statistik & target prioritas",
  },
  {
    to: "/mapping",
    label: "Pemetaan Reklame",
    icon: MapPinned,
    permission: "menuMapping",
    group: "utama",
    description: "Peta terpadu PTSP + JANAKA",
  },
  {
    to: "/data-reklame",
    label: "Data Reklame",
    icon: ListFilter,
    permission: "menuReklame",
    group: "utama",
    description: "Daftar & filter izin reklame",
  },
  {
    to: "/laporan",
    label: "Laporan Lapangan",
    icon: ClipboardCheck,
    permission: "menuLaporan",
    group: "utama",
    description: "Input tindakan & dokumentasi",
  },
  {
    to: "/rekap",
    label: "Rekap Penindakan",
    icon: History,
    permission: "menuRiwayat",
    group: "utama",
    description: "Arsip, rekap & cetak berita acara",
  },
  {
    to: "/pengaturan",
    label: "Pengaturan",
    icon: Settings,
    permission: "aksiUbahPassword",
    group: "referensi",
    description: "Profil, keamanan & sistem",
  },
]

/** Urutan grup di sidebar — `referensi` paling akhir, di bawah `admin`. */
export const GROUP_ORDER: NavGroup[] = ["utama", "admin", "referensi"]

export const GROUP_LABELS: Record<NavGroup, string> = {
  utama: "Menu Utama",
  admin: "Administrasi",
  referensi: "Referensi",
}

/** Filter menu berdasarkan izin + peran pengguna aktif. */
export function useVisibleNavItems(): NavItem[] {
  const { can, role } = useAuth()
  return NAV_ITEMS.filter((item) => {
    if (item.role && item.role !== role) return false
    return can(item.permission)
  })
}

/**
 * Item navigasi yang cocok dengan pathname — **paling spesifik**.
 *
 * Urutan adalah COOKIE. `NAV_ITEMS` punya `/pengaturan` sebelum
 * `/pengaturan/pengguna`, jadi `find` biasa mengembalikan "Pengaturan" untuk
 * `/pengaturan/pengguna`. Memilih yang `to`-nya terpanjang memperbaiki itu:
 * anak selalu menang atas induknya.
 */
export function useActiveNav(): NavItem | undefined {
  const { pathname } = useLocation()
  const items = useVisibleNavItems()
  return items
    .filter((item) => (item.end ? pathname === item.to : pathname.startsWith(item.to)))
    .sort((a, b) => b.to.length - a.to.length)[0]
}

export interface SidebarProps {
  expanded: boolean
  onToggle: () => void
  mobileOpen: boolean
  onMobileClose: () => void
  onLogout: () => void
}

export function Sidebar({
  expanded,
  onToggle,
  mobileOpen,
  onMobileClose,
  onLogout,
}: SidebarProps) {
  const items = useVisibleNavItems()
  const { pathname } = useLocation()

  /*
   * Label tampil bila sidebar terlebar **atau** drawer mobile sedang terbuka.
   * Drawer mobile selalu lebar penuh — tidak mungkin menjadi 84px di layar
   * sempit.
   */
  const isExpanded = expanded || mobileOpen

  const renderItem = (item: NavItem) => {
    const Icon = item.icon
    const aktif = item.end ? pathname === item.to : pathname.startsWith(item.to)

    return (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.end}
        onClick={onMobileClose}
        title={!isExpanded ? item.label : item.description}
        aria-current={aktif ? "page" : undefined}
        className={cn(
          "group w-full h-11 relative flex items-center rounded-xl text-left font-medium transition-all duration-200 px-3.5",
          aktif
            ? "bg-blue-600/10 text-blue-400"
            : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200",
        )}
      >
        {/*
         * Rel aktif dengan `layoutId` — ia meluncur di antara item, bukan
         * muncul/hilang di tempat baru. `absolute` supaya tidak ikut mengalir
         * bersama teks label.
         */}
        {aktif ? (
          <motion.span
            layoutId="janaka-nav-rel"
            className="absolute left-0 top-2 bottom-2 w-1 bg-blue-500 rounded-r-full"
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
            aria-hidden="true"
          />
        ) : null}

        <Icon
          className={cn(
            "w-5 h-5 shrink-0 transition-colors",
            aktif ? "text-blue-400" : "text-slate-500 group-hover:text-slate-300",
          )}
        />
        <span
          className={cn(
            "truncate text-sm transition-[max-width,opacity,margin] duration-300",
            isExpanded ? "ml-3.5 max-w-[180px] opacity-100" : "ml-0 max-w-0 opacity-0",
          )}
        >
          {item.label}
        </span>
      </NavLink>
    )
  }

  return (
    <aside
      className={cn(
        "poni-sidebar bg-[#0F172A] dark:bg-[#070B14] border-r border-slate-800/50",
        "flex flex-col h-full fixed inset-y-0 left-0 lg:relative lg:inset-y-auto lg:left-auto lg:flex",
        "transition-all duration-300 ease-in-out z-40 shadow-2xl lg:shadow-none",
        expanded ? "w-64" : "w-[84px]",
        // Lebar kolom_SAFE_: mobile selalu `w-64`, desktop mengikuti state.
        mobileOpen ? "translate-x-0 w-64" : "-translate-x-full lg:translate-x-0",
      )}
    >
      {/* ── Brand ── */}
      <div className="h-[56px] flex items-center px-5 border-b border-slate-800/60 justify-between shrink-0">
        <div className="group flex items-center gap-3 overflow-hidden">
          <div className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-2xl bg-slate-700 p-0.5">
            <div className="w-full h-full bg-[#0F172A] dark:bg-[#070B14] rounded-[0.7rem] p-1 flex items-center justify-center overflow-hidden">
              <JanakaLogo className="w-full h-full object-contain" />
            </div>
          </div>
          <span
            className={cn(
              "overflow-hidden whitespace-nowrap font-bold text-lg tracking-tight text-white",
              "transition-[max-width,opacity,margin] duration-300",
              isExpanded ? "ml-0 max-w-[160px] opacity-100" : "ml-0 max-w-0 opacity-0",
            )}
          >
            JANAKA
          </span>
        </div>
        <button
          type="button"
          onClick={onMobileClose}
          className="lg:hidden text-slate-400 hover:text-white flex-shrink-0 transition-colors p-1.5 rounded-lg hover:bg-slate-800"
          aria-label="Tutup menu"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* ── Tombol ciut / melebar (desktop) ──
       * Diposisikan absolut di tepi kanan sidebar, melayang di atas garis
       * batas — cara yang sama seperti prabawa, dan yang membuat lebar konten
       * ikut bergeser tanpa perlu padding manual. */}
      <button
        type="button"
        onClick={onToggle}
        className="hidden lg:flex absolute top-[84px] -right-3.5 w-7 h-7 bg-[#1E293B] dark:bg-[#0F172A] border border-slate-700/80 rounded-full items-center justify-center text-slate-400 hover:text-white shadow-lg transition-transform hover:scale-110 z-50 focus:outline-none"
        aria-label={expanded ? "Ciutkan menu" : "Perluas menu"}
        title={expanded ? "Ciutkan menu" : "Perluas menu"}
      >
        {expanded ? <ChevronLeft className="w-4 h-4 ml-0.5" /> : <ChevronRight className="w-4 h-4 ml-0.5" />}
      </button>

      {/* ── Navigasi ──
       *
       * `overflow-x-hidden` wajib ada di sini.
       *
       * Lebar sidebar dianimasikan (256px ↔ 84px) dan isi navigasi
       * memakai `whitespace-nowrap`. Selama transisi itu isinya sebentar
       * lebih lebar dari wadahnya, dan karena hanya `overflow-y` yang
       * di-set, CSS menghitung `overflow-x: visible` jadi `auto` —
       * hasilnya scrollbar horizontal muncul sekilas setiap kali menu
       * dibuka atau ditutup.
       *
       * Menyatakan `overflow-x: hidden` secara tegas menutup itu, dan
       * memotong ke samping memang tidak masalah: label menu yang sedang
       * menyusut sudah ditangani `opacity` + `overflow-hidden` milik
       * tiap baris.
       */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-5 px-3.5 space-y-5 custom-scrollbar">
        {GROUP_ORDER.map((group) => {
          const dalamGrup = items.filter((item) => item.group === group)
          if (dalamGrup.length === 0) return null
          return (
            <div key={group} className="space-y-1.5">
              <p
                className={cn(
                  "px-3.5 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-600",
                  "transition-opacity duration-300",
                  isExpanded ? "opacity-100" : "opacity-0 h-0 overflow-hidden",
                )}
              >
                {GROUP_LABELS[group]}
              </p>
              {dalamGrup.map(renderItem)}
            </div>
          )
        })}
      </nav>

      {/* ── Footer: keluar ── */}
      <div className="mt-auto p-3.5 border-t border-slate-800/60 bg-gradient-to-b from-transparent to-slate-900/50 shrink-0">
        <button
          type="button"
          onClick={onLogout}
          className="w-full h-11 flex items-center rounded-xl text-left font-medium transition-all duration-200 group text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 px-3.5"
          title={!isExpanded ? "Keluar Aplikasi" : "Keluar dari JANAKA"}
        >
          <LogOut className="w-5 h-5 shrink-0" />
          <span
            className={cn(
              "truncate text-sm transition-[max-width,opacity,margin] duration-300",
              isExpanded ? "ml-3.5 max-w-[120px] opacity-100" : "ml-0 max-w-0 opacity-0",
            )}
          >
            Keluar
          </span>
        </button>
      </div>
    </aside>
  )
}

/* Ikon dipakai ulang di beberapa tempat (empty state, halaman 403). */
export { ShieldCheck, AnimatePresence }