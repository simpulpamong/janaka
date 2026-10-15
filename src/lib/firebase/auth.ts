import {
  getAuth,
  browserSessionPersistence,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  type User,
  type Unsubscribe,
} from "firebase/auth"
import { firebaseApp } from "./config"
import { kandidatEmail } from "../akun"
import { KODE_KREDENSIAL_SALAH } from "../kunciLogin"

export const auth = getAuth(firebaseApp)

/**
 * Kode error yang MELETAKKAN kandidat berikutnya layak dicoba.
 *
 * Daftarnya diambil dari `src/lib/kunciLogin.ts` — sumber yang sama dipakai
 * penghitung kunci login. Dua salinan daftar kode yang sama cepat atau
 * lambat akan menyimpang, dan waktu itu terjadi salah satu sisi akan
 * menganggap "kredensial salah" sebagai gangguan jaringan.
 *
 * `user-disabled`, `too-many-requests`, dan `network-request-failed` tidak
 * bergantung pada email mana yang dicoba — mencoba lagi hanya memperlambat
 * dan, untuk `too-many-requests`, justru memperburuk batas rate limit.
 */
const CODA_COBI_LAGI = KODE_KREDENSIAL_SALAH

function kodeError(err: unknown): string {
  return typeof err === "object" && err !== null && "code" in err
    ? String((err as { code: unknown }).code)
    : ""
}

/**
 * Masuk memakai username (bukan email).
 *
 * Firebase hanya menerima email, jadi username disusun menjadi email semu
 * lebih dulu — lihat `src/lib/akun.ts` untuk alasannya. Nilai aslinya tidak
 * pernah muncul di layar.
 *
 * ⚠️ Kandidat dicoba berurutan karena akun yang dibuat **sebelum** JANAKA
 * pindah ke skema username masih terdaftar dengan email sungguhan
 * (`admin@admin.com`). Kalau hanya memakai email semu, akun seperti itu
 * terkunci permanen.
 *
 * Error yang dilempar ke pemanggil selalu dari percobaan **terakhir**,
 * dengan kode generik bila itu hanya "kredensial salah" — supaya pesan di
 * layar tidak membocorkan email mana yang benar-benar terdaftar.
 */
export async function loginWithUsername(username: string, password: string): Promise<User> {
  await setPersistence(auth, browserSessionPersistence)
  const kandidat = kandidatEmail(username)
  if (kandidat.length === 0) {
    throw Object.assign(new Error("Username wajib diisi."), { code: "auth/invalid-credential" })
  }

  let terakhir: unknown = null
  for (const email of kandidat) {
    try {
      const credential = await signInWithEmailAndPassword(auth, email, password)
      return credential.user
    } catch (err) {
      terakhir = err
      if (!CODA_COBI_LAGI.has(kodeError(err))) throw err
    }
  }

  // Semua kandidat gagal dengan "kredensial salah". Normalkan supaya
  // pemanggil tidak bisa menebak-nebak email mana yang terdaftar.
  const kode = kodeError(terakhir)
  if (kandidat.length > 1 && CODA_COBI_LAGI.has(kode)) {
    throw Object.assign(new Error("Username atau password salah."), {
      code: "auth/invalid-credential",
    })
  }
  throw terakhir
}

export async function logout(): Promise<void> {
  await signOut(auth)
}

export function onAuthChanged(callback: (user: User | null) => void): Unsubscribe {
  return onAuthStateChanged(auth, callback)
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const user = auth.currentUser
  if (!user?.email) throw new Error("Tidak ada pengguna yang terautentikasi")

  const credential = EmailAuthProvider.credential(user.email, currentPassword)
  await reauthenticateWithCredential(user, credential)
  await updatePassword(user, newPassword)
}

export function getCurrentUser(): User | null {
  return auth.currentUser
}
