/**
 * JANAKA — Server API manajemen akun.
 *
 * Menggrokkan pola keamanan prabawa:
 *  • Setiap permintaan diverifikasi lewat **ID token Firebase** yang
 *    ditandatangani server (`auth.verifyIdToken`). Token palsu atau kedaluwarsa
 *    ditolak lebih dulu, sebelum apa pun dibaca.
 *  • Role & izin SELALU dibaca ulang dari Firestore di sisi server.
 *    Nilai yang dikirim browser tidak pernah dipakai untuk granting akses.
 *  • Operasi sensitif (buat / ubah / hapus akun, atur ulang password)
 *    hanya bisa dilakukan oleh akun dengan `role === "admin"`.
 *
 * Modul ini murni Node (tanpa dependensi web) sehingga bisa dipasang di:
 *  • Vite dev server  → `configureServer`
 *  • Vite preview     → `configurePreviewServer`
 *  • Server produksi  → `server/index.ts`
 */

import { readFileSync } from "node:fs"
import { randomUUID } from "node:crypto"
/*
 * Aturan username & password diambil dari modul yang sama dengan sisi
 * klien. Kalau server punya salinan sendiri, validate mismatch akan
 * terjadi: klien mengizinkan 4 karakter, server menolak 6, dan pengguna
 * melihat dua pesan berbeda untuk hal yang sama.
 */
import {
  dariEmailAkun,
  keEmailAkun,
  normalisasiUsername,
  validasiPassword,
  validasiUsername,
} from "../src/lib/akun.js"

import { initializeApp, getApps, cert, applicationDefault } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { getFirestore, FieldValue } from "firebase-admin/firestore"

import type { IncomingMessage, ServerResponse } from "node:http"
import type { Auth, UserRecord } from "firebase-admin/auth"
import type { Firestore } from "firebase-admin/firestore"
import type { ServiceAccount } from "firebase-admin/app"

/* ══════════════════════════════════════════════════════════════════
 *  Tipe lokal
 *
 *  Catatan kebijakan `any`:
 *  Sembilan blok `catch` di bawah membaca `err?.message` / `err?.code`
 *  secara langsung. Pola optional-chaining itu hanya bisa dikompilasi
 *  bila variabel catch bertipe `any` (TypeScript hanya menerima
 *  anotasi `any` atau `unknown` pada variabel catch, dan `unknown`
 *  membuat `err?.message` tidak bisa di-resolve). Anotasi `catch (err: any)`
 *  sepenuhnya dihapus saat emit — perilaku runtime tidak berubah sedikit pun.
 * ══════════════════════════════════════════════════════════════════ */

/** Peran akun. Sumber kebenarannya ada di Firestore, bukan nilai kiriman browser. */
type Role = "admin" | "user"

/** Peta izin (nama aksi → boleh/tidak). */
type Izin = Record<string, boolean>

/** Badan permintaan POST yang sudah di-parse. */
type Badan = Record<string, unknown>

/** Satu fitur GeoJSON pada `FeatureCollection`. */
type FiturGeoJson = { properties?: Record<string, unknown>; geometry?: unknown }

/** Bentuk `geojson` yang diperiksa sebelum disimpan. */
type GeoJson = { type?: unknown; features?: unknown }

/** Dokumen profil akun seperti yang dibaca/ditulis modul ini. */
type Akun = {
  [key: string]: unknown
  uid: string
  id: string
  role: Role
  permissions: Izin
}

/** Hasil verifikasi ID token + pembacaan ulang profil dari Firestore. */
type HasilPemanggil =
  | { ok: false; kode: number; pesan: string }
  | { ok: true; uid: string; db: Firestore; auth: Auth; akun: Akun | null }

/** Bentuk balasan setiap aksi. */
type HasilAksi = { kode: number; body: Record<string, unknown> }

/** Tanda tangan satu aksi di dalam `AKSI`. */
type AksiHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  body: Badan,
  p: HasilPemanggil,
) => Promise<HasilAksi>

/** Peta nama aksi → penanganinya. */
type PetaAksi = Record<string, AksiHandler>

/** Konteks Admin SDK yang sudah terinisialisasi. */
type SdkCtx = { auth: Auth; db: Firestore }

/** Status inisialisasi malas (lazy) Admin SDK. */
type SdkState =
  | { status: "belum" | "gagal"; alasan: string; ctx?: undefined }
  | { status: "siap"; alasan: string; ctx: SdkCtx }

/** IncomingMessage + `body` opsional (dipakai oleh parser bawaan beberapa framework). */
type RequestDenganBody = IncomingMessage & { body?: unknown }

/**
 * Tanda tangan middleware yang dipakai bersama oleh `server/index.ts`,
 * plugin Vite, dan `createJanakaAdminApi()`.
 */
export type ApiHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
) => void | Promise<void>

/* ══════════════════════════════════════════════════════════════════
 *  Konstanta
 * ══════════════════════════════════════════════════════════════════ */

const PREFIX = "/api/janaka"
const COLL_USERS = "users"
const COLL_GAMBAR = "gambar_peta"
const MAX_BODY = 256 * 1024

/** Batas jumlah akun yang dikembalikan dalam satu permintaan. */
const BATAS_AKUN = 500

/* ══════════════════════════════════════════════════════════════════
 *  Rate limit sederhana (fixed window per IP + lazy cleanup)
 * ═══════════════════════════════════════════════════════════════════
 *
 * Dilapisi di sini (bukan di middleware server) supaya:
 * - Hanya melindungi endpoint `/api/janaka/*` milik kita.
 * - Bisa dibedakan batasnya: aksi sensitif lebih ketat.
 * - Tidak mempengaruhi berkas statis / proxy dokumen.
 *
 * Karena serverless (Vercel) setiap instance punya memori sendiri dan
 * cold-start mereset, ini hanya pencegahan ringan (DoS lokal, brute-force
 * endpoint manajemen akun). Pelindung utama tetap Firebase Auth + WAF
 * provider hosting.
 */
