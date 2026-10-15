/**
 * Kontrak JANAKA — Live App (tanpa backend).
 *
 * Login memakai Firebase Authentication. Role & izin disimpan di
 * dokumen `users/{uid}` dan dibaca ulang dari server setiap kali halaman
 * dimuat — nilai di localStorage TIDAK pernah dipercaya (prinsip yang
 * sama seperti prabawa: server adalah satu-satunya kebenaran).
 *
 * Hanya dua peran: `admin` dan `user`.
 */

export type UserRole = "admin" | "user"

/* ══════════════════════════════════════════════════════════════════
 *  Izin Akses Menu
 * ══════════════════════════════════════════════════════════════════ */

export interface AppPermissions {
  /* Halaman */
  menuDashboard: boolean
  menuMapping: boolean
  menuReklame: boolean
  menuLaporan: boolean
  menuRiwayat: boolean

  /* Aksi sensitif */
  aksiTambahTitik: boolean
  aksiHapusLaporan: boolean
  aksiCetakRekap: boolean
  aksiKelolaPengguna: boolean
  aksiUbahPassword: boolean
  aksiLihatDashboard: boolean
}

/** Izin khusus admin — tidak dapat diberikan ke user biasa. */
export const PERMISSION_KHUSUS_ADMIN: (keyof AppPermissions)[] = ["aksiKelolaPengguna"]

/** Izin yang wajib menyala untuk semua akun. */
export const IZIN_WAJIB: (keyof AppPermissions)[] = ["menuDashboard", "aksiUbahPassword"]

export const PERMISSION_LABELS: Record<keyof AppPermissions, string> = {
  menuDashboard: "Dashboard",
  menuMapping: "Pemetaan Reklame",
  menuReklame: "Data Reklame",
  menuLaporan: "Laporan Lapangan",
  menuRiwayat: "Riwayat Penindakan",
  aksiTambahTitik: "Tambah Titik Tidak Berizin",
  aksiHapusLaporan: "Hapus Laporan",
  aksiCetakRekap: "Cetak Rekapitulasi",
  aksiKelolaPengguna: "Kelola Pengguna",
  aksiUbahPassword: "Ubah Password",
  aksiLihatDashboard: "Lihat Statistik Dashboard",
}

export const PERMISSION_GROUPS: { label: string; keys: (keyof AppPermissions)[] }[] = [
  {
    label: "Halaman",
    keys: ["menuDashboard", "menuMapping", "menuReklame", "menuLaporan", "menuRiwayat"],
  },
  {
    label: "Aksi",
    keys: [
      "aksiTambahTitik",
      "aksiHapusLaporan",
      "aksiCetakRekap",
      "aksiLihatDashboard",
    ],
  },
]

