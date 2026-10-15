import { Badge, type BadgeTone } from "@/components/ui/primitives"
import type { StatusSK } from "@/utils/format"

const config: Record<StatusSK, { tone: BadgeTone; dot: string }> = {
  Aktif: { tone: "emerald", dot: "bg-emerald-500" },
  "Akan Habis": { tone: "amber", dot: "bg-amber-500" },
  Kadaluarsa: { tone: "rose", dot: "bg-rose-500" },
}

/**
 * Lencana status izin.
 *
 * Titik warna di kiri bukan hiasan: tanpa itu, lencana hanya membedakan
 * "Aktif"/"Kadaluarsa" dengan kata yang harus dibaca satu per satu — dan di
 * tabel 10 baris, membaca sekilasnyalah yang dibutuhkan.
 */
export function StatusBadge({ status }: { status: StatusSK }) {
  const c = config[status] ?? config.Aktif
  return (
    <Badge tone={c.tone}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} aria-hidden="true" />
      {status}
    </Badge>
  )
}