const BATAS_API_PER_MENIT = 240
const BATAS_AKSI_SENSITIF_PER_MENIT = 30
const JENDELA_MS = 60_000

type CatatanRate = { mulai: number; hitung: number }
const catatanPanggilan = new Map<string, CatatanRate>()

function ipPemanggil(req: IncomingMessage): string {
  const xff = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim()
  return xff || req.socket.remoteAddress || "tidak-diketahui"
}

function kenaBatas(req: IncomingMessage, batas: number): boolean {
  const ip = ipPemanggil(req)
  const now = Date.now()
  const c = catatanPanggilan.get(ip)
  if (!c || now - c.mulai >= JENDELA_MS) {
    catatanPanggilan.set(ip, { mulai: now, hitung: 1 })
    return false
  }
  c.hitung += 1
  return c.hitung > batas
}

/** Bersihkan catatan kadaluwarsa agar Map tidak tumbuh tak terkendali. */
function bersihkanRateLimiter(sekarang = Date.now()): void {
  if (catatanPanggilan.size < 5000) return
  for (const [ip, c] of catatanPanggilan) {
    if (sekarang - c.mulai >= JENDELA_MS) catatanPanggilan.delete(ip)
  }
}

function isAksiSensitif(aksi: string): boolean {
  return (
    aksi === "akun:tambah" ||
    aksi === "akun:ubah" ||
    aksi === "akun:hapus" ||
    aksi === "akun:resetPassword" ||
    aksi === "password:ganti" ||
    aksi === "profil:ubahSendiri"
  )
}

/* ══════════════════════════════════════════════════════════════════
 *  Kontrak izin (HARUS sama dengan `src/lib/access.ts`)
 * ═══════════════════════════════════════════════════════════════════ */

const PERMISSION_KHUSUS_ADMIN = ["aksiKelolaPengguna"]
const IZIN_WAJIB = ["menuDashboard", "aksiUbahPassword"]

const DEFAULT_ADMIN_PERMISSIONS = {
  menuDashboard: true,
  menuMapping: true,
  menuReklame: true,
  menuLaporan: true,
  menuRiwayat: true,
  aksiTambahTitik: true,
  aksiHapusLaporan: true,
  aksiCetakRekap: true,
  aksiKelolaPengguna: true,
  aksiUbahPassword: true,
  aksiLihatDashboard: true,
}

const DEFAULT_USER_PERMISSIONS = {
  menuDashboard: true,
  menuMapping: true,
  menuReklame: true,
  menuLaporan: true,
  menuRiwayat: true,
  aksiTambahTitik: false,
  aksiHapusLaporan: false,
  aksiCetakRekap: true,
  aksiKelolaPengguna: false,
  aksiUbahPassword: true,
  aksiLihatDashboard: true,
}

function normalizePermissions(raw: unknown, role: Role): Izin {
  const base: Izin = { ...(role === "admin" ? DEFAULT_ADMIN_PERMISSIONS : DEFAULT_USER_PERMISSIONS) }
  if (raw && typeof raw === "object") {
    for (const key of Object.keys(base)) {
      if (key in (raw as Record<string, unknown>)) base[key] = Boolean((raw as Record<string, unknown>)[key])
    }
  }
  for (const key of IZIN_WAJIB) base[key] = true
  if (role !== "admin") for (const key of PERMISSION_KHUSUS_ADMIN) base[key] = false
  return base
}

function sanitize(value: unknown, maxLength = 120): string {
  return String(value ?? "")
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, maxLength)
}

/**
 * Ubah seluruh `Timestamp` Firestore menjadi string ISO.
 *
 * Tanpa ini, `lastLoginAt` sampai ke peramban sebagai `{seconds, nanoseconds}`
 * (hasil `Timestamp.toJSON()`), bukan objek yang punya `toDate()`. Klien
 * tidak bisa mem-parse-nya, dan kolom "Login Terakhir" selalu tampil "-".
 */
function serialisasi(value: unknown): unknown {
  if (value === null || value === undefined) return value

  if (typeof (value as { toDate?: unknown })?.toDate === "function") {
    const d = (value as { toDate: () => Date }).toDate()
    return Number.isNaN(d.getTime()) ? null : d.toISOString()
  }
  if (typeof value === "object" && "seconds" in value && "nanoseconds" in value) {
    const ms = Number(value.seconds) * 1000 + Math.floor(Number(value.nanoseconds) / 1e6)
    const d = new Date(ms)
    return Number.isNaN(d.getTime()) ? null : d.toISOString()
  }
  if (Array.isArray(value)) return value.map(serialisasi)
  if (value instanceof Date) return value.toISOString()
  if (typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = serialisasi(v)
    return out
  }
  return value
}

function ok(res: ServerResponse, data: Badan = {}, kode = 200): void {
  res.statusCode = kode
  res.setHeader("Content-Type", "application/json; charset=utf-8")
  res.setHeader("Cache-Control", "no-store")
  res.end(JSON.stringify({ ok: true, kode, ...data }))
}

function gagal(res: ServerResponse, kode: number, pesan: string): void {
  res.statusCode = kode
  res.setHeader("Content-Type", "application/json; charset=utf-8")
  res.setHeader("Cache-Control", "no-store")
  res.end(JSON.stringify({ ok: false, kode, pesan }))
}

/* ══════════════════════════════════════════════════════════════════
 *  Inisialisasi Admin SDK (malas — hanya saat endpoint benar-benar dipanggil)
 * ══════════════════════════════════════════════════════════════════ */

