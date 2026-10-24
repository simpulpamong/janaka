import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit as fsLimit,
  onSnapshot,
  orderBy,
  query as fsQuery,
  updateDoc,
  type DocumentData,
  type QueryConstraint,
  type Unsubscribe,
} from "firebase/firestore"
import { db } from "@/lib/firebase/firestore"
import type {
  FotoBukti,
  LaporanPenindakan,
  TitikJanaka,
} from "@/types"
import { buildNomorBA } from "@/lib/nomorBA"

export { buildNomorBA } from "@/lib/nomorBA"

/* ══════════════════════════════════════════════════════════════════
 *  Cache lokal (localStorage)
 * ═══════════════════════════════════════════════════════════════════
 *
 *  Data Firestore datang lewat listener — dan listener butuh waktu:
 *  koneksi dibuka, aturan keamanan diperiksa, snapshot pertama diterima.
 *  Selama itu halaman kosong, dan kalau koneksi sedang lambat petugas
 *  melihat tabel kosong yang terasa seperti "data hilang".
 *
 *  Data PTSP sudah punya cache lokal (`useReklamaStore`). Titik temuan
 *  dan laporan penindakan belum — karena itu keduanya terasa lebih lambat
 *  dari data PTSP padahal sebenarnya sama-sama dari basis data.
 *
 *  Dengan cache, halaman langsung menampilkan data terakhir yang diketahui
 *  begitu aplikasi dibuka, lalu diperbarui sendiri saat snapshot datang.
 * ══════════════════════════════════════════════════════════════════ */

const KUNCI_CACHE_LAPORAN = "janaka-cache-laporan"
const KUNCI_CACHE_TITIK = "janaka-cache-titik"

/** Batas umur cache. Snapshot Firestore datang cepat, jadi batasnya pendek. */
const UMRI_CACHE_MS = 60 * 60 * 1000

interface AmplopCache<T> {
  savedAt: number
  items: T[]
}

function bacaCache<T>(kunci: string): T[] | null {
  if (typeof window === "undefined") return null
  try {
    const mentah = localStorage.getItem(kunci)
    if (!mentah) return null
    const data = JSON.parse(mentah) as AmplopCache<T>
    if (!data || !Array.isArray(data.items)) return null
    /* Cache kedaluwarsa dibuang, bukan ditampilkan. Data setahun lalu
       lebih menyesatkan daripada data kosong. */
    if (Date.now() - data.savedAt > UMRI_CACHE_MS) {
      localStorage.removeItem(kunci)
      return null
    }
    return data.items
  } catch {
    return null
  }
}

function tulisCache<T>(kunci: string, items: T[]): void {
  if (typeof window === "undefined") return
  try {
    const amplop: AmplopCache<T> = { savedAt: Date.now(), items }
    localStorage.setItem(kunci, JSON.stringify(amplop))
  } catch {
    /* kuota penuh — abaikan, listener tetap jadi sumber kebenaran */
  }
}

/** Cache laporan penindakan. */
export function bacaCacheLaporan(): LaporanPenindakan[] | null {
  return bacaCache<LaporanPenindakan>(KUNCI_CACHE_LAPORAN)
}

/** Cache titik temuan lapangan. */
export function bacaCacheTitik(): TitikJanaka[] | null {
  return bacaCache<TitikJanaka>(KUNCI_CACHE_TITIK)
}

/* ══════════════════════════════════════════════════════════════════
 *  Collections
 * ══════════════════════════════════════════════════════════════════ */

export const COL_LAPORAN = "laporan_penindakan"
export const COL_TITIK_JANAKA = "titik_janaka"

/** Tanggal Indonesia ringkas: 2026-10-12 */
function hariIni(): string {
  const d = new Date()
  const bln = String(d.getMonth() + 1).padStart(2, "0")
  const tgl = String(d.getDate()).padStart(2, "0")
  return `${d.getFullYear()}-${bln}-${tgl}`
}

