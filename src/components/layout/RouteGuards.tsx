import { Navigate, useLocation } from "react-router-dom"
import { ShieldAlert } from "lucide-react"
import { Link } from "react-router-dom"
import type { ReactNode } from "react"
import { useAuth } from "@/context/AuthContext"
import { FullLoader } from "@/components/ui/primitives"
import { JanakaLogo } from "./JanakaLogo"
import type { AppPermissions } from "@/lib/access"

/**
 * Guard rute: mewajibkan login + (opsional) izin tertentu.
 *
 * Meniru pola prabawa — pemeriksaan dilakukan tiga kali:
 *  1. Di sini (UX: cegah render halaman)
 *  2. Di `/api/janaka/*` (rezeki: hanya server yang menyentuh Admin SDK)
 *  3. Di Firestore Security Rules (lapis ketiga untuk akses langsung)
 */
export function ProtectedRoute({
  children,
  permission,
  role,
}: {
  children: ReactNode
  /** Izin yang harus dimiliki. */
  permission?: keyof AppPermissions
  /** Peran yang diizinkan. */
  role?: "admin" | "user"
}) {
  const { isAuthenticated, isLoading, profile, permissions, role: userRole, sessionError } =
    useAuth()
  const location = useLocation()

  /*
   * Verifikasi sesi memakai kerangka shell, bukan spinner.
   *
   * `isLoading` di sini bukan cuma untukMUAT PERTAMA: sesi diverifikasi
   * ulang setiap kali halaman dimuat ulang, sehingga tanpa alasan yang jelas
   * layar berkedip kosong beberapa kali. Kerangka shell menutupi masalahnya
   * dengan cara yang benar — bentuknya meniru shell asli (sidebar 256px,
   * header 56px, jarak, jumlah menu), jadi saat profil tiba tidak ada lompatan
   * layout sama sekali.
   */
  if (isLoading) return <FullLoader label="Memeriksa sesi…" />

  // Sudah login tapi profil gagal dimuat — jangan lempar ke login (loop).
  if (sessionError) return <SessionError message={sessionError} />

  // Belum login → arahkan ke halaman login, simpan tujuan untuk kembali.
  if (!isAuthenticated || !profile) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  // Role tidak cocok.
  if (role && userRole !== role) return <AccessDenied />

  // Izin tidak dimiliki — dihitung ulang di server, bukan dari cache browser.
  if (permission && !permissions[permission]) return <AccessDenied />

  return <>{children}</>
}

export function AccessDenied() {
  const { profile } = useAuth()

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/10">
          <ShieldAlert className="h-7 w-7 text-rose-600 dark:text-rose-400" />
        </div>
        <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">
          Akses Ditolak
        </h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Halaman ini tidak tersedia untuk akun Anda
          {profile?.namaLengkap ? ` (${profile.namaLengkap})` : ""}. Hubungi administrator bila
          Anda merasa ini keliru.
        </p>
        <Link
          to="/dashboard"
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white transition-colors hover:bg-blue-700"
        >
          Kembali ke Dashboard
        </Link>
      </div>
    </div>
  )
}

/** Sesi valid tetapi profil tidak bisa dimuat — jelaskan, jangan putar roda. */
function SessionError({ message }: { message: string }) {
  const { logout } = useAuth()

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-[#0B1120] p-6">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl">
          <JanakaLogo className="h-10 w-10" />
        </div>
        <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">
          Sesi belum dapat diverifikasi
        </h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{message}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white transition-colors hover:bg-blue-700"
          >
            Muat Ulang
          </button>
          <button
            type="button"
            onClick={() => void logout()}
            className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-300 transition-colors hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            Keluar
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Route publik — hanya untuk yang belum login.
 *
 * ## Kenapa TIDAK ada kerangka di sini
 * Semula `isLoading` menampilkan `KerangkaLogin`. Dua alasan menghapusnya:
 *
 * 1. **Bentuknya sudah basi.** `KerangkaLogin` masih meniru layout
 *    login yang lama — layar terbelah dua, panel kiri `w-1/2`, tanpa
 *    batik, tanpa foto. Login yang sekarang adalah satu kartu
 *    `max-w-[980px]` dengan dua panel di dalamnya. Kerangka yang tidak
 *    sama bentuk justru membuat halaman melompat, bukan mencegahnya.
 *
 * 2. **Di sini tidak perlu.** `isLoading` pada rute publik hanya
 *    memeriksa sesi yang sudah tersimpan di perangkat. Halaman login
 *    sendiri sudah menampilkan spinner di tombolnya, dan `Login` sudah
 *    punya `useEffect` yang memindahkan ke dashboard begitu
 *    `isAuthenticated` jadi benar. Jadi merender
 *    `<Login />` langsung aman: kalau memang sudah login, perpindahan
 *    terjadi sendiri; kalau belum, formulirnya sudah siap diketik.
 */
export function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth()
  if (isAuthenticated) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}