let sdkState: SdkState = { status: "belum", alasan: "" }

function bacaServiceAccount(): Record<string, unknown> {
  const inline = (process.env.FIREBASE_SERVICE_ACCOUNT || "").trim()
  if (inline) {
    try {
      return JSON.parse(inline)
    } catch {
      throw new Error("FIREBASE_SERVICE_ACCOUNT bukan JSON yang valid.")
    }
  }

  const path = (process.env.GOOGLE_APPLICATION_CREDENTIALS || "").trim()
  if (path) {
    try {
      return JSON.parse(readFileSync(path, "utf8"))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- `err?.message`; lihat catatan kebijakan `any` di atas.
    } catch (err: any) {
      throw new Error(
        `Gagal membaca GOOGLE_APPLICATION_CREDENTIALS (${path}): ${err?.message ?? err}`,
      )
    }
  }

  const projectId = (process.env.FIREBASE_PROJECT_ID || "").trim()
  if (projectId) {
    // Kredensial default dari Google Cloud (App Engine / Cloud Run / GCE).
    return { projectId }
  }

  throw new Error(
    "Kredensial Admin SDK belum diisi. Set FIREBASE_SERVICE_ACCOUNT (JSON) atau FIREBASE_PROJECT_ID + GOOGLE_APPLICATION_CREDENTIALS di berkas .env.",
  )
}

function admin(): SdkCtx {
  if (sdkState.status === "siap") return sdkState.ctx
  if (sdkState.status === "gagal") throw new Error(sdkState.alasan)

  try {
    const sa = bacaServiceAccount()
    const options = sa.private_key
      ? {
          credential: cert(sa as unknown as ServiceAccount),
          projectId: (sa.project_id || sa.projectId) as string | undefined,
        }
      : { credential: applicationDefault(), projectId: sa.projectId as string | undefined }
    const app = getApps()[0] ?? initializeApp(options)
    sdkState = { status: "siap", alasan: "", ctx: { auth: getAuth(app), db: getFirestore(app) } }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- `err?.message`; lihat catatan kebijakan `any` di atas.
  } catch (err: any) {
    sdkState = { status: "gagal", alasan: String(err?.message ?? err) }
    throw new Error(sdkState.alasan)
  }
  return sdkState.ctx
}

/** Status konfigurasi tanpa melempar error. */
export function statusServer(): { siap: boolean; alasan: string } {
  if (sdkState.status === "siap") return { siap: true, alasan: "" }
  try {
    admin()
    return { siap: true, alasan: "" }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- `err?.message`; lihat catatan kebijakan `any` di atas.
  } catch (err: any) {
    return { siap: false, alasan: String(err?.message ?? err) }
  }
}

/* ══════════════════════════════════════════════════════════════════
 *  Autentikasi & otorisasi
 * ══════════════════════════════════════════════════════════════════ */

async function pemanggil(req: IncomingMessage): Promise<HasilPemanggil> {
  const header = String(req.headers?.authorization || "")
  const token = header.replace(/^bearer\s+/i, "").trim()
  if (!token) return { ok: false, kode: 401, pesan: "Sesi tidak ditemukan. Login ulang." }

  const { auth, db } = admin()
  let uid: string
  try {
    uid = (await auth.verifyIdToken(token)).uid
  } catch {
    return { ok: false, kode: 401, pesan: "Sesi tidak valid atau sudah berakhir. Login ulang." }
  }

  const snap = await db.collection(COLL_USERS).doc(uid).get()
  if (!snap.exists) {
    // Akun dibuat di Firebase Auth tetapi belum punya profil.
    return { ok: true, uid, akun: null, db, auth }
  }

  const data = snap.data() ?? {}
  const role: Role = data.role === "admin" ? "admin" : "user"
  if (data.isActive === false) {
    return { ok: false, kode: 403, pesan: "Akun Anda dinonaktifkan. Hubungi administrator." }
  }

  return {
    ok: true,
    uid,
    db,
    auth,
    akun: {
      ...data,
      uid,
      id: snap.id,
      role,
      permissions: normalizePermissions(data.permissions, role),
    },
  }
}

function butuhAdmin(hasil: HasilPemanggil): HasilPemanggil {
  if (!hasil.ok) return hasil
  if (hasil.akun?.role !== "admin") {
    return { ok: false, kode: 403, pesan: "Akses khusus administrator." }
  }
  return hasil
}

/* ══════════════════════════════════════════════════════════════════
 *  Aksi
 * ══════════════════════════════════════════════════════════════════ */