export const DEFAULT_ADMIN_PERMISSIONS: AppPermissions = {
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

export const DEFAULT_USER_PERMISSIONS: AppPermissions = {
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

/**
 * ⚠️ Keamanan: belum login → TIDAK ADA hak akses sama sekali.
 * Semua nilai false, bukan default user.
 */
export const UNAUTHENTICATED_PERMISSIONS: AppPermissions = Object.fromEntries(
  Object.keys(DEFAULT_ADMIN_PERMISSIONS).map((k) => [k, false]),
) as unknown as AppPermissions

/** Normalisasi izin dari Firestore; kunci tak dikenal diabaikan. */
export function normalizePermissions(
  raw: Record<string, unknown> | null | undefined,
  role: UserRole = "user",
): AppPermissions {
  const base =
    role === "admin" ? { ...DEFAULT_ADMIN_PERMISSIONS } : { ...DEFAULT_USER_PERMISSIONS }

  if (raw && typeof raw === "object") {
    for (const key of Object.keys(base) as (keyof AppPermissions)[]) {
      if (key in raw) base[key] = Boolean((raw as Record<string, unknown>)[key])
    }
  }

  // Izin wajib tidak boleh dimatikan.
  for (const key of IZIN_WAJIB) base[key] = true
  // Izin khusus admin dikunci mati untuk role user.
  if (role !== "admin") {
    for (const key of PERMISSION_KHUSUS_ADMIN) base[key] = false
  }

  return base
}

/** Batasi izin sesuai peran (admin tetap penuh). */
export function batasiIzin(permissions: AppPermissions, role: UserRole): AppPermissions {
  if (role === "admin") return permissions
  const out = { ...permissions }
  for (const key of PERMISSION_KHUSUS_ADMIN) out[key] = false
  return out
}

/* ══════════════════════════════════════════════════════════════════
 *  Akun Pengguna
 * ══════════════════════════════════════════════════════════════════ */

export interface AppUser {
  id: string
  uid: string
  /** Pudu masuk — huruf kecil, tanpa spasi. Yang diketik pengguna. */
  username: string
  /**
   * Email semu hasil `keEmailAkun(username)` — mis. `budi@janaka.invalid`.
   *
   * Wajib ada karena Firebase Auth hanya mengenal email. Jangan pernah
   * ditampilkan ke pengguna; untuk tampilan pakai `username`.
   */
  email: string
  namaLengkap: string
  role: UserRole
  jabatan: string
  nip: string
  /** Catatan internal admin — tidak tampil di halaman beranda petugas. */
  catatan?: string
  permissions: AppPermissions
  isActive: boolean
  lastLoginAt?: string
  createdAt?: string
  updatedAt?: string
}

/* ══════════════════════════════════════════════════════════════════
 *  Validasi
 * ══════════════════════════════════════════════════════════════════ */

export function sanitize(value: unknown, maxLength = 100): string {
  return String(value ?? "")
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, maxLength)
}

/*
 * ⚠️ Validasi username & password TIDAK lagi di sini.
 *
 * Semuanya pindah ke `src/lib/akun.ts`, satu modul yang dipakai bersama
 * oleh klien dan server (`server/janakaAdminApi.ts`). Alasannya batas
 * password tidak bisa hanya dicatat di satu sisi: kalau klien mengizinkan 4
 * dan server menolak 6, pengguna akan melihat dua pesan berbeda untuk hal
 * yang sama.
 */

/* ══════════════════════════════════════════════════════════════════
 *  Metadata Sistem
 * ══════════════════════════════════════════════════════════════════ */

export const APP_NAME = "JANAKA"
export const APP_FULL_NAME = "Jaringan Navigasi Penegakan Perda"
export const APP_INSTANSI = "Satpol PP Kabupaten Ponorogo"

export const ROLE_LABEL: Record<UserRole, string> = {
  admin: "Administrator",
  user: "Petugas",
}

/**
 * Jenis reklame.
 *
 * Diambil dari distribusi data PTSP sungguhan, bukan tebakan:
 *
 *   Papan Nama Tiang      152 (40.0%)
 *   Baliho                 68 (17.9%)
 *   Vertikal Banner        62 (16.3%)
 *   Papan Nama Bangunan    48 (12.6%)
 *   Spanduk                17 ( 4.5%)
 *   Lainnya                33 ( 8.7%)
 *
 * Urutannya mengikuti frekuensi, jadi yang paling sering dipakai ada di atas.
 * Pilihan "Lainnya" selalu tersedia sebagai penampung jenis yang tidak
 * terdaftar.
 */
/**
 * Opsi dropdown jenis reklame.
 *
 * Sengaja **tanpa** jumlah/persentase di dalam daftar. Angka itu hanya
 * dipakai untuk menentukan urutan — bukan informasi yang dipakai petugas
 * saat mengisi formulir. Menampilkannya membuat daftar terasa seperti
 * laporan statistik, bukan sekadar pilihan.
 */
export const OPSI_JENIS_REKLAME: { value: string; label: string }[] = [
  { value: "Papan Nama Tiang", label: "Papan Nama Tiang" },
  { value: "Baliho", label: "Baliho" },
  { value: "Vertikal Banner", label: "Vertikal Banner" },
  { value: "Papan Nama Bangunan", label: "Papan Nama Bangunan" },
  { value: "Spanduk", label: "Spanduk" },
  { value: "Lainnya", label: "Lainnya" },
]
