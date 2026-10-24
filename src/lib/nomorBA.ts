import type { LaporanPenindakan } from "@/types"

interface BagianTanggal {
  hari: string
  bulan: string
  tahun: string
}

function bagianTanggal(tanggal: string | Date = new Date()): BagianTanggal {
  if (typeof tanggal === "string") {
    const iso = tanggal.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (iso) return { tahun: iso[1]!, bulan: iso[2]!, hari: iso[3]! }
  }

  const d = tanggal instanceof Date ? tanggal : new Date(tanggal)
  if (!Number.isFinite(d.getTime())) return bagianTanggal(new Date())
  return {
    tahun: String(d.getFullYear()),
    bulan: String(d.getMonth() + 1).padStart(2, "0"),
    hari: String(d.getDate()).padStart(2, "0"),
  }
}

/** Format nomor BA JANAKA, dengan nomor urut dan tanggal laporan. */
export function buildNomorBA(tanggal: string | Date = new Date(), urut = 1): string {
  const { hari, bulan, tahun } = bagianTanggal(tanggal)
  const nomor = String(Math.max(1, Math.trunc(urut))).padStart(3, "0")
  return `BA/${nomor}/JNK/${hari}/${bulan}/${tahun}`
}

/** Ambil nomor urut berikutnya pada tahun yang sama, termasuk data lama. */
export function buildNomorBASelanjutnya(
  laporan: LaporanPenindakan[],
  tanggal: string | Date = new Date(),
): string {
  const { tahun } = bagianTanggal(tanggal)
  let jumlahTahunIni = 0
  let nomorTerbesar = 0

  for (const item of laporan) {
    if (bagianTanggal(item.tanggal || item.createdAt).tahun !== tahun) continue
    jumlahTahunIni += 1

    const baru = item.nomorBA?.match(/^BA\/(\d+)\/JNK\/\d{2}\/\d{2}\/(\d{4})$/i)
    if (baru?.[2] === tahun) nomorTerbesar = Math.max(nomorTerbesar, Number(baru[1]))

    const lama = item.nomorBA?.match(/^(\d+)\/BA\/JANAKA\/(\d{4})$/i)
    if (lama?.[2] === tahun) nomorTerbesar = Math.max(nomorTerbesar, Number(lama[1]))
  }

  return buildNomorBA(tanggal, Math.max(jumlahTahunIni, nomorTerbesar) + 1)
}

/** Pastikan nomor lama tetap tercetak dengan format JANAKA yang baru. */
export function formatNomorBA(
  nomorBA: string | undefined,
  tanggal: string | Date,
  fallbackUrut = 1,
): string {
  const nomorBaru = nomorBA?.match(/^BA\/(\d+)\/JNK\/(\d{2})\/(\d{2})\/(\d{4})$/i)
  if (nomorBaru) {
    return buildNomorBA(tanggal, Number(nomorBaru[1]))
  }

  const nomorLama = nomorBA?.match(/^(\d+)\/BA\/JANAKA\/(\d{4})$/i)
  const urut = nomorLama ? Math.max(1, Number(nomorLama[1])) : fallbackUrut
  return buildNomorBA(tanggal, urut)
}
