import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  LogOut,
  Menu,
  Moon,
  RefreshCw,
  Sun,
  UserCog,
  UserRound,
  Wifi,
  WifiOff,
} from "lucide-react"
import { useAuth } from "@/context/AuthContext"
import { useReklamaStore } from "@/hooks/useReklamaStore"
import { cn } from "@/lib/cn"
import { AkunDropdown } from "@/components/ui/AkunDropdown"
import { useActiveNav } from "./Sidebar"

export interface TopbarProps {
  onMenuClick: () => void
  onRefresh?: () => void
  refreshing?: boolean
  actions?: React.ReactNode
}

/** Jam WIB — memberi tanda "hidup" pada topbar tanpa menambah bobot. */
export function JamWib() {
  const [waktu, setWaktu] = useState(() => new Date())

  useEffect(() => {
    const timer = setInterval(() => setWaktu(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div
      className="hidden sm:flex items-center gap-2.5 h-9 bg-white dark:bg-slate-800/80 backdrop-blur-md px-3.5 rounded-full border border-slate-300/80 dark:border-slate-700/50 shadow-xs"
      title="Waktu Indonesia Barat"
    >
      <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" aria-hidden="true" />
      <span className="text-xs font-mono font-medium tracking-tight text-slate-700 dark:text-slate-200">
        {waktu.toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta", hour12: false })}
      </span>
      <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">WIB</span>
    </div>
  )
}

function useTheme() {
  const [dark, setDark] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem("janaka-theme")
    setDark(stored ? stored === "dark" : true)
  }, [])

  const toggle = () => {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle("dark", next)
    localStorage.setItem("janaka-theme", next ? "dark" : "light")
  }

  return { dark, toggle }
}

export function Topbar({ onMenuClick, onRefresh, refreshing = false, actions }: TopbarProps) {
  const navigate = useNavigate()
  const { profile, role, logout, can } = useAuth()
  const { reklameList, loading, stale, error, lastLoadedAt, loadReklamaList } = useReklamaStore()
  const { dark, toggle } = useTheme()
  const activeNav = useActiveNav()

  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  )

  // Muat data PTSP sekali saat belum pernah berhasil, lalu segarkan cache
  // yang kedaluwarsa. Error menahan auto-retry agar outage tidak membuat
  // loop request tanpa henti; pengguna masih bisa mencoba lewat tombol refresh.
  useEffect(() => {
    const belumPernahDimuat = reklameList.length === 0 && lastLoadedAt === null
    const cacheKedaluwarsa =
      reklameList.length > 0 && lastLoadedAt !== null && Date.now() - lastLoadedAt > 60_000

    if (!loading && !error && (belumPernahDimuat || cacheKedaluwarsa)) {
      void loadReklamaList()
    }
  }, [reklameList.length, loading, error, lastLoadedAt, loadReklamaList])

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener("online", on)
    window.addEventListener("offline", off)
    return () => {
      window.removeEventListener("online", on)
      window.removeEventListener("offline", off)
    }
  }, [])

  /*
   * Label indikator. Sengaja hanya menyebut **sambungan**, bukan jumlah titik.
   *
   * Sebelumnya isinya "380 titik" — angka itu tidak ada gunanya di topbar:
   * jumlah titik sudah terlihat di statistik tiap halaman, dan angka di
   * header yang berubah-ubah malah mengganggu (tiap kali cache diperbarui,
   * topbar ikut "berkedip" nilainya). Yang benar-benar perlu diketahui
   * petugas cuma satu: sistem lagi terhubung atau tidak.
   */
  const labelStatus = loading
    ? "Memuat"
    : !online
      ? "Offline"
      : error
        ? "PTSP Offline"
        : stale
        ? "Cache"
        : "Online"
  const toneStatus = loading
    ? "border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300"
    : !online || error
      ? "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-500/10 dark:text-rose-400"
      : stale
        ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-500/10 dark:text-amber-400"
        : "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-500/10 dark:text-emerald-400"

  /*
   * Gaya tombol ikon (refresh & tema).
   *
   * Semula tanpa garis sama sekali — hanya ikon yang bergantung pada warna
   * teks, sehingga di header yang sudah ramai (jam, status, akun) keduanya
   * terlihat "mengapung" dan mudah terklik salah. Sekarang keduanya
   * ber-border slate, setinggi 36px, dan jaraknya 8px: satu baris kontrol
   * yang rata, dengan target sentuh yang layak.
   */
  const gayaTombolIkon = [
    "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border shadow-xs",
    "border-slate-300 bg-white text-slate-600",
    "transition-all duration-200 hover:border-slate-400 hover:bg-slate-50 hover:text-slate-800",
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 active:scale-95",
    "dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300 dark:shadow-none",
    "dark:hover:border-slate-600 dark:hover:bg-slate-700/60 dark:hover:text-slate-100",
  ].join(" ")

  return (
    <header className="poni-header h-[56px] bg-white/95 dark:bg-[#0B1120]/85 backdrop-blur-xl border-b border-slate-200/90 dark:border-slate-800/80 flex items-center justify-between gap-3 transition-colors duration-300 shrink-0 z-30 shadow-[0_1px_3px_0_rgba(15,23,42,0.06)] dark:shadow-slate-900/50 janaka-no-print">
      {/*
       * `min-w-0 flex-1` di kiri, `shrink-0` di kanan.
       *
       * Tanpa itu, blok kiri memakai lebar naturalnya: judul halaman + NIP.
       * Di HP 390px, begitu panel developer ikut membuka ruangnya, penjumlahannya
       * melebihi lebar header — judul meluber sampai ke tombol akun, dan tombol
       * akun terdorong keluar header.
       */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <button
          type="button"
          onClick={onMenuClick}
          className="lg:hidden -ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 active:scale-95 dark:text-slate-300 dark:hover:bg-slate-800"
          aria-label="Buka menu"
        >
          <Menu className="h-4 w-4" />
        </button>
        <div className="flex flex-col min-w-0">
          <h2 className="truncate text-sm font-bold tracking-tight text-slate-800 dark:text-slate-100 sm:text-lg">
            {activeNav?.label ?? "JANAKA"}
          </h2>
          <p className="hidden truncate text-[11px] text-slate-500 dark:text-slate-400 sm:block">
            {profile?.jabatan
              ? `${profile.jabatan}${profile.nip ? ` · NIP ${profile.nip}` : ""}`
              : "Jaringan Navigasi Penegakan Perda"}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        <JamWib />

        {/*
          * Indikator koneksi & data.
          *
          * Selalu tampil di semua lebar layar. Dulu disembunyikan di bawah
          * `md`, tapi justru di HP-lah petugas paling perlu tahu sedang
          * offline: tanpa halaman `/offline.html`, indikator inilah satu-satunya
          * penanda luring. Di layar sempit teksnya dipangkas jadi satu kata
          * supaya tidak makan tempat header yang juga memuat jam dan tombol.
          *
          * Catatan: komentar di dalam JSX wajib dibungkus kurung kurawal.
          * Ditulis telanjang, ia bukan komentar melainkan teks biasa, dan
          * seluruh paragraf ini ikut tampil di header.
          */}
        <span
          title={
            !online
              ? "Tidak ada koneksi internet. Data yang tampil memakai cache perangkat."
              : error
                ? error
              : lastLoadedAt
                ? `Terakhir diperbarui ${new Date(lastLoadedAt).toLocaleString("id-ID")}`
                : "Data belum dimuat"
          }
          role="status"
          aria-live="polite"
          className={cn(
            "inline-flex h-8 w-6 shrink-0 items-center justify-center sm:h-9 sm:w-auto sm:gap-1.5 sm:rounded-full sm:border sm:px-3",
            "sm:text-[10px] sm:font-bold sm:uppercase sm:tracking-wider",
            toneStatus,
          )}
        >
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full sm:hidden",
              loading
                ? "animate-pulse bg-slate-400"
                : !online
                  ? "bg-rose-500"
                  : stale || error
                    ? "bg-amber-500"
                    : "bg-emerald-500",
            )}
            aria-hidden="true"
          />
          <span className="hidden sm:inline">
            {loading ? (
              <RefreshCw className="h-3 w-3 animate-spin" />
            ) : online && !stale && !error ? (
              <Wifi className="h-3 w-3" />
            ) : (
              <WifiOff className="h-3 w-3" />
            )}
          </span>
          <span className="hidden sm:inline">{labelStatus}</span>
          <span className="sr-only sm:hidden">{labelStatus}</span>
        </span>

        {onRefresh ? (
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className={cn(gayaTombolIkon, refreshing && "opacity-60")}
            aria-label="Muat ulang data dari PTSP"
            title="Muat ulang data dari PTSP"
          >
            <RefreshCw className={cn("h-[18px] w-[18px]", refreshing && "animate-spin")} />
          </button>
        ) : null}

        {actions}

        {/* Darkmode — sebelum tombol akun */}
        <button
          type="button"
          onClick={toggle}
          className={gayaTombolIkon}
          aria-label={dark ? "Mode terang" : "Mode gelap"}
          title={dark ? "Mode terang" : "Mode gelap"}
        >
          {dark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
        </button>

        {/* Menu akun — chip avatar inisial, melingkar di tepi kiri kartu */}
        <AkunDropdown
          compact
          displayName={profile?.namaLengkap || profile?.username || "Pengguna"}
          email={profile?.email}
          jabatan={profile?.jabatan}
          role={role}
          items={[
            {
              id: "profil",
              label: "Profil Saya",
              hint: "Nama, jabatan, NIP, dan ubah password",
              icon: <UserRound className="w-4 h-4 text-slate-500" />,
              onClick: () => navigate("/pengaturan?tab=profil"),
            },
            ...(can("aksiKelolaPengguna")
              ? [
                  {
                    id: "pengguna",
                    label: "Manajemen Pengguna",
                    hint: "Kelola akun & hak akses tiap petugas",
                    icon: <UserCog className="w-4 h-4 text-violet-500" />,
                    onClick: () => navigate("/pengaturan?tab=pengguna"),
                  },
                ]
              : []),
            {
              id: "logout",
              label: "Keluar",
              hint: "Putuskan sesi dan kembali ke login",
              icon: <LogOut className="w-4 h-4 text-rose-500" />,
              tone: "danger" as const,
              onClick: () => void logout().then(() => navigate("/login", { replace: true })),
            },
          ]}
        />
      </div>
    </header>
  )
}