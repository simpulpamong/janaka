/**
 * Tipe data reklame (dari API PTSP / normalizer).
 */

export interface ReklameItem {
  /** ID internal (digunakan sebagai kunci React). */
  id: string
  /** ID reklame dari PTSP. */
  idReklame?: string
  /** Nama pemilik / perusahaan. */
  namaPemilik: string
  /** Naskah reklame. */
  naskahReklame: string
  /** Alamat lengkap. */
  alamat: string
  /** Jenis reklame. */
  jenisReklame: string
  /** Dimensi (mis. "100 × 200 cm"). */
  dimensi: string
  /** Luas tanah (m²). */
  luasTanah: number
  /** Jumlah titik. */
  jumlah: number
  /** Nomor SK. */
  noSK: string
  /** Apakah punya SK. */
  adaSK: boolean
  /** Masa berlaku mulai. */
  berlakuMulai: string
  /** Masa berlaku sampai. */
  berlakuSampai: string
  /** Masa berlaku (bulan). */
  masaBerlakuBulan: number
  /** URL dokumen SK. */
  urlSK?: string
  /** Latitude. */
  lat?: number
  /** Longitude. */
  lng?: number
  /** Status SK (Aktif / Akan Habis / Kadaluarsa). */
  statusSK: StatusSK
  /** Detail status. */
  statusDetail: string
  /** Status dari API (belum_berizin, aktif, expired). */
  statusApi: "aktif" | "akan_habis" | "expired" | "belum_berizin"
  /** Koordinat sudah dinormalisasi. */
  koordinatDinormalkan: boolean
  /** Desa. */
  desa: string
  /** Kecamatan. */
  kecamatan: string
  /** Apakah punya koordinat. */
  hasCoordinate: boolean
  /** Apakah izin permanen. */
  isPermanen: boolean
  /** URL foto. */
  fotoUrl?: string
}

/** Status SK menurut normalizer. */
export type StatusSK = "Aktif" | "Akan Habis" | "Kadaluarsa" | "Belum Berizin"

/** Statistik reklame. */
export interface StatistikReklame {
  total: number
  aktif: number
  akanHabis: number
  kadaluarsa: number
  belumBerizin: number
  permanen: number
  denganKoordinat: number
  tanpaKoordinat: number
  luasTotal: number
  koordinatDinormalkan: number
  persenKadaluarsa: number
}

/** Item riwayat SK. */
export interface RiwayatSK {
  noSK: string
  namaPerusahaan: string
  berlakuMulai: string
  berlakuSampai: string
  masaBulan: number
  status: StatusSK
  adaFile: boolean
  urlSK?: string
  id?: string
}