const AKSI: PetaAksi = {
  /* ── Diagnostik (tanpa login) ── */
  async "server:status"(__req, __res) {
    const s = statusServer()
    return { kode: s.siap ? 200 : 503, body: { ok: s.siap, ...s } }
  },

  /* ── Profil pemanggil (sumber kebenaran role & izin) ── */
  async "sesi:profil"(__req, __res, _body, p) {
    if (!p.ok) return { kode: p.kode, body: { ok: false, pesan: p.pesan } }
    return {
      kode: 200,
      body: {
        ok: true,
        uid: p.uid,
        akun: serialisasi(p.akun),
        perluProfil: !p.akun,
      },
    }
  },

  /* ── Buat profil bagi akun yang belum punya dokumen ── */
  async "sesi:buat-profil"(__req, __res, body, p) {
    if (!p.ok) return { kode: p.kode, body: { ok: false, pesan: p.pesan } }
    if (p.akun) return { kode: 200, body: { ok: true, akun: serialisasi(p.akun) } }

    /*
     * Username diambil dari Firebase Auth, BUKAN dari `body`.
     *
     * Klien boleh mengirim apa saja, dan kalau `body.username` dipakai, ia
     * bisa meminta akun miliknya sendiri tersimpan dengan username orang
     * lain. Sumber kebenaran hanya catatan Auth, yang ditandatangani
     * server dan tidak bisa dipalsukan dari browser.
     */
    let email = ""
    try {
      email = (await p.auth.getUser(p.uid)).email ?? ""
    } catch {
      email = ""
    }
    const username = dariEmailAkun(email) || p.uid

    const now = new Date().toISOString()
    const akun = {
      uid: p.uid,
      username,
      email,
      namaLengkap: sanitize(body?.namaLengkap, 120) || p.uid,
      // ⚠️ Akun baru SELALU `user`. Eskalasi ke admin harus lewat
      // `npm run seed:admin` atau oleh admin yang sudah ada.
      role: "user",
      jabatan: "",
      nip: "",
      permissions: { ...DEFAULT_USER_PERMISSIONS },
      isActive: true,
      createdAt: now,
      updatedAt: now,
    }
    await p.db.collection(COLL_USERS).doc(p.uid).set(akun)
    return { kode: 200, body: { ok: true, akun: serialisasi(akun) } }
  },

  /* ── Ubah profil sendiri (admin maupun user) ── */
  async "sesi:ubah-profil"(__req, __res, body, p) {
    if (!p.ok) return { kode: p.kode, body: { ok: false, pesan: p.pesan } }

    const namaLengkap = sanitize(body?.namaLengkap, 120)
    const jabatan = sanitize(body?.jabatan, 120)
    const nip = sanitize(body?.nip, 20)

    if (namaLengkap && namaLengkap.length < 2) {
      return { kode: 400, body: { ok: false, pesan: "Nama lengkap minimal 2 karakter." } }
    }
    if (nip && !/^\d{1,20}$/.test(nip)) {
      return { kode: 400, body: { ok: false, pesan: "NIP hanya boleh angka (maksimal 20 digit)." } }
    }

    const patch: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    }
    if (namaLengkap) patch.namaLengkap = namaLengkap
    if (jabatan !== undefined) patch.jabatan = jabatan
    if (nip !== undefined) patch.nip = nip

    await p.db.collection(COLL_USERS).doc(p.uid).set(patch, { merge: true })

    if (namaLengkap) {
      try {
        await p.auth.updateUser(p.uid, { displayName: namaLengkap })
      } catch {
        /* Abaikan bila gagal update displayName di Auth */
      }
    }

    const snap = await p.db.collection(COLL_USERS).doc(p.uid).get()
    const data = snap.data() || {}
    return {
      kode: 200,
      body: {
        ok: true,
        pesan: "Profil berhasil diperbarui.",
        akun: serialisasi({ ...data, uid: p.uid }),
      },
    }
  },

  /* ── Daftar akun (admin) ── */
  async "akun:daftar"(__req, __res, _body, p) {
    const a = butuhAdmin(p)
    if (!a.ok) return { kode: a.kode, body: { ok: false, pesan: a.pesan } }

    const snap = await a.db.collection(COLL_USERS).limit(BATAS_AKUN).get()
    const daftar = snap.docs
      .map((d): Akun => {
        const data = d.data() ?? {}
        const role: Role = data.role === "admin" ? "admin" : "user"
        return {
          ...data,
          id: d.id,
          uid: d.id,
          role,
          permissions: normalizePermissions(data.permissions, role),
        }
      })
      .sort((x, y) =>
        String(x.namaLengkap || x.username || "").localeCompare(
          String(y.namaLengkap || y.username || ""),
          "id",
        ),
      )
    return { kode: 200, body: { ok: true, daftar: daftar.map(serialisasi) } }
  },

  /* ── Buat akun baru (admin) ── */
  async "akun:buat"(__req, __res, body, p) {
    const a = butuhAdmin(p)
    if (!a.ok) return { kode: a.kode, body: { ok: false, pesan: a.pesan } }

    const username = String(body?.username ?? "")
    const email = keEmailAkun(username)
    const password = String(body?.password ?? "")
    const namaLengkap = sanitize(body?.namaLengkap, 120)
    const jabatan = sanitize(body?.jabatan, 120)
    const nip = sanitize(body?.nip, 20)
    const catatan = sanitize(body?.catatan, 300)
    const role: Role = body?.role === "admin" ? "admin" : "user"

    const errUsername = validasiUsername(username)
    if (errUsername) return { kode: 400, body: { ok: false, pesan: errUsername } }
    const errPassword = validasiPassword(password)
    if (errPassword) return { kode: 400, body: { ok: false, pesan: errPassword } }
    if (namaLengkap.length < 2) {
      return { kode: 400, body: { ok: false, pesan: "Nama lengkap minimal 2 karakter." } }
    }
    if (nip && !/^\d{1,20}$/.test(nip)) {
      return { kode: 400, body: { ok: false, pesan: "NIP hanya boleh angka." } }
    }

    let record: UserRecord
    try {
      record = await a.auth.createUser({
        email,
        password,
        displayName: namaLengkap,
        emailVerified: false,
        disabled: false,
      })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- `err?.code` / `err?.message`; lihat catatan kebijakan `any` di atas.
    } catch (err: any) {
      const code = String(err?.code ?? "")
      if (code.includes("email-already-exists")) {
        return { kode: 409, body: { ok: false, pesan: "Username tersebut sudah digunakan." } }
      }
      if (code.includes("weak-password") || code.includes("invalid-password")) {
        return { kode: 400, body: { ok: false, pesan: "Password ditolak oleh Firebase." } }
      }
      return { kode: 400, body: { ok: false, pesan: sanitize(err?.message, 200) || "Gagal membuat akun." } }
    }

    const now = new Date().toISOString()
    const izin = normalizePermissions(body?.permissions, role)
    const akun = {
      uid: record.uid,
      username,
      email,
      namaLengkap,
      role,
      jabatan,
      nip,
      catatan,
      permissions: izin,
      isActive: body?.isActive !== false,
      createdAt: now,
      updatedAt: now,
    }

    try {
      await a.db.collection(COLL_USERS).doc(record.uid).set(akun)
    } catch (err) {
      // Jangan sampai ada akun yatim di Firebase Auth tanpa profil.
      await a.auth.deleteUser(record.uid).catch(() => {})
      throw err
    }
    return { kode: 200, body: { ok: true, akun, pesan: `Akun ${username} berhasil dibuat.` } }
  },

  /* ── Ubah akun (admin) ── */
  async "akun:ubah"(__req, __res, body, p) {
    const a = butuhAdmin(p)
    if (!a.ok) return { kode: a.kode, body: { ok: false, pesan: a.pesan } }

    const uid = sanitize(body?.uid, 128)
    if (!uid) return { kode: 400, body: { ok: false, pesan: "UID akun tidak valid." } }

    const ref = a.db.collection(COLL_USERS).doc(uid)
    const snap = await ref.get()
    if (!snap.exists) {
      return { kode: 404, body: { ok: false, pesan: "Akun tidak ditemukan." } }
    }

    const lama = snap.data() ?? {}
    const role: Role = body?.role === "admin" ? "admin" : "user"

    // ── Penjaga integrator ──
    if (uid === a.uid && role !== "admin") {
      return { kode: 400, body: { ok: false, pesan: "Anda tidak dapat menurunkan peran akun Anda sendiri." } }
    }
    if (lama.role === "admin" && role !== "admin") {
      const adminLain = await hitungAdmin(a.db, uid)
      if (adminLain === 0) {
        return {
          kode: 400,
          body: { ok: false, pesan: "Minimal harus ada satu administrator aktif." },
        }
      }
    }
    if (uid === a.uid && body?.isActive === false) {
      return { kode: 400, body: { ok: false, pesan: "Anda tidak dapat menonaktifkan akun Anda sendiri." } }
    }

    const patch: Record<string, unknown> = {
      namaLengkap: sanitize(body?.namaLengkap, 120),
      jabatan: sanitize(body?.jabatan, 120),
      nip: sanitize(body?.nip, 20),
      catatan: sanitize(body?.catatan, 300),
      role,
      permissions: normalizePermissions(body?.permissions, role),
      isActive: body?.isActive !== false,
      updatedAt: new Date().toISOString(),
    }

    // ── Username ──
    // Mengubah username berarti mengganti email semunya di Firebase Auth.
    const usernameBaru = String(body?.username ?? "")
    const emailBaru = usernameBaru ? keEmailAkun(usernameBaru) : ""
    if (emailBaru && emailBaru !== lama.email) {
      const errUsername = validasiUsername(usernameBaru)
      if (errUsername) return { kode: 400, body: { ok: false, pesan: errUsername } }
      try {
        await a.auth.updateUser(uid, { email: emailBaru, emailVerified: false })
        patch.email = emailBaru
        patch.username = normalisasiUsername(usernameBaru)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- `err?.code` / `err?.message`; lihat catatan kebijakan `any` di atas.
      } catch (err: any) {
        const code = String(err?.code ?? "")
        if (code.includes("email-already-exists")) {
          return { kode: 409, body: { ok: false, pesan: "Username tersebut sudah digunakan akun lain." } }
        }
        return { kode: 400, body: { ok: false, pesan: sanitize(err?.message, 200) } }
      }
    }

    // ── Atur ulang password ──
    const passwordBaru = String(body?.password ?? "")
    if (passwordBaru) {
      const errPassword = validasiPassword(passwordBaru)
      if (errPassword) return { kode: 400, body: { ok: false, pesan: errPassword } }
      try {
        await a.auth.updateUser(uid, { password: passwordBaru })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- `err?.message`; lihat catatan kebijakan `any` di atas.
      } catch (err: any) {
        return { kode: 400, body: { ok: false, pesan: sanitize(err?.message, 200) } }
      }
    }

    await ref.set(patch, { merge: true })

    // Menonaktifkan akun harus juga mencabut sesi aktifnya.
    const nonaktif = patch.isActive === false
    try {
      await a.auth.updateUser(uid, { disabled: nonaktif })
    } catch {
      /* status di Firestore tetap menjadi acuan */
    }
    if (nonaktif) {
      await a.auth.revokeRefreshTokens(uid).catch(() => {})
    }
    return { kode: 200, body: { ok: true, pesan: `Akun ${lama.username} berhasil diperbarui.` } }
  },

  /* ── Hapus akun (admin) ── */
  async "akun:hapus"(__req, __res, body, p) {
    const a = butuhAdmin(p)
    if (!a.ok) return { kode: a.kode, body: { ok: false, pesan: a.pesan } }

    const uid = sanitize(body?.uid, 128)
    if (!uid) return { kode: 400, body: { ok: false, pesan: "UID akun tidak valid." } }
    if (uid === a.uid) {
      return { kode: 400, body: { ok: false, pesan: "Anda tidak dapat menghapus akun Anda sendiri." } }
    }

    const ref = a.db.collection(COLL_USERS).doc(uid)
    const snap = await ref.get()
    if (!snap.exists) return { kode: 404, body: { ok: false, pesan: "Akun tidak ditemukan." } }

    const lama = snap.data() ?? {}
    if (lama.role === "admin" && (await hitungAdmin(a.db, uid)) === 0) {
      return { kode: 400, body: { ok: false, pesan: "Minimal harus ada satu administrator aktif." } }
    }

    await ref.delete().catch(() => {})
    await a.auth.deleteUser(uid).catch(() => {})
    return { kode: 200, body: { ok: true, pesan: `Akun ${lama.username} telah dihapus.` } }
  },

  /* ── Ganti password sendiri ── */
  async "password:ganti"(__req, __res, body, p) {
    if (!p.ok) return { kode: p.kode, body: { ok: false, pesan: p.pesan } }

    const lama = String(body?.passwordLama ?? "")
    const baru = String(body?.passwordBaru ?? "")
    if (!lama) return { kode: 400, body: { ok: false, pesan: "Password saat ini wajib diisi." } }
    const errBaru = validasiPassword(baru)
    if (errBaru) return { kode: 400, body: { ok: false, pesan: errBaru } }
    if (lama === baru) {
      return { kode: 400, body: { ok: false, pesan: "Password baru harus berbeda dari password lama." } }
    }

    try {
      await p.auth.updateUser(p.uid, { password: baru })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- `err?.code` / `err?.message`; lihat catatan kebijakan `any` di atas.
    } catch (err: any) {
      const code = String(err?.code ?? "")
      if (code.includes("recent-login")) {
        return { kode: 401, body: { ok: false, pesan: "Sesi terlalu lama. Keluar lalu masuk kembali." } }
      }
      if (code.includes("weak-password")) {
        return { kode: 400, body: { ok: false, pesan: "Password baru terlalu lemah." } }
      }
      return { kode: 400, body: { ok: false, pesan: sanitize(err?.message, 200) } }
    }

    await p.db
      .collection(COLL_USERS)
      .doc(p.uid)
      .set({ updatedAt: new Date().toISOString(), passwordDiubahPada: new Date().toISOString() }, { merge: true })
    return { kode: 200, body: { ok: true, pesan: "Password berhasil diubah." } }
  },


  /* ── Simpan gambar peta (admin) ── */
  async "gambar:simpan"(__req, __res, body, p) {
    const a = butuhAdmin(p)
    if (!a.ok) return { kode: a.kode, body: { ok: false, pesan: a.pesan } }

    const geojson = body?.geojson as GeoJson | undefined
    if (!geojson || geojson.type !== "FeatureCollection" || !Array.isArray(geojson.features)) {
      return { kode: 400, body: { ok: false, pesan: "Format GeoJSON tidak valid." } }
    }

    const batch = a.db.batch()
    const now = new Date().toISOString()
    for (const f of geojson.features as FiturGeoJson[]) {
      const props: Record<string, unknown> = f.properties || {}
      const id: string = (props.id || randomUUID()) as string
      const doc = {
        id,
        nama: String(props.nama || "Tanpa Nama"),
        keterangan: String(props.keterangan || ""),
        warna: String(props.warna || "#7c3aed"),
        tipe: String(props.tipe || "polygon"),
        ukuran: String(props.ukuran || ""),
        geometry: f.geometry,
        // `p` pasti bentuk sukses di titik ini: `butuhAdmin(p)` sudah guarding.
        dibuatOleh: (p as { uid: string }).uid,
        dibuatPada: now,
        diperbaruiPada: now,
      }
      batch.set(a.db.collection(COLL_GAMBAR).doc(id), doc)
    }
    await batch.commit()
    return { kode: 200, body: { ok: true, pesan: `${geojson.features.length} gambar disimpan.` } }
  },

  /* ── Hapus semua gambar peta (admin) ── */
  async "gambar:hapus"(__req, __res, _body, p) {
    const a = butuhAdmin(p)
    if (!a.ok) return { kode: a.kode, body: { ok: false, pesan: a.pesan } }

    const snap = await a.db.collection(COLL_GAMBAR).limit(500).get()
    if (snap.empty) return { kode: 200, body: { ok: true, pesan: "Tidak ada gambar untuk dihapus." } }

    const batch = a.db.batch()
    snap.docs.forEach((d) => batch.delete(d.ref))
    await batch.commit()
    return { kode: 200, body: { ok: true, pesan: `${snap.size} gambar dihapus.` } }
  },

  /* ── Daftar gambar peta (admin/user) ── */
  async "gambar:daftar"(__req, __res, _body, p) {
    const a = butuhAdmin(p)
    if (!a.ok) return { kode: a.kode, body: { ok: false, pesan: a.pesan } }

    const snap = await a.db.collection(COLL_GAMBAR).orderBy("dibuatPada", "desc").limit(200).get()
    const daftar = snap.docs.map((d) => ({ ...d.data(), id: d.id }))
    return { kode: 200, body: { ok: true, daftar: daftar.map(serialisasi) } }
  },

  /* ── Catat waktu login (dipanggil klien setelah login berhasil) ── */
  async "sesi:login"(__req, __res, _body, p) {
    if (!p.ok) return { kode: p.kode, body: { ok: false, pesan: p.pesan } }
    await p.db
      .collection(COLL_USERS)
      .doc(p.uid)
      .set({ lastLoginAt: FieldValue.serverTimestamp() }, { merge: true })
    return { kode: 200, body: { ok: true } }
  },

  /* ── Format Dokumen (BA & Rekap) ── */
  async "format-dokumen:ambil"(__req, __res, _body, p) {
    if (!p.ok) return { kode: p.kode, body: { ok: false, pesan: p.pesan } }
    if (p.akun?.role !== "admin") {
      return { kode: 403, body: { ok: false, pesan: "Hanya administrator yang boleh mengakses format dokumen." } }
    }
    const snap = await p.db.collection("settings").doc("documentFormat").get()
    if (!snap.exists) {
      return { kode: 200, body: { ok: true, data: null } }
    }
    return { kode: 200, body: { ok: true, data: snap.data() } }
  },

  async "format-dokumen:simpan"(__req, __res, body, p) {
    if (!p.ok) return { kode: p.kode, body: { ok: false, pesan: p.pesan } }
    if (p.akun?.role !== "admin") {
      return { kode: 403, body: { ok: false, pesan: "Hanya administrator yang boleh mengubah format dokumen." } }
    }
    const now = new Date()
    const data = {
      ...body,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: p.uid,
    }
    await p.db.collection("settings").doc("documentFormat").set(data, { merge: true })
    return { kode: 200, body: { ok: true, pesan: "Format dokumen berhasil disimpan." } }
  },
}

