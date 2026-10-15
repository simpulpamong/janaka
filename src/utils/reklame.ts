import { kalkulasiMasaAktifSK } from "./format"
import type { StatusSK } from "./format"
import type { ApiReklameItem, ApiSK } from "@/services/ptspservice"

/* ═══════════════════════════════════════════════════════════════════
 *  Batas wilayah Kabupaten Ponorogo (approx).
 *  Dipakai untuk mendeteksi koordinat yang tidak valid / salah tanda.
 * ═══════════════════════════════════════════════════════════════════ */

const BATAAS_WILAYAH = {
  latMin: -8.35,
  latMax: -7.25,
  lngMin: 110.95,
  lngMax: 112.15,
}

/** Koordinat tengah Kabupaten Ponorogo — untuk item tanpa koordinat. */
export const PONOROGO_CENTER: [number, number] = [-7.6304, 111.5158]

/* ─────────────────────────  Model internal  ───────────────────────── */

export interface ReklameItem {
  id: string
  /** Kode reklame internal dari PTSP, mis. 1811025 */
  idReklame?: string

  /** Nama pemilik / perusahaan. Fallback ke naskah, lalu alamat. */
  namaPemilik: string
  /** Naskah reklame yang tercantum pada SK. */
  naskahReklame: string
  /** true bila nama tidak berasal dari SK (belum berizin). */
  namaDariSK: boolean

  alamat: string
  kecamatan: string
  desa: string

  lat: number
  lng: number
  /** true bila koordinat valid & berada di wilayah Ponorogo. */
  hasCoordinate: boolean
  /** true bila koordinat dinormalkan (mis. tanda minus hilang di upstream). */
  koordinatDinormalkan: boolean

  /** Dimensi dalam sentimeter, mis. "150 × 300 cm". */
  dimensi: string
  /** Luas dalam m² (dihitung dari dimensi cm). */
  luasTanah: number
  /** Jumlah titik reklame dalam satu item. */
  jumlah: number
  jenisReklame: string

  isPermanen: boolean
  isAktif: boolean

  /** Nomor SK aktif. */
  noSK: string
  /** Tautan dokumen SK digital. */
  urlSK: string
  adaSK: boolean

  /** Status mentah dari API: aktif | expired | belum_berizin. */
  statusApi: string

  berlakuMulai: string | null
  berlakuSampai: string | null
  masaBerlakuBulan: number

  statusSK: StatusSK
  statusDetail: string
  sisaHari: number | null

  /** Sumber data: true = input JANAKA (lapangan), false = PTSP. */
  dariJANAKA: boolean

  raw: ApiReklameItem
}

/* ─────────────────────────  Helper  ───────────────────────── */

function str(value: unknown): string {
  if (value === null || value === undefined) return ""
  const s = String(value).trim()
  return s === "" || s === "null" || s === "-" || s === "0" ? "" : s
}

function num(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function isTrueFlag(value: unknown): boolean {
  return str(value) === "1" || value === true
}

/** Ambil SK yang paling relevan: sk_aktif → sk_terakhir. */
function pilihSK(item: ApiReklameItem): ApiSK | null {
  if (!item?.sk) return null
  return item.sk.sk_aktif ?? item.sk.sk_terakhir ?? null
}

function dalamWilayah(lat: number, lng: number): boolean {
  return (
    lat >= BATAAS_WILAYAH.latMin &&
    lat <= BATAAS_WILAYAH.latMax &&
    lng >= BATAAS_WILAYAH.lngMin &&
    lng <= BATAAS_WILAYAH.lngMax
  )
}

/**
 * Parse koordinat PTSP. Format: string "lat, lng".
 *
 * Sebagian data di upstream kehilangan tanda minus latitude (mis.
 * "7.8354774,111.4853968" untuk lokasi yang seharusnya -7.83).
 * Fungsi ini mengoreksi nilai tersebut berdasarkan batas wilayah.
 */
export function parseKoordinat(rawKoordinat: string): {
  lat: number
  lng: number
  hasCoordinate: boolean
  dinormalkan: boolean
} {
  const kosong = { lat: 0, lng: 0, hasCoordinate: false, dinormalkan: false }

  const text = str(rawKoordinat)
  if (!text) return kosong

  const parts = text.split(",").map((p) => Number(p.trim()))
  if (parts.length < 2) return kosong

  let [lat, lng] = parts
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return kosong
  if (lat === 0 && lng === 0) return kosong

  let dinormalkan = false

  // Latitude positif untuk Ponorogo hampir pasti tanda minus hilang.
  if (lat > 0 && dalamWilayah(-lat, lng)) {
    lat = -lat
    dinormalkan = true
  }
  // Longitude di luar rentang → coba balik tanda (kemungkinan data terbalik).
  if (!dalamWilayah(lat, lng) && dalamWilayah(lat, -lng)) {
    lng = -lng
    dinormalkan = true
  }

  if (!dalamWilayah(lat, lng)) {
    // Koordinat ada tapi di luar Ponorogo — tetap simpan, tandai tidak valid.
    return { lat, lng, hasCoordinate: false, dinormalkan }
  }

  return { lat, lng, hasCoordinate: true, dinormalkan }
}

/** Susun alamat lengkap: alamat + desa + kecamatan. */
function susunAlamat(item: ApiReklameItem): string {
  const base = str(item.alamat)
  const wilayah = [str(item.desa), str(item.kecamatan)].filter(Boolean).join(", ")
  if (!base) return wilayah || "-"
  return wilayah ? `${base}, ${wilayah}` : base
}

/** Dimensi "150 × 300 cm" dan luas dalam m². */
function hitungDimensi(item: ApiReklameItem): { dimensi: string; luas: number } {
  const panjang = num(item.panjang) // sentimeter
  const lebar = num(item.lebar) // sentimeter
  if (!panjang || !lebar) return { dimensi: "-", luas: 0 }
  return {
    dimensi: `${panjang} × ${lebar} cm`,
    luas: Math.round(((panjang / 100) * (lebar / 100)) * 100) / 100,
  }
}

function hitungMasaBulan(mulai: string | null, sampai: string | null): number {
  if (!mulai || !sampai) return 0
  const a = new Date(mulai)
  const b = new Date(sampai)
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0
  const months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth())
  return months > 0 ? months : 1
}

