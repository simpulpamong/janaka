/**
 * Klien API manajemen akun JANAKA.
 *
 * Semua permintaan mengirim **ID token Firebase** yang sudah diverifikasi
 * server. Role dan izin TIDAK pernah dibaca dari kode browser — server yang
 * memutuskan. Kalau server belum dikonfigurasi (Admin SDK kosong), fungsi
 * mengembalikan status konfigurasi agar UI bisa menampilkan petunjuk.
 */

import axios from "axios"
import { auth } from "@/lib/firebase"
import type { AppPermissions, AppUser, UserRole } from "@/lib/access"

const BASE = "/api/janaka"
const CACHE_DAFTAR_PENGGUNA_MS = 30_000

let cacheDaftarPengguna: { uid: string; data: AppUser[]; disimpanPada: number } | null = null

function invalidasiCacheDaftarPengguna(): void {
  cacheDaftarPengguna = null
}

export interface ApiStatus {
  siap: boolean
  alasan: string
}

export interface ApiResult<T> {
  ok: boolean
  kode: number
  pesan?: string
  data?: T
}

const http = axios.create({ baseURL: BASE, timeout: 20_000 })

http.interceptors.request.use(async (config) => {
  const user = auth.currentUser
  if (user) {
    config.headers.Authorization = `Bearer ${await user.getIdToken()}`
  }
  config.headers["Content-Type"] = "application/json"
  return config
})

async function call<T>(
  aksi: string,
  payload: Record<string, unknown> = {},
): Promise<ApiResult<T>> {
  try {
    const { data } = await http.post(`/${aksi}`, payload)
    return { ok: Boolean(data?.ok), kode: Number(data?.kode ?? 200), data: data as T }
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const data = err.response?.data as
        | { ok?: boolean; kode?: number; pesan?: string }
        | undefined
      return {
        ok: false,
        kode: data?.kode ?? err.response?.status ?? 0,
        pesan: data?.pesan ?? networkMessage(err),
      }
    }
    return { ok: false, kode: 0, pesan: "Gagal menghubungi server JANAKA." }
  }
}

function networkMessage(err: unknown): string {
  const status = (err as { response?: { status?: number } })?.response?.status
  if (status === 401) return "Sesi tidak valid. Silakan keluar lalu masuk kembali."
  if (status === 403) return "Akses khusus administrator."
  /*
   * Pesan 503 sengaja TIDAK menyebut nama variabel environment server.
   *
   * Sebelumnya isinya "Isi FIREBASE_SERVICE_ACCOUNT di berkas .env…".
   * Pesan itu tampil untuk siapa pun yang memakai aplikasi — padahal
   * variabel itu hanya ada di sisi server dan tidak bisa diisi dari
   * peramban pengguna. Nama variabel internal tidak ada gunanya bagi
   * mereka, dan menyebutnya cuma memperbesar permukaan informasi.
   *
   * Siapa yang memang perlu tahu langkah teknisnya — admin — mendapatkannya
   * di halaman Manajemen Pengguna, yang memang memuat panduan lengkap.
   */
  if (status === 503)
    return "Server JANAKA sedang tidak dapat dihubungi. Coba lagi sebentar lagi."
  if (status === 0 || !status)
    return "Tidak dapat menghubungi server JANAKA. Pastikan `npm run dev` sedang berjalan."
  return "Terjadi kesalahan di server."
}

/* ══════════════════════════════════════════════════════════════════
 *  Status konfigurasi
 * ══════════════════════════════════════════════════════════════════ */

export async function ambilStatusServer(): Promise<ApiStatus> {
  try {
    // 503 di sini berarti "belum dikonfigurasi" — jawaban yang valid, bukan
    // kegagalan jaringan. Karena itu `validateStatus` meloloskan 503 agar
    // `alasan` dari server tetap terbaca (bukan diganti pesan generik).
    const { data } = await http.post(
      "/server:status",
      {},
      { timeout: 8000, validateStatus: () => true },
    )
    return { siap: Boolean(data?.siap), alasan: String(data?.alasan ?? "") }
  } catch {
    return {
      siap: false,
      alasan:
        "Server API JANAKA tidak dapat dihubungi. Jalankan aplikasi lewat `npm run dev` (atau `npm start` untuk produksi).",
    }
  }
}

/* ══════════════════════════════════════════════════════════════════
 *  Sesi
 * ══════════════════════════════════════════════════════════════════ */

export interface ProfilServer {
  uid: string
  akun: AppUser | null
  perluProfil: boolean
}

export async function ambilProfilServer(): Promise<ApiResult<ProfilServer>> {
  const res = await call<{
    uid: string
    akun: AppUser | null
    perluProfil: boolean
  }>("sesi:profil")
  return { ...res, data: res.data }
}

export async function buatProfilServer(input: {
  username: string
  namaLengkap: string
}): Promise<ApiResult<ProfilServer>> {
  const res = await call<ProfilServer>("sesi:buat-profil", input)
  if (res.ok) invalidasiCacheDaftarPengguna()
  return res
}

export async function ubahProfilSendiri(input: {
  namaLengkap: string
  jabatan?: string
  nip?: string
}): Promise<ApiResult<{ akun: AppUser }>> {
  const res = await call<{ akun: AppUser }>("sesi:ubah-profil", input)
  if (res.ok) invalidasiCacheDaftarPengguna()
  return res
}

export async function catatLogin(): Promise<void> {
  await call("sesi:login")
}

/* ══════════════════════════════════════════════════════════════════
 *  Manajemen pengguna (khusus admin)
 * ══════════════════════════════════════════════════════════════════ */

export async function daftarPengguna(): Promise<ApiResult<AppUser[]>> {
  const uid = auth.currentUser?.uid
  if (
    uid &&
    cacheDaftarPengguna?.uid === uid &&
    Date.now() - cacheDaftarPengguna.disimpanPada < CACHE_DAFTAR_PENGGUNA_MS
  ) {
    return { ok: true, kode: 200, data: cacheDaftarPengguna.data }
  }

  const res = await call<{ daftar: AppUser[] }>("akun:daftar")
  const data = res.data?.daftar ?? []
  if (res.ok && uid) {
    cacheDaftarPengguna = { uid, data, disimpanPada: Date.now() }
  }
  return { ...res, data }
}

export interface FormAkun {
  /** Pudu masuk — bukan email. Server yang menyusun email semunya. */
  username: string
  namaLengkap: string
  password?: string
  role: UserRole
  jabatan?: string
  nip?: string
  catatan?: string
  permissions?: AppPermissions
  isActive?: boolean
}

export async function buatPengguna(form: FormAkun): Promise<ApiResult<unknown>> {
  const res = await call("akun:buat", form as unknown as Record<string, unknown>)
  if (res.ok) invalidasiCacheDaftarPengguna()
  return res
}

export async function ubahPengguna(
  uid: string,
  form: FormAkun,
): Promise<ApiResult<unknown>> {
  const res = await call("akun:ubah", { ...form, uid } as unknown as Record<string, unknown>)
  if (res.ok) invalidasiCacheDaftarPengguna()
  return res
}

export async function hapusPengguna(uid: string): Promise<ApiResult<unknown>> {
  const res = await call("akun:hapus", { uid })
  if (res.ok) invalidasiCacheDaftarPengguna()
  return res
}

/* ══════════════════════════════════════════════════════════════════
 *  Password
 * ══════════════════════════════════════════════════════════════════ */

export async function gantiPasswordServer(
  passwordLama: string,
  passwordBaru: string,
): Promise<ApiResult<unknown>> {
  return call("password:ganti", { passwordLama, passwordBaru })
}