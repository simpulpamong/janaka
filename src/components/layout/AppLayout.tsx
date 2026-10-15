import { useCallback, useEffect, useState, type ReactNode } from "react"
import { useNavigate } from "react-router-dom"
import { AnimatePresence, motion } from "motion/react"
import { Sidebar } from "./Sidebar"
import { Topbar } from "./Topbar"
import { ConfirmDialog } from "@/components/ui/Modal"
import { PetaLihatOtomatis } from "@/components/common/PetaLihat"
import { useAuth } from "@/context/AuthContext"
import { bacaSidebarCiut, simpanSidebarCiut } from "@/lib/sidebar"

/**
 * Shell aplikasi JANAKA.
 *
 * Menggrokkan `App.tsx` prabawa persis:
 *  • Akar `h-[100svh] … overflow-hidden` — dokumen dikunci, kolom konten jadi
 *    satu-satunya area scroll (`html.janaka-shell` di `index.css`).
 *  • Sidebar sebagai **saudara** kolom konten, bukan overlay dengan padding
 *    manual. Lebarnya dianimasikan; kolom konten langsung ikut resized karena
 *    `flex-1 min-w-0` — tidak ada padding yang harus disinkronkan.
 *  • Overlay mobile tanpa `blur`: `filter: blur()` pada subtree besar +
 *    transisi 300ms membuat browser menyalin & mengaburkan seluruh halaman di
 *    setiap frame. Overlay gelap + `pointer-events-none` memberi efek yang sama
 *    tanpa biaya render.
 *  • Transisi halaman: naik 10px + fade 300ms, di-key pada id halaman.
 */

export interface AppLayoutProps {
  children: ReactNode
  onRefresh?: () => void
  refreshing?: boolean
  /** Tombol aksi tambahan pada Topbar. */
  actions?: ReactNode
}

export function AppLayout({ children, onRefresh, refreshing, actions }: AppLayoutProps) {
  const navigate = useNavigate()
  const { logout } = useAuth()

  /*
  * Preferensi dibaca lewat `src/lib/sidebar.ts` supaya keadaan sidebar
  * konsisten saat halaman berpindah.
   */
  const [expanded, setExpanded] = useState<boolean>(() => !bacaSidebarCiut())
  const [mobileOpen, setMobileOpen] = useState(false)
  const [konfirmasiKeluar, setKonfirmasiKeluar] = useState(false)
  const [sedangKeluar, setSedangKeluar] = useState(false)

  /* Simpan preferensi sidebar — butuh cookie: state yang hilang tiap reload
   * membuat "ciutkan menu" terasa tidak pernah berlaku. */
  useEffect(() => {
    simpanSidebarCiut(!expanded)
  }, [expanded])

  /* Kunci gulir dokumen saat shell aktif: kolom konten jadi satu-satunya area
   * scroll, jadi tidak ada dua scrollbar (dokumen + kolom konten). */
  useEffect(() => {
    document.documentElement.classList.add("janaka-shell")
    return () => document.documentElement.classList.remove("janaka-shell")
  }, [])

  /* Kunci scroll body saat drawer mobile terbuka. */
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : ""
    return () => {
      document.body.style.overflow = ""
    }
  }, [mobileOpen])

  /* Tutup drawer saat layar melebar ke desktop. */
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)")
    const handler = (e: MediaQueryListEvent | MediaQueryList) => {
      if (e.matches) setMobileOpen(false)
    }
    handler(mq)
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [])

  /* Escape menutup drawer mobile. */
  useEffect(() => {
    if (!mobileOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [mobileOpen])

  const handleKeluar = useCallback(async () => {
    setSedangKeluar(true)
    try {
      await logout()
      setKonfirmasiKeluar(false)
      navigate("/login", { replace: true })
    } finally {
      setSedangKeluar(false)
    }
  }, [logout, navigate])

  return (
    <div className="bg-slate-100/75 dark:bg-[#0B1120] text-slate-800 dark:text-slate-200 font-sans h-[100svh] w-full flex transition-colors duration-300 overflow-hidden relative">
      {/* ── Sidebar ── */}
      <Sidebar
        expanded={expanded}
        onToggle={() => setExpanded((v) => !v)}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
        onLogout={() => setKonfirmasiKeluar(true)}
      />

      {/* ── Overlay menu mobile ── */}
      <AnimatePresence>
        {mobileOpen ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/70 z-30 lg:hidden"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
        ) : null}
      </AnimatePresence>

      {/* ── Konten utama ──
       * ⚠️ Tidak ada `blur` di sini. `filter: blur()` pada subtree besar +
       * transisi 300ms sangat berat. Overlay gelap di atas (sudah ada) plus
       * `pointer-events-none` sudah memberi efek "tidak aktif" yang sama
       * tanpa biaya render. */}
      <div
        className={`flex-1 flex flex-col min-w-0 h-full min-h-0 relative overflow-hidden ${
          mobileOpen ? "pointer-events-none lg:pointer-events-auto" : ""
        }`}
      >
        <Topbar
          onMenuClick={() => setMobileOpen(true)}
          onRefresh={onRefresh}
          refreshing={refreshing}
          actions={actions}
        />

        {/* Banner server belum siap — di dalam kolom konten, bukan di luar
            aplikasi, supaya ikut tergulir bersama halaman dan tidak menutupi
            sidebar. */}

        {/* Satu-satunya area scroll halaman; scrollbar tetap di tepi shell. */}
        {/*
          `overflow-x-hidden` itu wajib, bukan tambahan.

          Kalau satu sumbu sudah `scroll` dan sumbu lain dibiarkan
          `visible`, CSS menghitung sumbu itu menjadi `auto`, bukan
          `visible`. Akibatnya isi yang melebar sedikit saja - misalnya
          tabel yang belum sempat diukur - sudah memunculkan bilah
          gulir horizontal di bagian paling bawah layar. Menulis
          `hidden` eksplisit menutup celah itu.
        */}
        <div className="konten-gulir flex-1 flex flex-col min-w-0 min-h-0 overflow-y-scroll overflow-x-hidden custom-scrollbar relative">
          <main className="poni-konten min-h-full flex-none min-w-0 overflow-x-hidden w-full">
            <div className="min-w-0 w-full">{children}</div>
          </main>
        </div>
      </div>

      {/* Keluar — lewat ConfirmDialog, bukan `window.confirm`. */}
      <ConfirmDialog
        open={konfirmasiKeluar}
        tone="danger"
        title="Keluar dari aplikasi?"
        message="Anda akan kembali ke layar login dan harus masuk lagi. Sesi di perangkat ini akan terputus."
        confirmLabel="Ya, Keluar"
        cancelLabel="Batal"
        loading={sedangKeluar}
        onConfirm={() => void handleKeluar()}
        onCancel={() => setKonfirmasiKeluar(false)}
      />

      {/*
        Peta lihat-lokasi — pasang sekali di sini.

        `bukaPeta(lat, lng)` yang dipanggil dari baris tabel (Riwayat, Data
        Reklame, Rekam Laporan) meneruskan permintaan lewat event; komponen
        ini yang menampilkannya. Tidak ada satu pun halaman perlu memasang
        peta sendiri, dan peta hanya dimuat dari CDN saat benar-benar dibuka.
      */}
      <PetaLihatOtomatis />
    </div>
  )
}