/** Hitung administrator aktif selain `kecualiUid`. */
async function hitungAdmin(db: Firestore, kecualiUid: string): Promise<number> {
  const snap = await db.collection(COLL_USERS).where("role", "==", "admin").limit(50).get()
  return snap.docs.filter(
    (d) => d.id !== kecualiUid && (d.data()?.isActive ?? true) !== false,
  ).length
}

/* ══════════════════════════════════════════════════════════════════
 *  Middleware
 * ══════════════════════════════════════════════════════════════════ */

function bacaBody(req: RequestDenganBody): Promise<Badan> {
  return new Promise<Badan>((resolve) => {
    if (req.body && typeof req.body === "object") return resolve(req.body as Badan)
    const chunks: Buffer[] = []
    let total = 0
    req.on("data", (c) => {
      total += c.length
      if (total > MAX_BODY) {
        req.destroy()
        return resolve({})
      }
      chunks.push(c)
    })
    req.on("end", () => {
      const mentah = Buffer.concat(chunks).toString("utf8")
      if (!mentah) return resolve({})
      try {
        const parsed = JSON.parse(mentah)
        resolve(parsed && typeof parsed === "object" ? parsed : {})
      } catch {
        resolve({})
      }
    })
    req.on("error", () => resolve({}))
  })
}

