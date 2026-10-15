/**
 * Kunci login setelah percobaan gagal berulang — SATU sumber kebenaran.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  Kenapa ada modul ini?
 * ═══════════════════════════════════════════════════════════════════
 * Autentikasi JANAKA memakai Firebase Auth dari sisi klien, jadi tidak ada
 * endpoint login milik kita yang bisa memasang penghitung di server. Yang
 * tersisa untuk memperlambat percobaan menebak password adalah batas di
 * peramban, dan itulah yang diatur di sini:
 *
 *   salah 5 kali  →  tunggu 60 detik sebelum boleh mencoba lagi
 *
 * ⚠️ Batas ini adalah **pengaman UX, bukan tembok keamanan**. Penyerang
 * yang serius bisa menghapus `localStorage` atau memanggil REST API Firebase
 * langsung. Lapisan yang benar-benar menahan brute force ada di sisi lain:
 *
 *   1. Firebase Auth sendiri membatasi percobaan per alamat IP/akun.
 *   2. API manajemen akun (`server/janakaAdminApi.ts`) punya rate limit per IP.
 *   3. Pesan galat selalu generik — tidak ada cara menebak username terdaftar.
 *
 * Modul ini menutup celah yang tersisa: pengguna awam yang mengetik password
 * berkali-kali tidak akan pernah sampai ke batas Firebase, dan UI memberi
 * hitung mundur yang jelas alih-alih gagal berulang-ulang.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  Kenapa disimpan di `localStorage`, bukan state React saja
 * ═══════════════════════════════════════════════════════════════════
 * Waktu kunci disimpan sebagai **stempel waktu absolut** (`sampai`), bukan
 * sisa detik. Jadi memuat ulang halaman — atau menutup tab lalu membuka
 * lagi — tidak menghapus kunci: hitung mundur dilanjutkan dari stempel yang
 * sama. Kalau yang disimpan adalah sisa detik, refresh akan mengulang 60
 * detik dari awal, dan itu hukuman yang salah.
 */

/** Jumlah kegagalan sebelum dikunci. */
export const MAKS_PERCOBAAN = 5

/** Lama kunci setelah batas terlampaui (60 detik). */
export const DURASI_KUNCI_MS = 60_000

/**
 * Kode galat Firebase yang berarti "kredensial salah" — bukan masalah
 * jaringan, konfigurasi, atau akun nonaktif.
 *
 * Hanya kode inilah yang dihitung sebagai percobaan gagal. Kalau koneksi
 * terputus ikut dihitung, jaringan yang buruk bisa mengunci pengguna yang
 * passwordnya sebenarnya benar — persis kebalikan dari gunanya.
 */
export const KODE_KREDENSIAL_SALAH: ReadonlySet<string> = new Set([
  "auth/invalid-credential",
  "auth/wrong-password",
  "auth/user-not-found",
  "auth/invalid-email",
])

/** True bila error (objek Firebase) menandakan kredensial salah. */
export function adalahGagalKredensial(err: unknown): boolean {
  const kode =
    typeof err === "object" && err !== null && "code" in err
      ? String((err as { code: unknown }).code)
      : ""
  return KODE_KREDENSIAL_SALAH.has(kode)
}

/** Bentuk catatan yang disimpan. */
interface CatatanKunci {
  /** Jumlah kegagalan berurutan (di-reset saat berhasil atau saat dikunci). */
  gagal: number
  /** Epoch ms sampai kapan terkunci. 0 = tidak terkunci. */
  sampai: number
}

const KUNCI_PENYIMPANAN = "janaka:kunci-login"

/** Baca catatan dengan aman: nilai rusak/asing dianggap "belum pernah gagal". */
function baca(sekarang: number): CatatanKunci {
  try {
    const mentah = localStorage.getItem(KUNCI_PENYIMPANAN)
    if (!mentah) return { gagal: 0, sampai: 0 }
    const data = JSON.parse(mentah) as Partial<CatatanKunci>
    const gagal = Number.isFinite(data?.gagal) ? Math.max(0, Math.floor(Number(data.gagal))) : 0
    const sampai = Number.isFinite(data?.sampai) ? Math.max(0, Number(data.sampai)) : 0
    // Catatan dari masa depan (jam diubah) diperlakukan sebagai tidak terkunci
    // supaya pengguna tidak terkunci selamanya.
    if (sampai > sekarang + DURASI_KUNCI_MS * 2) return { gagal, sampai: 0 }
    return { gagal, sampai }
  } catch {
    return { gagal: 0, sampai: 0 }
  }
}

function tulis(catatan: CatatanKunci): void {
  try {
    localStorage.setItem(KUNCI_PENYIMPANAN, JSON.stringify(catatan))
  } catch {
    /* penyimpanan penuh / diblokir — abaikan, kunci hanya kehilangan daya tahan */
  }
}

/**
 * Sisa waktu kunci dalam milidetik. `0` berarti tidak terkunci.
 *
 * Kunci yang sudah lewat waktu **dibersihkan di sini juga**, jadi pemanggil
 * tidak perlu memikirkan housekeeping: begitu `0` dikembalikan, catatannya
 * sudah bersih dan percobaan berikutnya mulai dari nol lagi.
 */
export function sisaKunciMs(sekarang: number = Date.now()): number {
  const catatan = baca(sekarang)
  if (catatan.sampai > sekarang) return catatan.sampai - sekarang
  if (catatan.sampai !== 0) tulis({ gagal: catatan.gagal, sampai: 0 })
  return 0
}

/** Sisa percobaan sebelum dikunci. Bisa `0` saat sedang terkunci. */
export function sisaPercobaan(sekarang: number = Date.now()): number {
  const catatan = baca(sekarang)
  if (catatan.sampai > sekarang) return 0
  return Math.max(0, MAKS_PERCOBAAN - catatan.gagal)
}

/**
 * Catat satu kegagalan kredensial.
 *
 * Kembalikan `true` bila pengguna **baru saja** terkunci (yakni kegagalan ini
 * tepat mencapai batas), sehingga pemanggil bisa menampilkan pesan "tunggu
 * 1 menit" yang berbeda dari hitungan sisa percobaan biasa.
 *
 * Saat batas tercapai, hitungan di-reset ke 0 dan kunci dipasang. Dengan
 * begitu, setelah 60 detik berlalu pengguna kembali mendapat 5 percobaan
 * penuh — bukan langsung terkunci lagi karena sisa hitungan lama.
 */
export function catatGagal(sekarang: number = Date.now()): boolean {
  if (sisaKunciMs(sekarang) > 0) return true

  const catatan = baca(sekarang)
  const gagal = catatan.gagal + 1

  if (gagal >= MAKS_PERCOBAAN) {
    tulis({ gagal: 0, sampai: sekarang + DURASI_KUNCI_MS })
    return true
  }

  tulis({ gagal, sampai: 0 })
  return false
}

/** Bersihkan catatan — dipanggil setelah login berhasil. */
export function hapusKunci(): void {
  try {
    localStorage.removeItem(KUNCI_PENYIMPANAN)
  } catch {
    /* abaikan */
  }
}