/* ─────────────────────  Status SK: pakai nilai dari API  ───────────────────── */

/**
 * API PTSP sudah menyediakan `sk.status` dengan nilai:
 *   - `aktif`          → SK valid
 *   - `expired`        → SK kedaluwarsa
 *   - `belum_berizin`  → belum punya SK sama sekali
 *
 * Nilai API dipakai sebagai sumber kebenaran. Perhitungan tanggal hanya
 * dipakai sebagai pelengkap (untuk "akan habis" & keterangan sisa hari),
 * karena `berlaku_sampai` selalu tersedia pada SK.
 */
function tentukanStatus(
  item: ApiReklameItem,
  sk: ApiSK | null,
  adaSK: boolean,
): { status: StatusSK; sisaHari: number | null; detail: string } {
  const statusApi = str(item?.sk?.status).toLowerCase()

  if (statusApi === "belum_berizin" || (!adaSK && statusApi !== "aktif")) {
    return {
      status: "Kadaluarsa",
      sisaHari: null,
      detail: "Belum memiliki SK — dasar penindakan",
    }
  }

  const masa = kalkulasiMasaAktifSK(sk?.berlaku_mulai, sk?.berlaku_sampai, adaSK)

  if (statusApi === "expired") {
    return {
      status: "Kadaluarsa",
      sisaHari: masa.sisaHari,
      detail: masa.sisaHari !== null && masa.sisaHari < 0
        ? `SK kedaluwarsa ${Math.abs(masa.sisaHari)} hari lalu`
        : "SK berstatus kedaluwarsa pada PTSP",
    }
  }

  if (statusApi === "aktif") {
    return { status: masa.status, sisaHari: masa.sisaHari, detail: masa.deskripsi }
  }

  // Status API tidak dikenal → andalkan kalkulasi tanggal.
  return { status: masa.status, sisaHari: masa.sisaHari, detail: masa.deskripsi }
}

/* ─────────────────────────  Normalisasi  ───────────────────────── */

export function normalizeReklame(item: ApiReklameItem): ReklameItem {
  const sk = pilihSK(item)
  const statusApi = str(item?.sk?.status).toLowerCase()
  const adaSK =
    !!item?.sk?.ada_sk &&
    !!sk &&
    statusApi !== "belum_berizin" &&
    !!sk.berlaku_sampai

  const berlakuMulai = adaSK ? (sk!.berlaku_mulai ?? null) : null
  const berlakuSampai = adaSK ? (sk!.berlaku_sampai ?? null) : null

  const { lat, lng, hasCoordinate, dinormalkan } = parseKoordinat(item?.koordinat)
  const { dimensi, luas } = hitungDimensi(item)
  const { status, sisaHari, detail } = tentukanStatus(item, sk, adaSK)

  // Nama pemilik: SK → naskah reklame → alamat → penanda belum berizin
  const namaDariSK = str(sk?.nm_perusahaan) || str(sk?.naskah_reklame)
  const namaPemilik =
    namaDariSK ||
    susunAlamat(item) ||
    (statusApi === "belum_berizin" ? "Tanpa Nama (Belum Berizin)" : "Tidak Diketahui")

  return {
    id: str(item?.id),
    idReklame: str(item?.idreklame) || undefined,
    namaPemilik,
    naskahReklame: str(sk?.naskah_reklame) || "-",
    namaDariSK: !!namaDariSK,
    alamat: susunAlamat(item),
    kecamatan: str(item?.kecamatan) || "-",
    desa: str(item?.desa) || "-",
    lat,
    lng,
    hasCoordinate,
    koordinatDinormalkan: dinormalkan,
    dimensi,
    luasTanah: luas,
    jumlah: num(item?.jumlah) || 1,
    jenisReklame: str(item?.nama_jenis) || "-",
    isPermanen: isTrueFlag(item?.is_permanen),
    isAktif: isTrueFlag(item?.is_aktif),
    noSK: adaSK ? str(sk!.no_sk) || "-" : "-",
    urlSK: adaSK ? str(sk!.file_sk?.url) || "" : "",
    adaSK,
    statusApi: statusApi || "tidak_diketahui",
    berlakuMulai,
    berlakuSampai,
    masaBerlakuBulan: hitungMasaBulan(berlakuMulai, berlakuSampai),
    statusSK: status,
    statusDetail: detail,
    sisaHari,
    dariJANAKA: false,
    raw: item,
  }
}