/**
 * Host sah yang boleh dilayani lewat proksi dokumen.
 *
 * ⚠️ Daftar ini yang mencegah endpoint ini jadi **open proxy**: tanpa
 * allow-list, siapa pun bisa menulis `/api/janaka/dokumen?u=https://internal/
 * ...` dan memakai server kita untuk menjangkau jaringan yang tidak boleh
 * dijangkau dari internet (SSRF).
 *
 * Dibaca saat fungsi dipanggil, bukan sekali di tingkat modul: pada
 * serverless (Vercel) modul bisa di-fiber ulang dengan `process.env` yang
 * sudah terisi, dan allow-list versi lama akan menutup dokumen yang
 * sebenarnya sah.
 */
function hostDokumenSah(): Set<string> {
  const kandidat = [
    "https://sprinter.ponorogo.go.id",
    ...(process.env.VITE_PTSP_BASE_URL || "").split(","),
  ]
  const origin = new Set<string>()
  for (const nilai of kandidat) {
    try {
      const url = new URL(nilai.trim())
      if (url.protocol === "https:") origin.add(url.origin)
    } catch {
      /* Nilai environment invalid tidak boleh memperluas allowlist. */
    }
  }
  return origin
}

/**
 * Proksi dokumen.
 *
 * ## Kenapa harus proksi, bukan `iframe` langsung ke PTSP
 * Di-src-kan langsung, `/v1/legal/signed_dokumen/...` milik PTSP mengarahkan
 * permintaan tanpa sesi ke halaman log-in mereka. Halaman itu mengirim
 * `X-Frame-Options`, dan Chrome menampilkan "This page has been blocked by
 * Chrome" — dokumen tidak pernah terlihat.
 *
 * Lewat proksi:
 *  1. Header `X-API-Key` disisipkan di sisi server, jadi PTSP tidak
 *     mengarahkan ke log-in.
 *  2. Header yang melarang pembingkaian dibuang dari respons.
 *  3. Allow-list host menutup kemungkinan SSRF.
 *
 * Header pembingkaian **tidak diteruskan** — itulah inti dari perubahan ini:
 * tanpa itu, proksi ini hanya memindahkan masalah yang sama.
 */
