/**
 * Normalisasi titik JANAKA (Firestore) menjadi `ReklameItem`.
 *
 * Dipakai agar data yang diinput petugas langsung dari lapangan muncul di
 * menu **Data Reklame** bersama data PTSP — bukan di halaman terpisah.
 * Perbedaannya hanya pada penanda `dariJANAKA`, yang menjadi dasar filter
 * kategori di halaman tersebut.
 */

import type { TitikJanaka } from "@/types"
import type { ReklameItem } from "@/utils/reklame"
import type { StatusSK } from "@/utils/format"

/** Titik JANAKA tidak punya SK — statusnya selalu di luar izin. */
const STATUS_TANPA_SK: StatusSK = "Kadaluarsa"

/**
 * Susun dimensi dari panjang × lebar (cm). Kalau keduanya kosong, kembalikan "-".
 */
function susunDimensi(panjang: number, lebar: number): { dimensi: string; luas: number } {
  if (!panjang || !lebar) return { dimensi: "-", luas: 0 }
  return {
    dimensi: `${panjang} × ${lebar} cm`,
    luas: Math.round(((panjang / 100) * (lebar / 100)) * 100) / 100,
  }
}

/** Ubah satu `TitikJanaka` menjadi `ReklameItem` yang bisa tampil di tabel. */
export function titikJanakaKeReklame(titik: TitikJanaka): ReklameItem {
  const { dimensi, luas } = susunDimensi(titik.panjang, titik.lebar)

  return {
    id: `janaka-${titik.id}`,
    idReklame: titik.id,
    namaPemilik: titik.nama || "Tanpa Nama",
    naskahReklame: titik.keterangan || "-",
    namaDariSK: false,
    alamat: titik.alamat || "-",
    kecamatan: "-",
    desa: "-",
    lat: titik.lat,
    lng: titik.lng,
    hasCoordinate: Number.isFinite(titik.lat) && Number.isFinite(titik.lng) && titik.lat !== 0,
    koordinatDinormalkan: false,
    dimensi,
    luasTanah: luas,
    jumlah: 1,
    jenisReklame: titik.jenisReklame || "-",
    isPermanen: false,
    isAktif: true,
    noSK: "-",
    urlSK: "",
    adaSK: false,
    statusApi: "belum_berizin",
    berlakuMulai: null,
    berlakuSampai: null,
    masaBerlakuBulan: 0,
    statusSK: STATUS_TANPA_SK,
    statusDetail: titik.keterangan || "Titik ditemukan saat patroli lapangan",
    sisaHari: null,
    dariJANAKA: true,
    raw: undefined as unknown as ReklameItem["raw"],
  }
}

/**
 * Ubah daftar `TitikJanaka` menjadi `ReklameItem[]` siap tabel.
 * Titik yang sudah ditindak tetap disertakan — statusnya dibaca dari laporan.
 */
export function titikJanakaKeReklameList(titik: TitikJanaka[]): ReklameItem[] {
  if (!Array.isArray(titik)) return []
  return titik.map(titikJanakaKeReklame)
}
