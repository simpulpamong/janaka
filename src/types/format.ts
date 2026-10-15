/**
 * Utilitas format tanggal & angka.
 */

const BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
]

/** Format ISO `YYYY-MM-DD` → `DD MMMM YYYY`. */
export function formatTanggalLengkap(iso: string | Date | null | undefined): string {
  if (!iso) return "—"
  const d = iso instanceof Date ? iso : new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`
}

/** Format ISO → `DD/MM/YYYY`. */
export function formatTanggalSingkat(iso: string | Date | null | undefined): string {
  if (!iso) return "—"
  const d = iso instanceof Date ? iso : new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`
}

/** Format ISO → `DD/MM/YYYY HH:mm`. */
export function formatTanggalWaktu(iso: string | Date | null | undefined): string {
  if (!iso) return "—"
  const d = iso instanceof Date ? iso : new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

/** Format persentase dengan presisi. */
export function formatPersentase(nilai: number, presisi = 1): string {
  if (!Number.isFinite(nilai)) return "0%"
  return `${nilai.toFixed(presisi)}%`
}

/** Format ukuran file (bytes → KB/MB/GB). */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const satuan = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${satuan[i]}`
}