async function alirDokumen(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const reqUrl = new URL(req.url || "/", "http://localhost")
  const mentah = reqUrl.searchParams.get("u") || ""

  let target: URL
  try {
    target = new URL(mentah)
  } catch {
    return gagal(res, 400, "Parameter `u` bukan URL yang valid.")
  }
  const originSah = hostDokumenSah()
  if (target.protocol === "http:" && originSah.has(`https://${target.host}`)) {
    target.protocol = "https:"
  }
  if (target.protocol !== "https:" || target.username || target.password || target.hash) {
    return gagal(res, 400, "Hanya alamat https yang dilayani.")
  }
  if (!originSah.has(target.origin)) {
    return gagal(res, 403, `Host tidak diizinkan: ${target.origin}`)
  }
  if (!/^\/v1\/legal\/signed_dokumen(?:\/|$)/.test(target.pathname)) {
    return gagal(res, 403, "Jalur bukan dokumen SK PTSP yang diizinkan.")
  }

  const apiKey = process.env.PTSP_API_KEY || process.env.VITE_PTSP_API_KEY || ""

  try {
    const batasWaktu = AbortSignal.timeout(15_000)
    let lokasi = target
    let upstream: Response | null = null

    for (let redirect = 0; redirect <= 3; redirect++) {
      const hulu = new Headers({ Accept: "application/pdf,application/octet-stream;q=0.9" })
      if (apiKey && lokasi.origin === target.origin) hulu.set("X-API-Key", apiKey)

      upstream = await fetch(lokasi, {
        headers: hulu,
        redirect: "manual",
        signal: batasWaktu,
      })

      if (![301, 302, 303, 307, 308].includes(upstream.status)) break
      const alamatRedirect = upstream.headers.get("location")
      if (!alamatRedirect || redirect === 3) {
        await upstream.body?.cancel()
        return gagal(res, 502, "Pengalihan dokumen PTSP tidak valid atau terlalu banyak.")
      }

      const berikutnya = new URL(alamatRedirect, lokasi)
      await upstream.body?.cancel()
      if (berikutnya.protocol !== "https:" || !originSah.has(berikutnya.origin)) {
        return gagal(res, 502, "Dokumen PTSP mengarah ke host yang tidak diizinkan.")
      }
      lokasi = berikutnya
    }

    if (!upstream?.ok || !upstream.body) {
      return gagal(
        res,
        upstream?.status === 404 ? 404 : 502,
        `PTSP menjawab ${upstream?.status ?? "tanpa respons"} untuk dokumen tersebut.`,
      )
    }

    const tipe = (upstream.headers.get("content-type") || "").split(";")[0]!.trim().toLowerCase()
    if (!new Set(["application/pdf", "application/octet-stream", "application/x-pdf"]).has(tipe)) {
      await upstream.body.cancel()
      return gagal(res, 502, "PTSP tidak mengirim berkas PDF untuk dokumen tersebut.")
    }

    const reader = upstream.body.getReader()
    const awal: Uint8Array[] = []
    let panjangAwal = 0
    while (panjangAwal < 1024) {
      const bagian = await reader.read()
      if (bagian.done) break
      awal.push(bagian.value)
      panjangAwal += bagian.value.byteLength
    }
    const kepalaPdf = Buffer.concat(awal.map((bagian) => Buffer.from(bagian)))
    if (!kepalaPdf.includes(Buffer.from("%PDF-"))) {
      await reader.cancel()
      return gagal(res, 502, "Respons PTSP bukan dokumen PDF yang valid.")
    }

    res.statusCode = 200
    res.setHeader("Content-Type", "application/pdf")
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${(target.pathname.split("/").pop() || "dokumen").replace(/[^\w.\-]/g, "_")}"`,
    )
    // Header ini yang membuat Chrome menolak pembingkaian — buang.
    res.setHeader("X-Frame-Options", "SAMEORIGIN")
    res.setHeader("Cache-Control", "private, max-age=300")
    res.setHeader("X-Content-Type-Options", "nosniff")

    // Kirim prefiks yang sudah diperiksa, lalu stream sisanya tanpa buffering penuh.
    for (const bagian of awal) res.write(Buffer.from(bagian))
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) res.write(Buffer.from(value))
    }
    res.end()
  } catch (err) {
    console.error("[janaka-api] proksi dokumen gagal", err)
    return gagal(res, 502, "Tidak bisa menghubungi server PTSP.")
  }
}

