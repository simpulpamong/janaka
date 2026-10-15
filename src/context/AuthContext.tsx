import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import type { User as FirebaseUser } from "firebase/auth"
import { onAuthStateChanged, signOut } from "firebase/auth"
import {
  auth,
  changePassword as firebaseChangePassword,
  isFirebaseConfigured,
  loginWithUsername,
} from "@/lib/firebase"
import { getDocument, updateDocument } from "@/lib/firebase/firestore"
import {
  ambilProfilServer,
  buatProfilServer,
  catatLogin,
  gantiPasswordServer,
  ubahProfilSendiri,
  ambilStatusServer,
} from "@/services/adminApi"
import {
  batasiIzin,
  normalizePermissions,
  UNAUTHENTICATED_PERMISSIONS,
  type AppPermissions,
  type AppUser,
  type UserRole,
} from "@/lib/access"
import { dariEmailAkun } from "@/lib/akun"

const AUTH_TIMEOUT_MS = 12_000

/**
 * Batas tunggu profil setelah token masuk.
 *
 * Lebih pendek dari `AUTH_TIMEOUT_MS` karena posisinya berbeda:
 * `AUTH_TIMEOUT_MS` menahan kerangka saat halaman **dimuat ulang** (yang
 * boleh pelan — perlu baca server lalu Firestore kalau API mati), sedangkan
 * ini menahan **tombol submit** yang sedang berputar. Pengguna sudah
 * menunggu dengan sengaja di situ; menggantungkan dia lebih buruk daripada
 * menampilkan pesan error.
 */
const PROFIL_TIMEOUT_MS = 8_000

/** Batas durasi sesi sebelum perlu login ulang (meniru prabawa). */
const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000 // 12 jam

const KEY_SESSION = "janaka:sesi:"
const KEY_SERVER_OK = "janaka:api-siap"

interface SessionMeta {
  loginAt: number
}

interface AuthContextValue {
  /* Keadaan */
  user: FirebaseUser | null
  profile: AppUser | null
  role: UserRole
  permissions: AppPermissions
  isAuthenticated: boolean
  isLoading: boolean
  isConfigured: boolean
  /** true selama token diverifikasi ulang dari server. */
  isVerifying: boolean
  /** false bila API manajemen akun belum dikonfigurasi di server. */
  isApiReady: boolean
  /** Alasan API belum siap (isi .env yang kurang, dll). */
  apiNotice: string
  /** Pesan kegagalan saat profil tidak bisa dimuat. */
  sessionError: string | null

