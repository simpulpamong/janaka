/**
 * Aturan identitas akun JANAKA — SATU sumber kebenaran.
 *
 * Dipakai oleh sisi klien (`src/**`) dan sisi server (`server/**`). Jangan
 * dobelkan angka atau regex ini di berkas lain: cukup panggil fungsi di sini.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  Kenapa ada modul ini?
 * ═══════════════════════════════════════════════════════════════════
 * Pudu adalah username, bukan email.
 *
 *Firebase Auth hanya menerima email — `signInWithEmailAndPassword` menolak
 * `budi` dengan `auth/invalid-email`, dan `createUser` di sisi server
 * memvalidasi dengan regex yang sama. Jadi username tidak bisa "dipakai
 * langsung" ke Firebase.
 *
 * Solusinya: username disimpan sebagai bagian lokal dari email semu, lalu
 * domain tetap ditambahkan. Pengguna **tidak pernah** melihat atau mengetik
 * domain itu:
 *
 *   budi          →  budi@janaka.invalid
 *   budi@ponorogo →  budi%40ponorogo@janaka.invalid
 *
 * `@` di dalam username tetap boleh — sesuai permintaan: dia hanya simbol,
 * bukan penanda email. Karena itu `@` di-encode jadi `%40` saat menyusun
 * email, supaya tidak bentrok dengan pemisah domain. Persis seperti
 * `encodeURIComponent`, tapi hanya dua karakter yang boleh ter-encode:
 *ibeberapa karakter lain (`-`, `.`, `_`, `+`) justru berebut dengan aturan
 * Firebase.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  Batas password: 6, dan itu bukan pilihan kita
 * ═══════════════════════════════════════════════════════════════════
 * `PASSWORD_MIN` sengaja 6. Dulu ada permintaan bisa 4 karakter — tidak bisa,
 * karena Google menolaknya di sisi server:
 *
 *   node_modules/firebase-admin/lib/utils/validator.js
 *     function isPassword(password) {
 *       // A password must be a string of at least 6 characters.
 *       return typeof password === 'string' && password.length >= 6;
 *     }
 *
 * Perintah `akun:buat` memanggil `auth.createUser`, yang memvalidasi lewat
 * fungsi itu — 4 karakter akan ditolak dengan `auth/invalid-password` tanpa
 * bisa dicegah dari sini. Batas 6 disimpan di satu konstanta supaya kalau
 * someday autentikasi pindah, cukup ubah satu baris — bukan menaci berkas.
 */

/* ══════════════════════════════════════════════════════════════════
 *  Konstanta
 * ══════════════════════════════════════════════════════════════════ */

/**
 * Domain semu untuk username.
 *
 * `.invalid` dipilih karena RFC 2606 mencadangkannya khusus "tidak akan
 * pernah dialokasikan" — jadi tidak mungkin ada pihak lain yang memiliki
 * domain ini dan tidak akan pernah ada email sungguhan yang terkirim ke
 * alamat tersebut.
 */
export const DOMAIN_AKUN = "janaka.invalid"

/** Panjang minimum username. */
export const USERNAME_MIN = 3

/** Panjang maximum username (batas bagian lokal email adalah 64). */
export const USERNAME_MAX = 32

/**
 * Batas minimum password. **Tidak bisa diturunkan** — lihat catatan di atas.
 */
export const PASSWORD_MIN = 6

/** Batas maximum password. */
export const PASSWORD_MAX = 128

/**
 * Karakter yang boleh dipakai pada username.
 *
 * Sengaja daftar-allow, bukan daftar-dilarang: karakter di luar daftar ini
 * bisa merusak email semu (mis. spasi dan baris baru, yang ditolak
 * Firebase) atau menyulitkan pembacaan di konsol Firebase.
 *
 * `@` termasuk — dia simbol biasa, bukan aturan email.
 */
const POLA_USERNAME = /^[a-z0-9._@+-]+$/

/* ══════════════════════════════════════════════════════════════════
 *  Username
 * ══════════════════════════════════════════════════════════════════ */

/**
 * Buang semua spasi dari input credential.
 *
 * Dipakai langsung di `onChange` sehingga pengguna tidak bisa mengetik spasi
 * sama sekali — lebih baik dicegah daripada lalu dideklarasikan error saat
 * menabrak tombol Simpan. Menyisakan sisipan yang nyangkut juga membingungkan:
 * `budi ` dan `budi` akan dianggap berbeda padahal bukan.
 */
export function tanpaSpasi(nilai: string): string {
  return nilai.replace(/\s+/g, "")
}

/**
 * Bentuk kanonik username: tanpa spasi, huruf kecil.
 *
 * Huruf kecil dipakai supaya `Budi` dan `budi` tidak menjadi dua akun yang
 * berbeda di mata Firebase (email bersifat case-insensitive). Konsekuensinya
 * username bersifat case-insensitive — yang membedakan petugas adalah
 * `namaLengkap`, bukan username.
 */
export function normalisasiUsername(nilai: string): string {
  return tanpaSpasi(nilai).toLowerCase()
}