export function createJanakaAdminApi(): ApiHandler {
  return async function janakaAdminApi(
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ): Promise<void> {
    const url = (req.url || "").split("?")[0]
    if (!url.startsWith(PREFIX)) return next?.()

    // Proksi dokumen: GET, tanpa JSON, jadi ditangani sebelum jalur POST.
    if (url === `${PREFIX}/dokumen`) {
      if (req.method !== "GET") return gagal(res, 405, "Method tidak diizinkan.")
      return alirDokumen(req, res)
    }

    if (req.method === "OPTIONS") {
      res.statusCode = 204
      res.setHeader("Allow", "POST, OPTIONS")
      res.end()
      return
    }

    if (req.method !== "POST") {
      return gagal(res, 405, "Method tidak diizinkan.")
    }

    const aksi = url.slice(PREFIX.length).replace(/^\/+/, "").replace(/:+$/, "")
    const handler = AKSI[aksi]
    if (!handler) return gagal(res, 404, `Aksi "${aksi || "(kosong)"}" tidak dikenal.`)

    // Rate limit — sebelum baca body supaya request berat tidak dihitung.
    bersihkanRateLimiter()
    const batas = isAksiSensitif(aksi) ? BATAS_AKSI_SENSITIF_PER_MENIT : BATAS_API_PER_MENIT
    if (kenaBatas(req, batas)) {
      res.setHeader("Retry-After", "60")
      return gagal(res, 429, "Terlalu banyak permintaan. Coba lagi sebentar lagi.")
    }

    let body: Badan
    try {
      body = await bacaBody(req)
    } catch {
      return gagal(res, 400, "Badan permintaan tidak valid.")
    }

    const perluAuth = aksi !== "server:status"
    let p: HasilPemanggil = { ok: false, kode: 401, pesan: "Sesi tidak ditemukan." }
    if (perluAuth) {
      try {
        p = await pemanggil(req)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- `err?.message`; lihat catatan kebijakan `any` di atas.
      } catch (err: any) {
        // Admin SDK belum siap → jelaskan apa yang perlu diisi.
        return gagal(res, 503, String(err?.message ?? err))
      }
    }

    try {
      const hasil = await handler(req, res, body, p)
      return ok(res, hasil.body ?? {}, hasil.kode ?? 200)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- `err?.message`; lihat catatan kebijakan `any` di atas.
    } catch (err: any) {
      const pesan = String(err?.message ?? err)
      if (/FIREBASE_SERVICE_ACCOUNT|GOOGLE_APPLICATION_CREDENTIALS|credential/i.test(pesan)) {
        return gagal(res, 503, pesan)
      }
      console.error("[janaka-api]", aksi, err)
      return gagal(res, 500, "Gagal memproses permintaan di server.")
    }
  }
}

/** Dipakai oleh `tools/legacy/seed-admin.mts`. */
export { admin, COLL_USERS, DEFAULT_ADMIN_PERMISSIONS, DEFAULT_USER_PERMISSIONS, normalizePermissions }