export function normalizeReklameList(items: ApiReklameItem[]): ReklameItem[] {
  if (!Array.isArray(items)) return []
  return items
    .filter((i): i is ApiReklameItem => !!i && typeof i === "object" && !!i.id)
    .map(normalizeReklame)
}

/* ─────────────────────────  Riwayat SK  ───────────────────────── */

export interface RiwayatSK {
  id: string
  idReklame: string
  noSK: string
  namaPerusahaan: string
  naskahReklame: string
  berlakuMulai: string
  berlakuSampai: string
  masaBulan: number
  status: StatusSK
  statusLabel: string
  urlSK: string
  adaFile: boolean
  adalahTerakhir: boolean
}

export function normalizeRiwayat(
  list: ApiSK[],
  skTerakhir?: string | null,
): RiwayatSK[] {
  if (!Array.isArray(list)) return []

  const rows = list.map((sk, i) => {
    const masa = kalkulasiMasaAktifSK(sk.berlaku_mulai, sk.berlaku_sampai, true)
    const idTerakhir = skTerakhir ? String(skTerakhir) : null
    const adalahTerakhir = idTerakhir ? String(sk.id) === idTerakhir : i === 0

    return {
      id: str(sk.id),
      idReklame: str(sk.idreklame) || "-",
      noSK: str(sk.no_sk) || "-",
      namaPerusahaan: str(sk.nm_perusahaan) || "-",
      naskahReklame: str(sk.naskah_reklame) || "-",
      berlakuMulai: sk.berlaku_mulai ?? "",
      berlakuSampai: sk.berlaku_sampai ?? "",
      masaBulan: hitungMasaBulan(sk.berlaku_mulai ?? null, sk.berlaku_sampai ?? null),
      status: masa.status,
      statusLabel: adalahTerakhir ? "SK Terakhir" : "Riwayat",
      urlSK: str(sk.file_sk?.url) || "",
      adaFile: !!sk.file_sk?.tersedia,
      adalahTerakhir,
    }
  })

  return rows.sort((a, b) => b.berlakuMulai.localeCompare(a.berlakuMulai))
}

/* ─────────────────────────  Statistik  ───────────────────────── */

export interface StatistikReklame {
  total: number
  aktif: number
  akanHabis: number
  kadaluarsa: number
  /** SK berstatus `expired` menurut PTSP. */
  expired: number
  /** SK berstatus `belum_berizin` menurut PTSP. */
  belumBerizin: number
  permanen: number
  denganKoordinat: number
  tanpaKoordinat: number
  koordinatDinormalkan: number
  luasTotal: number
  persenKadaluarsa: number
}

export function hitungStatistik(list: ReklameItem[]): StatistikReklame {
  const total = list.length
  const aktif = list.filter((r) => r.statusSK === "Aktif").length
  const akanHabis = list.filter((r) => r.statusSK === "Akan Habis").length
  const kadaluarsa = list.filter((r) => r.statusSK === "Kadaluarsa").length
  const expired = list.filter((r) => r.statusApi === "expired").length
  const belumBerizin = list.filter((r) => r.statusApi === "belum_berizin").length
  const permanen = list.filter((r) => r.isPermanen).length
  const denganKoordinat = list.filter((r) => r.hasCoordinate).length
  const koordinatDinormalkan = list.filter((r) => r.koordinatDinormalkan).length
  const luasTotal = list.reduce((a, r) => a + r.luasTanah, 0)

  return {
    total,
    aktif,
    akanHabis,
    kadaluarsa,
    expired,
    belumBerizin,
    permanen,
    denganKoordinat,
    tanpaKoordinat: total - denganKoordinat,
    koordinatDinormalkan,
    luasTotal,
    persenKadaluarsa: total > 0 ? (kadaluarsa / total) * 100 : 0,
  }
}

/** Urutkan dengan kadaluarsa paling lama lebih dulu. */
export function urutPrioritas(list: ReklameItem[]): ReklameItem[] {
  return [...list].sort((a, b) => {
    const aSK = a.adaSK ? (a.sisaHari ?? 0) : -1
    const bSK = b.adaSK ? (b.sisaHari ?? 0) : -1
    return aSK - bSK
  })
}