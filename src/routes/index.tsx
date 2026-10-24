import { useLocation, useParams, useRouteError, isRouteErrorResponse, Link, Navigate } from "react-router-dom"
import { AlertTriangle, Home, RotateCcw } from "lucide-react"
import type { RouteObject } from "react-router-dom"
import Login from "@/pages/Login"
import Dashboard from "@/pages/Dashboard"
import ReklameList from "@/pages/ReklameList"
import DetailReklame from "@/pages/DetailReklame"
import Execution from "@/pages/Execution"
import Riwayat from "@/pages/Riwayat"
import Pengaturan from "@/pages/Pengaturan"
import Mapping from "@/pages/Mapping"

import { ProtectedRoute, PublicOnlyRoute } from "@/components/layout/RouteGuards"
import type { AppPermissions } from "@/lib/access"

const ERR = <RouteErrorPage />

/** Bungkus elemen dengan proteksi login + izin tertentu. */
function guard(
  permission: keyof AppPermissions,
  element: React.ReactNode,
): React.ReactElement {
  return <ProtectedRoute permission={permission}>{element}</ProtectedRoute>
}

/**
 * Halaman fallback ketika satu route gagal render.
 * Menampilkan pesan ramah alih-alih layar putih.
 */
export function RouteErrorPage() {
  const error = useRouteError()

  const status = isRouteErrorResponse(error) ? error.status : 500
  const message = isRouteErrorResponse(error)
    ? error.statusText || "Halaman tidak ditemukan"
    : error instanceof Error
      ? error.message
      : "Terjadi kesalahan yang tidak diketahui"

  return (
    <div className="flex min-h-[70vh] items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-card">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/15">
          <AlertTriangle className="h-7 w-7 text-amber-500" />
        </div>

        <p className="text-5xl font-bold tabular-nums text-muted-foreground">{status}</p>
        <h1 className="mt-2 text-lg font-semibold text-foreground">
          {status === 404 ? "Halaman tidak ditemukan" : "Halaman gagal dimuat"}
        </h1>
        <p className="mt-2 break-words text-sm text-muted-foreground">{message}</p>

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Home className="h-4 w-4" />
            Ke Dashboard
          </Link>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            <RotateCcw className="h-4 w-4" />
            Muat Ulang
          </button>
        </div>
      </div>
    </div>
  )
}

/** 404 — rute yang tidak dikenal. */
function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
      <p className="text-6xl font-black tabular-nums text-primary">404</p>
      <h1 className="text-lg font-semibold text-foreground">Halaman tidak ditemukan</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Alamat yang Anda tuju tidak tersedia atau sudah dipindahkan.
      </p>
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
      >
        <Home className="h-4 w-4" />
        Kembali ke Dashboard
      </Link>
    </div>
  )
}

/**
 * Pengalih untuk tautan lama ke halaman detail reklame.
 *
 * `<Navigate to="/data-reklame/:id">` tidak akan mengganti `:id` — hasilnya
 * URL harfiah "/data-reklame/:id". Jadi param-nya dibaca manual di sini.
 */
function RedirectDetailReklame() {
  const { id } = useParams()
  return <Navigate to={id ? `/data-reklame/${id}` : "/data-reklame"} replace />
}

/** Pertahankan ID titik saat tautan lama `/execution?reklameId=...` dialihkan. */
function RedirectExecution() {
  const location = useLocation()
  return <Navigate to={`/laporan${location.search}${location.hash}`} replace />
}

export const routes: RouteObject[] = [
  /* Publik */
  {
    path: "/login",
    element: (
      <PublicOnlyRoute>
        <Login />
      </PublicOnlyRoute>
    ),
    errorElement: ERR,
  },

  /* Terlindungi — izin per halaman */
  {
    path: "/dashboard",
    element: guard("menuDashboard", <Dashboard />),
    errorElement: ERR,
  },
  {
    /*
     * ⚠️ JANGAN dibungkus `Suspense` di sini.
     *
     * `Mapping` TIDAK lagi dimuat malas di tingkat rute — sengaja. Kalau ia
     * `lazy()`, rute ini butuh `Suspense`, dan `fallback`-nya menggantikan
     * **seluruh** `<Mapping />` termasuk `AppLayout`-nya. Akibatnya sidebar
     * dan Topbar ikut hilang, dan layar hanya berisi peta kosong — tidak
     * seperti halaman lain.
     *
     * Yang berat dari halaman ini bukan halamannya, melainkan
     * `MappingWithDraw` (Leaflet). Komponen itulah yang dimuat malas, di
     * dalam `Mapping.tsx`, lewat `Suspense` yang hanya menutupi kotak
     * peta. Jadi shell tetap tampil seketika, peta menyusul sendiri.
     */
    path: "/mapping",
    element: guard("menuMapping", <Mapping />),
    errorElement: ERR,
  },
  {
    path: "/data-reklame",
    element: guard("menuReklame", <ReklameList />),
    errorElement: ERR,
  },
  {
    path: "/data-reklame/:id",
    element: guard("menuReklame", <DetailReklame />),
    errorElement: ERR,
  },
  {
    path: "/laporan",
    element: guard("menuLaporan", <Execution />),
    errorElement: ERR,
  },
  {
    path: "/rekap",
    element: guard("menuRiwayat", <Riwayat />),
    errorElement: ERR,
  },

  /* Pengaturan */
  {
    path: "/pengaturan",
    element: guard("aksiUbahPassword", <Pengaturan />),
    errorElement: ERR,
  },
  {
    path: "/pengaturan/pengguna",
    element: <Navigate to="/pengaturan?tab=pengguna" replace />,
    errorElement: ERR,
  },

  /* Alias & rute lama — tetap buka supaya tautan/Bookmark lama tidak mati. */
  {
    path: "/",
    element: <Navigate to="/dashboard" replace />,
    errorElement: ERR,
  },
  { path: "/users", element: <Navigate to="/pengaturan?tab=pengguna" replace />, errorElement: ERR },
  { path: "/settings", element: <Navigate to="/pengaturan?tab=profil" replace />, errorElement: ERR },
  {
    path: "/reklame-list",
    element: <Navigate to="/data-reklame" replace />,
    errorElement: ERR,
  },
  {
    path: "/reklame-list/:id",
    element: <RedirectDetailReklame />,
    errorElement: ERR,
  },
  { path: "/execution", element: <RedirectExecution />, errorElement: ERR },
  { path: "/riwayat", element: <Navigate to="/rekap" replace />, errorElement: ERR },

  { path: "*", element: <NotFound />, errorElement: ERR },
]
