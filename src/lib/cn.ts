/**
 * Penyusun nama kelas.
 *
 * Versi minimal tanpa dependensi: menyaring `false | null | undefined` lalu
 * menggabungkan sisanya. Tidak menyelesaikan konflik antar-utility yang
 * bertentangan (mis. `p-2` vs `p-4`) — pemanggil harus memilih satu.
 */

export type ClassValue =
  | string
  | number
  | null
  | undefined
  | false
  | ClassValue[]
  | Record<string, boolean | null | undefined>

export function cn(...values: ClassValue[]): string {
  const out: string[] = []

  const push = (value: ClassValue): void => {
    if (!value && value !== 0) return
    if (typeof value === "string" || typeof value === "number") {
      out.push(String(value))
      return
    }
    if (Array.isArray(value)) {
      for (const item of value) push(item)
      return
    }
    if (typeof value === "object") {
      for (const [key, aktif] of Object.entries(value)) {
        if (aktif) out.push(key)
      }
    }
  }

  for (const value of values) push(value)
  return out.join(" ")
}

/** Inisial untuk avatar cadangan: "Administrator JANAKA" → "AJ". */
export function initials(nama: string | undefined | null, maks = 2): string {
  const bagian = String(nama ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (bagian.length === 0) return ""
  if (bagian.length === 1) return bagian[0]!.slice(0, maks).toUpperCase()
  return bagian
    .slice(0, maks)
    .map((b) => b[0]!)
    .join("")
    .toUpperCase()
}