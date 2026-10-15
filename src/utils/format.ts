import { addMonths, differenceInCalendarDays, isValid, parseISO } from "date-fns"
import { id as idLocale } from "date-fns/locale"

/** Coerces Firestore Timestamp | ISO string | Date → Date (null bila invalid). */
export function toDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null
  if (value instanceof Date) return isValid(value) ? value : null
  if (typeof value === "object" && "toDate" in (value as object)) {
    const d = (value as { toDate: () => Date }).toDate()
    return isValid(d) ? d : null
  }
  if (typeof value === "number") {
    const d = new Date(value)
    return isValid(d) ? d : null
  }
  if (typeof value === "string") {
    const iso = parseISO(value)
    if (isValid(iso)) return iso
    const plain = new Date(value)
    return isValid(plain) ? plain : null
  }
  return null
}

/* ─────────────────────────  Format tampilan  ───────────────────────── */

export function formatTanggalLengkap(value: unknown): string {
  const d = toDate(value)
  return d ? d.toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" }) : "-"
}

export function formatTanggalSingkat(value: unknown): string {
  const d = toDate(value)
  return d ? d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "-"
}

export function formatTanggalWaktu(value: unknown): string {
  const d = toDate(value)
  return d
    ? `${d.toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" })} ${d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}`
    : "-"
}

export function formatWaktu(value: unknown): string {
  const d = toDate(value)
  return d ? d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "-"
}

export function formatRupiah(angka: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(angka)
}

export function formatPersentase(angka: number, desimal = 1): string {
  if (!Number.isFinite(angka)) return "0%"
  return `${angka.toFixed(desimal)}%`
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "-"
  if (bytes < 1024) return `${bytes} B`
  const units = ["KB", "MB", "GB"]
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`
}

/* ─────────────────────────  Status SK  ───────────────────────── */

export type StatusSK = "Aktif" | "Akan Habis" | "Kadaluarsa"

/** Ambang "akan habis" dalam hari. */
export const AMBANG_AKAN_HABIS_HARI = 30

export interface MasaAktifSK {
  tanggalMulai: string
  tanggalSampai: string
  status: StatusSK
  sisaHari: number | null
  deskripsi: string
}

/**
 * Tentukan status SK dari tanggal mulai & tanggal berlaku sampai
 * (langsung dari API PTSP — tidak perlu menebak masa berlaku).
 */
export function kalkulasiMasaAktifSK(
  berlakuMulai: unknown,
  berlakuSampai: unknown,
  adaSK = true,
): MasaAktifSK {
  const mulai = toDate(berlakuMulai)
  const selesai = toDate(berlakuSampai)

  if (!adaSK) {
    return {
      tanggalMulai: "-",
      tanggalSampai: "-",
      status: "Kadaluarsa",
      sisaHari: null,
      deskripsi: "Tidak memiliki Surat Izin (SK) — dasar penindakan",
    }
  }

  if (!selesai) {
    return {
      tanggalMulai: formatTanggalSingkat(mulai),
      tanggalSampai: "-",
      status: "Kadaluarsa",
      sisaHari: null,
      deskripsi: "Tanggal berakhir SK tidak tersedia",
    }
  }

  const sisaHari = differenceInCalendarDays(selesai, new Date())

  let status: StatusSK
  let deskripsi: string

  if (sisaHari < 0) {
    status = "Kadaluarsa"
    deskripsi = `Masa izin kadaluarsa ${Math.abs(sisaHari)} hari lalu`
  } else if (sisaHari === 0) {
    status = "Kadaluarsa"
    deskripsi = "Masa izin berakhir hari ini"
  } else if (sisaHari <= AMBANG_AKAN_HABIS_HARI) {
    status = "Akan Habis"
    deskripsi = `Masa izin berakhir dalam ${sisaHari} hari`
  } else {
    status = "Aktif"
    deskripsi = `Masa izin aktif hingga ${formatTanggalSingkat(selesai)}`
  }

  return {
    tanggalMulai: formatTanggalSingkat(mulai),
    tanggalSampai: formatTanggalSingkat(selesai),
    status,
    sisaHari,
    deskripsi,
  }
}

/** Hitung masa berlaku dalam bulan antara dua tanggal. */
export function hitungMasaBulan(berlakuMulai: unknown, berlakuSampai: unknown): number {
  const a = toDate(berlakuMulai)
  const b = toDate(berlakuSampai)
  if (!a || !b) return 0
  const months =
    (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + 1
  return Math.max(0, months)
}

/** Turunkan tanggal berakhir bila hanya tanggal mulai & masa bulan yang ada. */
export function hitungTanggalBerakhir(berlakuMulai: unknown, bulan: number): Date | null {
  const a = toDate(berlakuMulai)
  if (!a || !Number.isFinite(bulan) || bulan <= 0) return null
  return addMonths(a, bulan)
}

export function cekStatusSK(
  berlakuMulai: unknown,
  berlakuSampai: unknown,
  adaSK = true,
): StatusSK {
  return kalkulasiMasaAktifSK(berlakuMulai, berlakuSampai, adaSK).status
}

export function isLewat(value: unknown): boolean {
  const d = toDate(value)
  return !!d && d.getTime() < Date.now()
}

export { idLocale }