/**
 * Periksa username. Kembalikan pesan dalam bahasa Indonesia, atau `null`
 * kalau benar.
 *
 * ⚠️ Spasi **ditolak**, bukan dibuang. `normalisasiUsername` memang
 * membuangnya, jadi urutannya penting: kalau pemeriksaan dilakukan setelah
 * normalisasi, `"budi ponorogo"` akan menjadi `"budiponorogo"` dan lolos —
 * padahal dua itu identitas yang berbeda. Menolak lebih jujur daripada
 * mengubah diam-diam nama akun yang orang pakai setiap hari.
 */
export function validasiUsername(nilai: string): string | null {
  if (!nilai.trim()) return "Username wajib diisi."
  if (/\s/.test(nilai)) return "Username tidak boleh mengandung spasi."
  const v = normalisasiUsername(nilai)
  if (v.length < USERNAME_MIN) return `Username minimal ${USERNAME_MIN} karakter.`
  if (v.length > USERNAME_MAX) return `Username maksimal ${USERNAME_MAX} karakter.`
  if (!POLA_USERNAME.test(v)) {
    return "Username hanya boleh huruf, angka, dan simbol . _ - @ +"
  }
  return null
}

/**
 * Enkode username menjadi email semu.
 *
 * Hanya `%` dan `@` yang di-encode, berurutan (encode `%` lebih dulu) agar
 * hasil yang memuat `%40` tidak ter-encode dua kali dan tetap bisa
 * dibalik persis oleh `dariEmailAkun`.
 */
export function keEmailAkun(username: string): string {
  const lokal = normalisasiUsername(username).replace(/%/g, "%25").replace(/@/g, "%40")
  return `${lokal}@${DOMAIN_AKUN}`
}

/**
 * Kebalikan dari `keEmailAkun` — mengubah email Firebase kembali jadi username
 * untuk ditampilkan.
 *
 * Aman terhadap email yang tidak mengikuti skema baru: kalau domainnya bukan
 * `DOMAIN_AKUN`, bagian sebelum `@` dikembalikan apa adanya. Jadi fungsi ini
 * tidak pernah melempar error, dan tidak meledak kalau ada dokumen lama yang
 * masih menyimpan email asli.
 */
export function dariEmailAkun(email: string): string {
  const v = String(email ?? "").trim()
  const potong = v.lastIndexOf("@")
  if (potong < 1) return v
  if (v.slice(potong + 1) !== DOMAIN_AKUN) return v.slice(0, potong)
  return decodeURIComponent(v.slice(0, potong))
}

/**
 * True kalau `email` adalah email semu milik JANAKA.
 *
 * Dipakai server untuk membedakan akun yang sudah ikut skema baru dari akun
 * yang masih menyimpan alamat email sungguhan.
 */
// deadcode: akan dipakai oleh alat migrasi batch di masa depan
export function adalahEmailAkun(email: string): boolean {
  return String(email ?? "").trim().toLowerCase().endsWith(`@${DOMAIN_AKUN}`)
}

/**
 * True kalau input pengguna berbentuk email lengkap — ada `@` **dan** ada
 * titik di setelahnya.
 *
 * Inilah pembeda antara "akun lama" dan "username baru yang kebetulan
 * mengandung `@`":
 *
 *   admin@admin.com  → titik setelah `@` → email sungguhan (akun lama)
 *   budi@ponorogo    → tidak ada titik setelah `@` → username biasa
 */
export function sepertiEmail(nilai: string): boolean {
  const v = normalisasiUsername(nilai)
  const potong = v.lastIndexOf("@")
  return potong > 0 && v.slice(potong + 1).includes(".")
}

/**
 * Daftar email yang perlu dicoba saat masuk, urut dari yang paling mungkin.
 *
 * ⚠️ Account yang dibuat sebelum JANAKA pindah ke skema username terdaftar
 * dengan email sungguhan, misalnya `admin@admin.com`. Kalau seluruhnya
 * diteruskan lewat `keEmailAkun`, hasilnya
 * `admin%40admin.com@janaka.invalid` yang **tidak pernah ada** di Firebase —
 * akun lama langsung terkunci tanpa bisa diperbaiki.
 *
 * Karena itu: kalau input terlihat seperti email lengkap, coba apa adanya
 * lebih dulu, baru falls back ke skema baru. Untuk username biasa
 * (`budi`, `budi@ponorogo`) hanya ada satu kandidat — tidak ada biaya
 * percobaan tambahan.
 */
export function kandidatEmail(username: string): string[] {
  const v = normalisasiUsername(username)
  if (!v) return []
  const semu = keEmailAkun(v)
  if (!sepertiEmail(v)) return [semu]
  // Email sungguhan lebih dulu, skema baru sebagai cadangan.
  return v === semu ? [semu] : [v, semu]
}

/* ══════════════════════════════════════════════════════════════════
 *  Password
 * ══════════════════════════════════════════════════════════════════ */

/**
 * Periksa password. Kembalikan pesan dalam bahasa Indonesia, atau `null`
 * kalau benar.
 *
 * Tanpa spasi — sama seperti username. Ini bukan aturan Firebase, tapi
 * mencegah kesalahan ketik yang tidak akan ketahuan sampai saat masuk.
 */
export function validasiPassword(password: string): string | null {
  if (!password) return "Password wajib diisi."
  if (/\s/.test(password)) return "Password tidak boleh mengandung spasi."
  if (password.length < PASSWORD_MIN) {
    return `Password minimal ${PASSWORD_MIN} karakter.`
  }
  if (password.length > PASSWORD_MAX) return "Password terlalu panjang."
  return null
}
