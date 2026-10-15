import { RefreshCw } from "lucide-react"
import { useAuth } from "@/context/AuthContext"
import { Alert, ActionButton } from "@/components/ui/primitives"

export interface FirestoreBannerProps {
  /** Pesan error dari listener Firestore. */
  error: string | null
  /** Data yang berhasil dimuat trotz error. */
  count: number
  onRetry: () => void
  className?: string
}

/**
 * Banner untuk kasus Firestore tidak dapat diakses: security rules belum
 * di-deploy, atau offline.
 *
 * Aplikasi tetap berfungsi penuh (data PTSP tetap tampil); yang kosong hanya
 * data JANAKA sendiri. Karena itu pesannya ditampilkan sebagai **informasi**,
 * bukan error.
 */
export function FirestoreBanner({ error, count, onRetry, className = "" }: FirestoreBannerProps) {
  const { isAuthenticated, isLoading } = useAuth()
  if (!error) return null

  const belumLogin = !isAuthenticated && !isLoading

  const judul = belumLogin ? "Data JANAKA belum aktif" : "Firestore belum siap"

  const pesan = belumLogin
    ? "Masuk terlebih dahulu untuk menyimpan dan melihat riwayat penindakan JANAKA. Data PTSP tetap dapat diakses."
    : `Tidak dapat membaca koleksi JANAKA (${error}). Jalankan "firebase deploy --only firestore:rules" untuk mengaktifkan. Data PTSP tetap dapat diakses.`

  return (
    <Alert
      tone="blue"
      className={className}
      action={
        <ActionButton size="sm" variant="ghost" onClick={onRetry} icon={<RefreshCw className="w-3.5 h-3.5" />}>
          Coba Lagi
        </ActionButton>
      }
    >
      <p className="font-bold">{judul}</p>
      <p className="mt-0.5">
        {count > 0 ? `${count} data JANAKA terbaca. ` : ""}
        {pesan}
      </p>
    </Alert>
  )
}