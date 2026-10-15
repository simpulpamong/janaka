import { RefreshCw, WifiOff } from "lucide-react"
import { Alert, ActionButton } from "@/components/ui/primitives"

export interface DataStatusBannerProps {
  loading: boolean
  progress: number
  error: string | null
  stale: boolean
  count: number
  onRetry: () => void
}

/**
 * Banner status koneksi data.
 *
 * Hanya muncul saat sedang memuat atau gagal. Angka `0` di dashboard saat API
 * mati adalah keadaan yang paling membingungkan — banner ini yang menjelaskan
 * mengapa, beserta tombol untuk mencoba lagi.
 */
export function DataStatusBanner({
  loading,
  progress,
  error,
  stale,
  count,
  onRetry,
}: DataStatusBannerProps) {
  if (loading) {
    return (
      <Alert tone="blue" icon={<RefreshCw className="w-4 h-4 shrink-0 mt-0.5 animate-spin" />}>
        <span className="flex flex-wrap items-center gap-x-2">
          <span>Memuat data reklame dari server PTSP…</span>
          <span className="font-mono font-bold tabular-nums">{progress}%</span>
          <span className="hidden h-1.5 w-32 overflow-hidden rounded-full bg-blue-200 dark:bg-blue-900/50 sm:inline-block">
            <span
              className="block h-full rounded-full bg-blue-500 transition-[width] duration-300"
              style={{ width: `${progress}%` }}
            />
          </span>
        </span>
      </Alert>
    )
  }

  if (!error) return null

  return (
    <Alert
      tone="amber"
      icon={<WifiOff className="w-4 h-4 shrink-0 mt-0.5" />}
      action={
        <ActionButton size="sm" variant="ghost" onClick={onRetry} icon={<RefreshCw className="w-3.5 h-3.5" />}>
          Coba Lagi
        </ActionButton>
      }
    >
      <p className="font-bold">Data PTSP tidak dapat dimuat</p>
      <p className="mt-0.5">{error}</p>
      {stale && count > 0 ? (
        <p className="mt-0.5">
          Menampilkan <span className="font-bold">{count} titik</span> dari cache lokal.
        </p>
      ) : (
        /*
         * Sarannya harus sesuai dengan tempat aplikasinya berjalan.
         *
         * Menyarankan `npm run dev` kepada pengguna yang sedang membuka
         * situs Vercel hanya membuang waktunya — masalahnya sama sekali
         * tidak ada hubungannya dengan dev server.
         */
        <p className="mt-0.5">
          {import.meta.env.DEV ? (
            <>
              Penyebab umum: dev server dimatikan atau berganti port, atau jaringan terputus.
              Pastikan sedang menjalankan{" "}
              <code className="rounded bg-black/5 px-1 font-mono text-[11px] dark:bg-white/10">
                npm run dev
              </code>{" "}
              dan buka alamat yang tertera di terminal (mis.{" "}
              <code className="rounded bg-black/5 px-1 font-mono text-[11px] dark:bg-white/10">
                localhost:5173
              </code>
              ).
            </>
          ) : (
            <>
              Di situs yang online, penyebab umumnya: service worker masih
              menyajikan versi lama. Muat ulang paksa (<kbd>Ctrl</kbd>+
              <kbd>Shift</kbd>+<kbd>R</kbd>), atau hubungi admin bila tetap gagal.
            </>
          )}
        </p>
      )}
    </Alert>
  )
}