function sekarang(): string {
  const d = new Date()
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes()
    .toString()
    .padStart(2, "0")}`
}

/* ══════════════════════════════════════════════════════════════════
 *  LAPORAN PENINDAKAN
 * ══════════════════════════════════════════════════════════════════ */

/** Susun objek laporan dari input form. */
export interface LaporanInput {
  nomorBA: string
  reklameId: string
  reklameNama: string
  reklameAlamat: string
  dariJANAKA: boolean
  lat: number
  lng: number
  tindakan: string
  catatanPetugas: string
  fotoBukti: FotoBukti[]
  petugas: string
  tanggal?: string
  waktu?: string
}

/** Simpan laporan penindakan baru. Mengembalikan ID dokumen. */
export async function createLaporan(input: LaporanInput): Promise<string> {
  const now = new Date().toISOString()
  const payload = {
    nomorBA: input.nomorBA || buildNomorBA(),
    reklameId: input.reklameId,
    reklameNama: input.reklameNama,
    reklameAlamat: input.reklameAlamat,
    dariJANAKA: input.dariJANAKA,
    lat: input.lat,
    lng: input.lng,
    tindakan: input.tindakan,
    catatanPetugas: input.catatanPetugas,
    fotoBukti: input.fotoBukti,
    petugas: input.petugas || "-",
    tanggal: input.tanggal ?? hariIni(),
    waktu: input.waktu ?? sekarang(),
    createdAt: now,
    updatedAt: now,
  }

  const ref = await addDoc(collection(db, COL_LAPORAN), payload)
  return ref.id
}

/** Hapus laporan berdasarkan ID. */
export async function deleteLaporan(id: string): Promise<void> {
  await deleteDoc(doc(db, COL_LAPORAN, id))
}

/**
 * Ubah laporan yang sudah tersimpan.
 *
 * Dipakai halaman Riwayat saat petugas perlu memperbaiki keterangan,
 * tanggal, atau mengganti foto bukti setelah laporan tersimpan. Hanya
 * field yang dikirim yang berubah — `updateDoc(..., { merge: true })`.
 *
 * `updatedAt` selalu diperbarui supaya urutan "terakhir diubah" benar.
 */
export async function updateLaporan(
  id: string,
  patch: Partial<LaporanInput>,
): Promise<void> {
  const data: Record<string, unknown> = { updatedAt: new Date().toISOString() }

  if (patch.reklameNama !== undefined) data.reklameNama = patch.reklameNama
  if (patch.reklameAlamat !== undefined) data.reklameAlamat = patch.reklameAlamat
  if (patch.dariJANAKA !== undefined) data.dariJANAKA = patch.dariJANAKA
  if (patch.lat !== undefined) data.lat = patch.lat
  if (patch.lng !== undefined) data.lng = patch.lng
  if (patch.tindakan !== undefined) data.tindakan = patch.tindakan
  if (patch.catatanPetugas !== undefined) data.catatanPetugas = patch.catatanPetugas
  if (patch.fotoBukti !== undefined) data.fotoBukti = patch.fotoBukti
  if (patch.petugas !== undefined) data.petugas = patch.petugas || "-"
  if (patch.tanggal !== undefined) data.tanggal = patch.tanggal
  if (patch.waktu !== undefined) data.waktu = patch.waktu

  await updateDoc(doc(db, COL_LAPORAN, id), data)
}

/**
 * Realtime listener untuk seluruh laporan.
 * Dipakai halaman Riwayat & Pemetaan agar data selalu mutakhir.
 */
export function subscribeLaporan(
  callback: (data: LaporanPenindakan[]) => void,
  onError?: (error: Error) => void,
  max = 500,
): Unsubscribe {
  const constraints: QueryConstraint[] = [orderBy("tanggal", "desc"), fsLimit(max)]
  const q = fsQuery(collection(db, COL_LAPORAN), ...constraints)
  return onSnapshot(
    q,
    (snap) => {
      const data = snap.docs.map(
        (d) => ({ ...(d.data() as DocumentData), id: d.id }) as LaporanPenindakan,
      )
      tulisCache(KUNCI_CACHE_LAPORAN, data)
      callback(data)
    },
    (err) => {
      // Rules belum di-deploy / user belum login — bukan error fatal.
      console.warn("[laporanService] subscribeLaporan:", err?.message ?? err)
      onError?.(err)
    },
  )
}

/** Kumpulkan ID reklame yang sudah pernah ditindak. */
export function collectExecutedIds(laporan: LaporanPenindakan[]): Set<string> {
  return new Set(laporan.map((l) => l.reklameId).filter(Boolean))
}

/** Jumlah laporan per reklame. */
export function countLaporanPerReklame(laporan: LaporanPenindakan[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const l of laporan) {
    if (!l.reklameId) continue
    map.set(l.reklameId, (map.get(l.reklameId) ?? 0) + 1)
  }
  return map
}

/* ══════════════════════════════════════════════════════════════════
 *  TITIK JANAKA (reklame tanpa izin, input lapangan)
 * ══════════════════════════════════════════════════════════════════ */

export interface TitikJanakaInput {
  nama: string
  alamat: string
  lat: number
  lng: number
  keterangan: string
  jenisReklame: string
  panjang: number
  lebar: number
  petugas: string
}

/** Simpan titik reklame tanpa izin yang ditemukan saat patroli. */
export async function createTitikJanaka(
  input: TitikJanakaInput,
): Promise<string> {
  const now = new Date().toISOString()
  const ref = await addDoc(collection(db, COL_TITIK_JANAKA), {
    nama: input.nama.trim() || "Tanpa Nama",
    alamat: input.alamat.trim() || "-",
    lat: input.lat,
    lng: input.lng,
    keterangan: input.keterangan.trim(),
    jenisReklame: input.jenisReklame || "Tidak Disebutkan",
    panjang: input.panjang || 0,
    lebar: input.lebar || 0,
    petugas: input.petugas.trim() || "-",
    sudahDieksekusi: false,
    laporanIds: [],
    createdAt: now,
    updatedAt: now,
  })
  return ref.id
}

/** Ubah informasi temuan lapangan tanpa mengubah riwayat penindakannya. */
export async function updateTitikJanaka(
  id: string,
  input: TitikJanakaInput,
): Promise<void> {
  await updateDoc(doc(db, COL_TITIK_JANAKA, id), {
    nama: input.nama.trim() || "Tanpa Nama",
    alamat: input.alamat.trim() || "-",
    lat: input.lat,
    lng: input.lng,
    keterangan: input.keterangan.trim(),
    jenisReklame: input.jenisReklame.trim() || "Tidak Disebutkan",
    panjang: input.panjang || 0,
    lebar: input.lebar || 0,
    updatedAt: new Date().toISOString(),
  })
}

/** Realtime listener titik JANAKA. */
export function subscribeTitikJanaka(
  callback: (data: TitikJanaka[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const q = fsQuery(collection(db, COL_TITIK_JANAKA), orderBy("createdAt", "desc"))
  return onSnapshot(
    q,
    (snap) => {
      const data = snap.docs.map((d) => ({ ...(d.data() as DocumentData), id: d.id }) as TitikJanaka)
      tulisCache(KUNCI_CACHE_TITIK, data)
      callback(data)
    },
    (err) => {
      console.warn("[laporanService] subscribeTitikJanaka:", err?.message ?? err)
      onError?.(err)
    },
  )
}

/** Tandai titik JANAKA sudah ditindak dan tautkan ID laporan. */
export async function markTitikDieksekusi(
  titikId: string,
  laporanId: string,
): Promise<void> {
  const snap = await getDoc(doc(db, COL_TITIK_JANAKA, titikId))
  const data = snap.data() as TitikJanaka | undefined
  const existing = Array.isArray(data?.laporanIds) ? data!.laporanIds : []

  await updateDoc(doc(db, COL_TITIK_JANAKA, titikId), {
    sudahDieksekusi: true,
    laporanIds: [...existing, laporanId],
    updatedAt: new Date().toISOString(),
  })
}

/** Hapus titik JANAKA. */
export async function deleteTitikJanaka(id: string): Promise<void> {
  await deleteDoc(doc(db, COL_TITIK_JANAKA, id))
}

/* ══════════════════════════════════════════════════════════════════
 *  Utilitas
 * ══════════════════════════════════════════════════════════════════ */

/** Filter laporan berdasarkan kata kunci & rentang bulan. */
export function filterLaporan(
  laporan: LaporanPenindakan[],
  opsi: {
    search?: string
    bulan?: string // format "YYYY-MM"
    startDate?: string // format "YYYY-MM-DD"
    endDate?: string // format "YYYY-MM-DD"
    tindakan?: string
    sumber?: "SEMUA" | "PTSP" | "JANAKA"
  },
): LaporanPenindakan[] {
  const q = (opsi.search ?? "").trim().toLowerCase()

  return laporan.filter((l) => {
    const tgl = (l.tanggal || "").slice(0, 10)
    if (opsi.startDate && tgl && tgl < opsi.startDate) return false
    if (opsi.endDate && tgl && tgl > opsi.endDate) return false
    if (opsi.bulan && !l.tanggal?.startsWith(opsi.bulan)) return false
    if (opsi.tindakan && opsi.tindakan !== "SEMUA" && l.tindakan !== opsi.tindakan) return false
    if (opsi.sumber === "PTSP" && l.dariJANAKA) return false
    if (opsi.sumber === "JANAKA" && !l.dariJANAKA) return false
    if (!q) return true
    return (
      l.reklameNama?.toLowerCase().includes(q) ||
      l.reklameAlamat?.toLowerCase().includes(q) ||
      l.catatanPetugas?.toLowerCase().includes(q) ||
      l.nomorBA?.toLowerCase().includes(q) ||
      l.tindakan?.toLowerCase().includes(q)
    )
  })
}