  /* Aksi */
  /** Masuk memakai username — bukan email. */
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  changePassword: (current: string, next: string) => Promise<void>
  refreshProfile: () => Promise<void>
  updateProfile: (input: { namaLengkap: string; jabatan?: string; nip?: string }) => Promise<void>
  /** true bila pengguna punya izin tertentu. */
  can: (permission: keyof AppPermissions) => boolean
  /** true bila pengguna punya salah satu izin dari daftar. */
  canAny: (...permissions: (keyof AppPermissions)[]) => boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

/* ── Penyimpanan ringan ── */

function readSessionMeta(uid: string): SessionMeta | null {
  try {
    const raw = sessionStorage.getItem(`${KEY_SESSION}${uid}`)
    return raw ? (JSON.parse(raw) as SessionMeta) : null
  } catch {
    return null
  }
}

function writeSessionMeta(uid: string): void {
  try {
    sessionStorage.setItem(`${KEY_SESSION}${uid}`, JSON.stringify({ loginAt: Date.now() }))
  } catch {
    /* abaikan */
  }
}

function clearSessionMeta(uid?: string): void {
  try {
    if (uid) sessionStorage.removeItem(`${KEY_SESSION}${uid}`)
    for (const key of Object.keys(sessionStorage)) {
      if (key.startsWith(KEY_SESSION)) sessionStorage.removeItem(key)
    }
  } catch {
    /* abaikan */
  }
}

function isProfileValid(p: AppUser | null | undefined): p is AppUser {
  return !!p && (p.role === "admin" || p.role === "user")
}

/* ══════════════════════════════════════════════════════════════════
 *  Profil
 *
 *  ⚠️ Keamanan: server adalah satu-satunya sumber kebenaran.
 *
 *  Role & izin diambil dari `users/{uid}` yang dibaca ulang di sisi server
 *  (Firebase Admin SDK). Nilai apa pun yang tersimpan di browser tidak pernah
 *  dipakai untuk granting akses. Bila server tidak tersedia, profil tetap
 *  dibaca langsung dari Firestore — namun hanya lewat aturan yang sama
 *  (`isActive` + normalisasi), bukan lewat cache lokal.
 * ══════════════════════════════════════════════════════════════════ */

async function loadProfile(firebaseUser: FirebaseUser): Promise<AppUser | null> {
  const uid = firebaseUser.uid

  // 1) Coba server (paling otoritatif: diverifikasi dari ID token).
  try {
    const res = await ambilProfilServer()
    if (res.ok && res.data) {
      if (res.data.perluProfil || !isProfileValid(res.data.akun)) {
        // `dariEmailAkun` membalik email semu kembali jadi username, dan
        // aman terhadap email lama yang tidak mengikuti skema baru.
        const dibuat = await buatProfilServer({
          username: dariEmailAkun(firebaseUser.email ?? uid),
          namaLengkap: firebaseUser.displayName || dariEmailAkun(firebaseUser.email ?? uid),
        })
        if (dibuat.ok && isProfileValid(dibuat.data?.akun)) return dibuat.data!.akun!
      } else if (res.data.akun) {
        return res.data.akun
      }
    }
  } catch (err) {
    console.warn("[Auth] Server profil tidak terjangkau:", err)
  }

  // 2) Fallback: baca langsung dari Firestore (rules tetap berlaku).
  try {
    const doc = await getDocument<AppUser>("users", uid)
    if (!isProfileValid(doc)) return null
    const role: UserRole = doc.role === "admin" ? "admin" : "user"
    return {
      ...doc,
      role,
      permissions: batasiIzin(
        normalizePermissions(doc.permissions as unknown as Record<string, unknown>, role),
        role,
      ),
    }
  } catch (err) {
    console.warn("[Auth] Gagal membaca profil:", err)
    return null
  }
}

/* ── Provider ── */

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null)
  const [profile, setProfile] = useState<AppUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isVerifying, setIsVerifying] = useState(false)
  const [isApiReady, setIsApiReady] = useState(
    () => sessionStorage.getItem(KEY_SERVER_OK) === "1",
  )
  const [apiNotice, setApiNotice] = useState("")
  const [sessionError, setSessionError] = useState<string | null>(null)

  /*
   * ⚠️ Perbaikan "glitch" saat masuk.
   *
   * `login()` tadinya selesai begitu Firebase mengembalikan token, padahal
   * `isAuthenticated` = `!!user && !!profile`. Profilnya sendiri baru tiba
   * beberapa ratus milidetik kemudian, lewat `onAuthStateChanged` →
   * `loadProfile()` (panggilan jaringan ke server, atau Firestore).
   *
   * Akibatnya `navigate("/dashboard")` berjalan saat `profile` masih
   * `null`, `ProtectedRoute` bounced balik ke `/login`, dan begitu profil
   * tiba halamannya melompat lagi ke dashboard. Terlihat sebagai kedipan:
   * dashboard → login → dashboard.
   *
   * Jadi `login()` sekarang benar-benar **menunggu profil**: pemanggil
   * baru menavigasi setelah `profile` ada, dan perpindahan terjadi sekali.
   */

  /** Resolver dari `login()` yang sedang menunggu profil. */
  const penungguProfil = useRef<(() => void) | null>(null)
  /** Membedakan event auth login baru dari token lama yang pulih saat reload. */
  const loginSedangBerlangsung = useRef(false)

  /**
   * Penanda "profil sudah ada", ditulis **synchronously** di sebelah
   * `setProfile`, bukan lewat `useEffect`.
   *
   * Kenapa tidak lewat efek: `login()` butuh tahu kondisi ini di detik
   * yang sama. `useEffect` baru jalan setelah render berikutnya, jadi ada
   * jendela balapan di mana profil sudah ada tapi penandanya masih
   * `false` — dan `login()` lalu menunggu sinyal yang sudah lewat.
   *
   * Harus di-*sinkronkan* dengan setiap `setProfile` di file ini. Kalau
   * ada `setProfile` baru yang lupa menandainya, gejalanya: tombol masuk
   * berputar sampai batas waktu lalu menampilkan pesan timeout.
   */
  const profilSiap = useRef(false)

  /** Lepaskan penunggu dengan aman (dipakai di semua jalur keluar). */
  const bebaskanPenunggu = useCallback(() => {
    penungguProfil.current?.()
    penungguProfil.current = null
  }, [])

  /** Cek kesiapan API manajemen akun (sekali per muat halaman). */
  useEffect(() => {
    let batal = false
    void (async () => {
      const status = await ambilStatusServer()
      if (batal) return
      setIsApiReady(status.siap)
      setApiNotice(status.siap ? "" : status.alasan)
      try {
        if (status.siap) sessionStorage.setItem(KEY_SERVER_OK, "1")
        else sessionStorage.removeItem(KEY_SERVER_OK)
      } catch {
        /* abaikan */
      }
    })()
    return () => {
      batal = true
    }
  }, [])

  // Dengarkan perubahan status autentikasi Firebase.
  useEffect(() => {
    if (!isFirebaseConfigured) {
      setIsLoading(false)
      return
    }

    const timeout = window.setTimeout(() => setIsLoading(false), AUTH_TIMEOUT_MS)

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      window.clearTimeout(timeout)

      if (!firebaseUser) {
        bebaskanPenunggu()
        clearSessionMeta()
        setUser(null)
        setProfile(null)
        profilSiap.current = false
        setSessionError(null)
        setIsLoading(false)
        setIsVerifying(false)
        return
      }

      setUser(firebaseUser)
      setIsVerifying(true)

      // Batas masa sesi → wajib login ulang.
      let meta = readSessionMeta(firebaseUser.uid)
      if (!meta && loginSedangBerlangsung.current) {
        writeSessionMeta(firebaseUser.uid)
        meta = readSessionMeta(firebaseUser.uid)
      }
      if (
        !meta ||
        !Number.isFinite(meta.loginAt) ||
        meta.loginAt > Date.now() ||
        Date.now() - meta.loginAt > SESSION_MAX_AGE_MS
      ) {
        bebaskanPenunggu()
        await signOut(auth)
        clearSessionMeta(firebaseUser.uid)
        setUser(null)
        setProfile(null)
        profilSiap.current = false
        setIsLoading(false)
        setIsVerifying(false)
        return
      }

      try {
        const p = await loadProfile(firebaseUser)
        bebaskanPenunggu()
        if (!p) {
          /*
           * Alasan lengkap (termasuk langkah teknis untuk operator) sengaja
           * tidak ditulis di sini: pesan ini muncul di layar siapa pun yang
           * gagal masuk, bukan hanya admin. Yang dibutuhkan pengguna biasa
           * cuma informasi bahwa akunnya belum siap dan harus menghubungi
           * administrator.
           */
          setSessionError(
            "Profil akun belum siap. Hubungi administrator untuk melengkapi data akun Anda.",
          )
          setProfile(null)
          profilSiap.current = false
          return
        }
        bebaskanPenunggu()
        if (p.isActive === false) {
          setSessionError("Akun Anda dinonaktifkan. Hubungi administrator.")
          await signOut(auth)
            clearSessionMeta(firebaseUser.uid)
          setUser(null)
          setProfile(null)
          profilSiap.current = false
          return
        }
        setProfile(p)
        profilSiap.current = true
        setSessionError(null)
        bebaskanPenunggu()
        void catatLogin()
      } catch (err) {
        console.warn("[Auth] Gagal memuat sesi:", err)
        setSessionError("Gagal memuat sesi. Coba muat ulang halaman.")
        setProfile(null)
        profilSiap.current = false
      } finally {
        setIsLoading(false)
        setIsVerifying(false)
      }
    })

    return () => {
      window.clearTimeout(timeout)
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!user || !profile) return
    const meta = readSessionMeta(user.uid)
    const habisPada = meta?.loginAt ?? 0
    const sisaMs = habisPada + SESSION_MAX_AGE_MS - Date.now()

    const akhiriSesi = () => {
      bebaskanPenunggu()
      clearSessionMeta(user.uid)
      void signOut(auth).finally(() => {
        setUser(null)
        setProfile(null)
        setSessionError(null)
        profilSiap.current = false
      })
    }

    if (!Number.isFinite(habisPada) || habisPada <= 0 || sisaMs <= 0) {
      akhiriSesi()
      return
    }

    const timer = window.setTimeout(akhiriSesi, sisaMs)
    return () => window.clearTimeout(timer)
  }, [user?.uid, profile?.uid, bebaskanPenunggu])

  const login = useCallback(
    async (username: string, password: string) => {
      setSessionError(null)
      loginSedangBerlangsung.current = true
      try {
        const firebaseUser = await loginWithUsername(username.trim(), password)
        writeSessionMeta(firebaseUser.uid)

        // Profil sudah ada? Kalau begitu tidak perlu menunggu apa pun.
        if (profilSiap.current) return

        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            penungguProfil.current = null
            reject(new Error("Verifikasi sesi melebihi batas waktu. Coba lagi."))
          }, PROFIL_TIMEOUT_MS)

          penungguProfil.current = () => {
            clearTimeout(timer)
            resolve()
          }
        })
      } finally {
        loginSedangBerlangsung.current = false
      }
    },
    [bebaskanPenunggu],
  )

  const logout = useCallback(async () => {
    bebaskanPenunggu()
    clearSessionMeta(user?.uid)
    await signOut(auth)
    setUser(null)
    setProfile(null)
    setSessionError(null)
    profilSiap.current = false
  }, [user?.uid, bebaskanPenunggu])

  /**
   * Ganti password sendiri.
   *
   * Bila API server siap, permintaan diteruskan ke `password:ganti` yang
   * memakai Admin SDK. Bila tidak, memakai Firebase Auth langsung di browser
   * (`reauthenticate` + `updatePassword`).
   */
  const changePassword = useCallback(
    async (current: string, next: string) => {
      if (isApiReady) {
        const res = await gantiPasswordServer(current, next)
        if (!res.ok) {
          throw Object.assign(new Error(res.pesan ?? "Gagal mengubah password."), {
            code: res.kode === 401 ? "auth/wrong-password" : "auth/server-error",
          })
        }
        return
      }
      await firebaseChangePassword(current, next)
    },
    [isApiReady],
  )

  const refreshProfile = useCallback(async () => {
    if (!user) return
    const p = await loadProfile(user)
    if (p) {
      setProfile(p)
      profilSiap.current = true
    }
  }, [user])

  const updateProfile = useCallback(
    async (input: { namaLengkap: string; jabatan?: string; nip?: string }) => {
      if (!user) throw new Error("Pengguna belum masuk.")
      if (isApiReady) {
        const res = await ubahProfilSendiri(input)
        if (!res.ok) {
          throw new Error(res.pesan || "Gagal memperbarui profil.")
        }
        if (res.data?.akun) {
          setProfile(res.data.akun)
          profilSiap.current = true
          return
        }
      } else {
        await updateDocument("users", user.uid, {
          namaLengkap: input.namaLengkap,
          jabatan: input.jabatan ?? "",
          nip: input.nip ?? "",
          updatedAt: new Date().toISOString(),
        })
      }
      await refreshProfile()
    },
    [user, isApiReady, refreshProfile],
  )

  // ⚠️ Keamanan: role default 'user' & izin kosong bila belum terautentikasi.
  const role: UserRole = profile?.role ?? "user"
  const permissions = useMemo<AppPermissions>(
    () => profile?.permissions ?? UNAUTHENTICATED_PERMISSIONS,
    [profile?.permissions],
  )

  const can = useCallback(
    (permission: keyof AppPermissions) => {
      if (!user || profile?.isActive === false) return false
      return batasiIzin(permissions, role)[permission] === true
    },
    [user, profile?.isActive, permissions, role],
  )

  const canAny = useCallback(
    (...list: (keyof AppPermissions)[]) => list.some((p) => can(p)),
    [can],
  )

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      role,
      permissions,
      isAuthenticated: !!user && !!profile && profile.isActive !== false,
      isLoading,
      isConfigured: isFirebaseConfigured,
      isVerifying,
      isApiReady,
      apiNotice,
      sessionError,
      login,
      logout,
      changePassword,
      refreshProfile,
      updateProfile,
      can,
      canAny,
    }),
    [
      user,
      profile,
      role,
      permissions,
      isLoading,
      isVerifying,
      isApiReady,
      apiNotice,
      sessionError,
      login,
      logout,
      changePassword,
      refreshProfile,
      updateProfile,
      can,
      canAny,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth harus dipakai di dalam AuthProvider")
  return ctx
}