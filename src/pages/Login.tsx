import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  Database,
  Gavel,
  LockKeyhole,
  LogIn,
  MapPinned,
  Moon,
  Sun,
  User,
} from "lucide-react"
import { useAuth } from "@/context/AuthContext"
import { useToast } from "@/hooks/useToast"
import { ActionButton, Alert, Field, PasswordField } from "@/components/ui/primitives"
import { APP_INSTANSI } from "@/lib/access"
import { PASSWORD_MAX, normalisasiUsername, tanpaSpasi } from "@/lib/akun"
import {
  adalahGagalKredensial,
  catatGagal,
  DURASI_KUNCI_MS,
  hapusKunci,
  sisaKunciMs,
  sisaPercobaan,
} from "@/lib/kunciLogin"

/**
 * Cakupan kerja JANAKA yang tampil di panel kiri, di bawah judul
 * "Sistem JANAKA". Sengaja tiga baris saja — panel itu panggung identitas,
 * bukan daftar fitur lengkap; daftar panjang justru mengubur logo instansi.
 * Ikon dan labelnya mengikuti menu di Sidebar ("Pemetaan Reklame" memakai
 * ikon yang sama) supaya panel ini menyebut hal yang benar-benar ditemukan
 * pengguna begitu berhasil masuk.
 */
const FITUR = [
  { ikon: Database, label: "Integrated Data System PTSP" },
  { ikon: MapPinned, label: "Pemetaan Reklame" },
  { ikon: Gavel, label: "Manajemen Penegakan Perda" },
]

/** Warna aksen — sama dengan identitas visual batik/emas di proyek lain. */
const EMAS = "#FFD23F"
const EMAS_GELAP = "#E6B800"

export default function Login() {
  const navigate = useNavigate()
  const { login, isAuthenticated, isConfigured } = useAuth()
  const { showToast } = useToast()

  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dark, setDark] = useState(() =>
    typeof document === "undefined" ? true : document.documentElement.classList.contains("dark"),
  )
  const [fotoLatarSiap, setFotoLatarSiap] = useState(false)
  /*
   * Sisa waktu kunci (ms). Dibaca langsung dari penyimpanan saat pertama
   * render supaya memuat ulang halaman tidak mengulang hitung mundur dari
   * awal — lihat catatan di `src/lib/kunciLogin.ts`.
   */
  const [sisaKunci, setSisaKunci] = useState(() => sisaKunciMs())
  const terkunci = sisaKunci > 0
  const detikKunci = Math.ceil(sisaKunci / 1000)

  // Sudah login → langsung ke dashboard.
  useEffect(() => {
    if (isAuthenticated) navigate("/dashboard", { replace: true })
  }, [isAuthenticated, navigate])

  /*
   * Hitung mundur kunci.
   *
   * Interval sengaja dipasang sekali dan tidak bergantung pada `terkunci`:
   * saat tidak terkunci `sisaKunciMs()` mengembalikan 0 dan `sisaKunci`
   * sudah 0, sehingga React mendeteksi nilai state yang sama dan tidak
   * merender ulang. Jadi biayanya nol, tetapi begitu kunci dipasang hitung
   * mundurnya langsung berjalan tanpa perlu memasang interval baru.
   */
  useEffect(() => {
    const timer = window.setInterval(() => setSisaKunci(sisaKunciMs()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const toggleTheme = () => {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle("dark", next)
    localStorage.setItem("janaka-theme", next ? "dark" : "light")
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    /*
     * Gerbang pertama: masih terkunci?
     *
     * Dicek dari penyimpanan, bukan dari state, supaya klik ganda pada
     * tombol — atau submit lewat Enter sebelum render berikutnya — tidak
     * lolos. Percobaan yang ditolak di sini **tidak** menambah hitungan
     * kegagalan: pengguna tidak sedang menebak password, hanya menekan
     * tombol saat masih diblokir.
     */
    const sisa = sisaKunciMs()
    if (sisa > 0) {
      setSisaKunci(sisa)
      return
    }

    if (!username.trim() || !password) {
      setError("Username dan password wajib diisi.")
      return
    }

    setLoading(true)
    try {
      await login(username, password)
      // Berhasil → hapus hitungan. Kunci yang tersisa dari sesi sebelumnya
      // juga ikut hilang, karena password yang benar membuktikan identitas.
      hapusKunci()
      setSisaKunci(0)
      showToast("Berhasil masuk. Selamat datang.", "success")
      navigate("/dashboard", { replace: true })
    } catch (err) {
      if (adalahGagalKredensial(err)) {
        const baruTerkunci = catatGagal()
        setSisaKunci(sisaKunciMs())
        if (baruTerkunci) {
          const detik = Math.round(DURASI_KUNCI_MS / 1000)
          setError(null)
          showToast(`Terlalu banyak percobaan. Tunggu ${detik} detik sebelum mencoba lagi.`, "error")
        } else {
          const message = `Username atau password salah. Sisa ${sisaPercobaan()} percobaan sebelum dikunci.`
          setError(message)
          showToast(message, "error")
        }
      } else {
        // Gangguan jaringan / konfigurasi / akun nonaktif — bukan kesalahan
        // kredensial, jadi tidak dihitung dan tidak memperpendek jatah.
        const message = normalizeAuthError(err)
        setError(message)
        showToast(message, "error")
      }
    } finally {
      setLoading(false)
    }
  }

  const bisaMasuk =
    username.trim().length > 0 && password.length > 0 && !loading && !terkunci

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 p-5 transition-colors duration-300 dark:bg-[#0B1120]">
      {/*
        Ornamen batik sebagai latar halaman.

        Sebelumnya di sini ada grid 32px + kotak blur. Grid itulah yang
        membuat halaman terasa "kotak kotak" — garis lurus yang memotong
        layar tanpa hubungan dengan isinya. Pola batik menggantikannya,
        dengan tepi yang di-mask supaya memudar, bukan terlihat seperti
        SVG yang ditempel. Detailnya di `index.css`
        (`.janaka-batik-penuh`).
      */}
      <div className="janaka-batik-penuh" aria-hidden="true" />
      <div className="janaka-batik-wash" aria-hidden="true" />

      {/* Toggle tema (desktop) */}
      <button
        type="button"
        onClick={toggleTheme}
        className="absolute right-6 top-6 z-30 hidden h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-md transition-all hover:scale-105 hover:bg-slate-50 active:scale-95 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 sm:flex"
        aria-label={dark ? "Mode terang" : "Mode gelap"}
        title={dark ? "Mode terang" : "Mode gelap"}
      >
        {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      </button>

      {/* ═══ Kartu: dua panel ═══ */}
      <div className="relative z-20 flex min-h-[480px] w-full max-w-[900px] animate-in fade-in zoom-in-95 overflow-hidden rounded-[24px] shadow-[0_32px_80px_rgba(15,23,42,0.35),0_4px_20px_rgba(15,23,42,0.2)] duration-500 max-md:min-h-0 max-md:max-w-[440px] max-md:flex-col max-md:rounded-[20px]">
        {/* ── Panel kiri: identitas instansi ── */}
        <div className={`relative flex min-w-0 flex-1 flex-col overflow-hidden max-md:flex-none ${dark ? "bg-[#07111f]" : "bg-[#153a63]"}`}>
          {/*
            Foto petugas — pita ("band") di dasar panel.

            Dulu fotonya `object-cover` sepenuh panel. Pada panel portrait
            itu memotong sekitar 7% sisi kiri foto — dan yang kena justru
            petugas paling kiri. Sekarang tingginya dibatasi 60% (naik dari
            54%, jadi porsinya di panel jauh lebih besar):

              • `bottom-[-1%]` → tepi bawahnya dilewatkan sedikit dari dasar
                panel supaya sisi atasnya naik; sisi bawah sengaja TANPA
                mask sama sekali, jadi tepinya rata dan bersih — bukan
                gradien blur yang menggantung;
              • `w-[95%] left-[1.5%]` + `translate-x-[1%]` → foto digeser
                sedikit ke kanan. Lebarnya tidak pernah melebihi panel, jadi
                tidak ada lagi isi foto yang terpotong; sisi kiri dapat
                ruang dari tepi panel supaya petugas paling kiri utuh;
              • `object-[center_16%]` → jendela potong tepat di wajah dan
                badan (kepala ada di 13–41% tinggi pita), bukan memenggal
                kepala, dan hanya membuang latar hitam di tepi foto;
              • mask hanya di 12% atas → pita melebur ke navy di tempat teks
                berada tanpa menutupi wajah. Sisi bawah dibiarkan utuh.
          */}
          <img
            src="/assets/background.webp"
            alt=""
            aria-hidden="true"
            loading="eager"
            fetchPriority="high"
            decoding="async"
            onLoad={() => setFotoLatarSiap(true)}
            className={`pointer-events-none absolute bottom-[-1%] left-[1.5%] h-[60%] w-[95%] translate-x-[1%] object-cover object-[center_16%] transition-opacity duration-500 max-md:hidden ${fotoLatarSiap ? "opacity-100" : "opacity-0"}`}
            // Foto dibuat lebih berwarna. `saturate` menyorot warna kulit
            // dan lencana yang tadinya pudar di atas navy; tanpa itu foto
            // terbaca sebagai abu-abu. `blur(0.8px)` menipiskan detail
            // supaya pita foto tidak berebut perhatian dengan teks.
            style={{
              filter: "saturate(1.22) contrast(1.02) brightness(1.12) blur(0.8px)",
              maskImage: "linear-gradient(to bottom, transparent 0%, #000 12%, #000 100%)",
              WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, #000 12%, #000 100%)",
            }}
          />
          {/*
            Lapisan navy.

            Gradiennya dibalik dari sebelumnya: dulu paling pekat di
            bawah karena foto memenuhi panel. Sekarang teks ada di atas
            dan foto di bawah, jadi sisi atas yang pekat (teks aman
            dibaca) dan sisi bawah tipis (foto tetap terlihat).
          */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background: dark
                ? "linear-gradient(to bottom, rgb(4 12 24 / 0.94) 0%, rgb(4 12 24 / 0.86) 34%, rgb(5 14 27 / 0.38) 58%, rgb(6 16 30 / 0.12) 100%)"
                : "linear-gradient(to bottom, rgb(15 44 76 / 0.92) 0%, rgb(14 40 70 / 0.84) 34%, rgb(12 34 60 / 0.32) 58%, rgb(10 28 50 / 0.10) 100%)",
            }}
          />

          {/*
            Identitas instansi + isi sistem.

            Susunannya: logo Satpol PP di baris paling atas, lalu nama
            lengkap instansi, baru di bawahnya "Sistem JANAKA" dengan
            tiga cakupan kerjanya. Di layar kecil hanya baris identitas
            yang tersisa — kartunya menumpuk dan panel ini jadi kepala
            kartu saja, jadi daftar fitur serta fotonya disembunyikan
            supaya tidak memakan tinggi layar.
          */}
          <div className="relative z-10 flex flex-1 flex-col px-8 pt-6 max-md:flex-none max-md:px-5 max-md:py-4">
            <div className="flex items-center gap-3.5 max-md:gap-3">
              <img
                src="/assets/logo_satpol.svg"
                alt="Logo Satpol PP Kabupaten Ponorogo"
                className="h-[54px] w-auto max-w-full shrink-0 object-contain drop-shadow-[0_2px_10px_rgba(3,7,18,0.55)] max-md:h-[36px]"
                decoding="async"
                draggable="false"
              />
              <span aria-hidden="true" className="h-10 w-px shrink-0 bg-white/25 max-md:h-8" />
              <div className="flex min-w-0 flex-col gap-1 max-md:gap-0.5">
                <span className="text-[clamp(11.5px,1.02vw,14px)] font-extrabold uppercase leading-[1.3] tracking-[0.1em] text-white">
                  Satuan Polisi Pamong Praja
                </span>
                <span
                  className="text-[clamp(10px,0.9vw,12.5px)] font-bold uppercase leading-[1.3] tracking-[0.2em]"
                  style={{ color: EMAS, textShadow: "0 1px 10px rgba(122, 84, 12, 0.5)" }}
                >
                  Kabupaten Ponorogo
                </span>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-3 max-md:hidden">
              <span
                className="text-[0.72rem] font-extrabold uppercase tracking-[0.22em]"
                style={{ color: EMAS, textShadow: "0 1px 10px rgba(122, 84, 12, 0.5)" }}
              >
                Sistem JANAKA
              </span>
              <ul className="flex flex-col gap-2">
                {FITUR.map(({ ikon: Ikon, label }) => (
                  <li key={label} className="flex items-center gap-3">
                    <Ikon
                      className="h-[18px] w-[18px] shrink-0"
                      style={{ color: EMAS }}
                      aria-hidden="true"
                    />
                    <span className="text-[0.9rem] font-semibold leading-[1.4] text-white/90">
                      {label}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* ── Panel kanan: identitas sistem + formulir ── */}
        <div className="relative flex flex-1 flex-col justify-center bg-white px-8 py-7 transition-colors duration-300 max-md:px-[22px] max-md:pb-7 max-md:pt-5 dark:bg-[#121a2b]">
          {/*
            Toggle tema untuk layar kecil.

            Sempat menempel di baris paling atas panel kiri; setelah
            panel kiri jadi kepala identitas, tempat itu penuh. Jadi
            pindah ke pojok kanan panel ini — satu-satunya area kosong
            pada lebar sekecil ini.
          */}
          <button
            type="button"
            onClick={toggleTheme}
            className="absolute right-4 top-4 z-30 flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-600 shadow-sm transition-all hover:bg-slate-100 active:scale-95 sm:hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            aria-label={dark ? "Mode terang" : "Mode gelap"}
            title={dark ? "Mode terang" : "Mode gelap"}
          >
            {dark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
          </button>

          {/*
            Lockup JANAKA.

            Berkasnya sudah berupa tulisan "JANAKA" dengan latar
            transparan (sudutnya alpha 0), jadi aman di panel putih maupun
            gelap tanpa kotak putih; pembaca layar cukup diberi alt
            "JANAKA". Tepi transparan di berkas aslinya sudah dipangkas,
            jadi lebarnya benar-benar sepanjang tulisan — tidak ada ruang
            kosong yang membuat lockup terlihat kecil dan tidak center.

            Kepanjangannya dipaksa satu baris (`whitespace-nowrap`) dan
            ukurannya fluid dengan `clamp()`: pada panel sempit (tablet,
            kartu masih dua kolom) hurufnya ikut mengecil supaya tetap
            muat, sementara di desktop ia membesar mendekati ukuran judul.
          */}
          <div className="mb-6 text-center max-md:mb-5">
            <img
              src="/assets/janaka.webp"
              alt="JANAKA"
              width={982}
              height={226}
              loading="eager"
              fetchPriority="high"
              decoding="async"
              draggable="false"
              className="mx-auto h-auto w-[232px] max-w-full object-contain max-md:w-[156px]"
            />
            <p className="mt-2 whitespace-nowrap text-[clamp(10.5px,1.4vw,14px)] font-extrabold uppercase leading-[1.5] tracking-[0.08em] text-[#0B4A2E] dark:text-[#FFD23F]">
              Jaringan Navigasi Penegakan Perda
            </p>
          </div>

          {/*
            Judul blok formulir.

            Dikecilkan dan dibuat rata tengah supaya sebaris dengan lockup
            di atasnya; kalau dibiarkan rata kiri sementara logo di
            tengah, keduanya terlihat tidak satu poros.
          */}
          <div className="mb-7 text-center">
            <h2 className="text-[1.28rem] font-black leading-[1.25] tracking-tight text-slate-900 dark:text-slate-100">
              Masuk ke Sistem
            </h2>
            <span
              aria-hidden="true"
              className="mx-auto mt-3 block h-1 w-10 rounded-full"
              style={{ background: `linear-gradient(90deg, #2BA8A2, ${EMAS})` }}
            />
          </div>

          {!isConfigured ? (
            <Alert tone="amber" className="mb-5">
              Firebase belum dikonfigurasi. Isi variabel{" "}
              <code className="font-mono">VITE_FIREBASE_*</code> pada berkas{" "}
              <code className="font-mono">.env</code> terlebih dahulu.
            </Alert>
          ) : null}

          {/*
            Kunci mengambil alih pesan galat.

            Saat terkunci, `error` sengaja dikosongkan (lihat `handleSubmit`)
            supaya pesan tidak bertumpuk dan hitung mundurnya selalu jadi
            satu-satunya hal yang dibaca.
          */}
          {terkunci ? (
            <Alert
              tone="rose"
              icon={<LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />}
              className="mb-5"
            >
              Terlalu banyak percobaan masuk. Demi keamanan, tunggu{" "}
              <strong className="font-bold">{detikKunci} detik</strong> sebelum mencoba lagi.
            </Alert>
          ) : error ? (
            <Alert tone="rose" className="mb-5">
              {error}
            </Alert>
          ) : null}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4" autoComplete="on" noValidate>
            <Field label="Username" htmlFor="username">
              {/* `relative` wajib — ikonnya `absolute`. Tanpa pembungkus
                  ini dia menempel ke kartu, jauh dari inputnya. */}
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 h-[15px] w-[15px] -translate-y-1/2 text-slate-400" />
                <input
                id="username"
                type="text"
                inputMode="text"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="Masukkan username"
                value={username}
                // Spasi dibuang saat diketik maupun saat paste — dicegah,
                // bukan divalidasi setelahnya, supaya "budi santoso" tidak
                // pernah sempat tersimpan.
                onChange={(e) => {
                  setUsername(tanpaSpasi(e.target.value))
                  setError(null)
                }}
                onBlur={() => setUsername((v) => normalisasiUsername(v))}
                disabled={loading}
                className="w-full rounded-[10px] border-[1.5px] border-slate-200 bg-[#f8fafc] py-[11px] pl-[38px] pr-3.5 text-[0.87rem] text-slate-900 shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)] transition-all duration-200 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:shadow-[0_0_0_3px_rgba(59,130,246,0.12)] disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-white/[0.05] dark:text-slate-100 dark:focus:bg-white/[0.08] dark:[&:-webkit-autofill]:shadow-[0_0_0_1000px_#121a2b_inset] dark:[&:-webkit-autofill]:[-webkit-text-fill-color:#f1f5f9]"
                />
              </div>
            </Field>

            <Field label="Password" htmlFor="password">
              <PasswordField
                id="password"
                value={password}
                onChange={(v) => {
                  // Sama seperti username: tanpa spasi, dicegah saat
                  // mengetik, bukan setelahnya.
                  setPassword(tanpaSpasi(v))
                  setError(null)
                }}
                placeholder="Masukkan password"
                autoComplete="current-password"
                maxLength={PASSWORD_MAX}
                leadingIcon={<LockKeyhole className="h-[15px] w-[15px]" strokeWidth={2.5} />}
                disabled={loading}
                className="[&_input]:rounded-[10px] [&_input]:border-[1.5px] [&_input]:py-[11px] [&_input]:pl-[38px] [&_input]:text-[0.87rem] [&_input]:shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)] [&_input]:transition-all [&_input]:duration-200 [&_input]:outline-none [&_input]:focus:border-blue-500 [&_input]:focus:bg-white [&_input]:focus:shadow-[0_0_0_3px_rgba(59,130,246,0.12)] dark:[&_input]:border-slate-700 dark:[&_input]:bg-white/[0.05] dark:[&_input]:focus:bg-white/[0.08] dark:[&_input]:[&:-webkit-autofill]:shadow-[0_0_0_1000px_#121a2b_inset] dark:[&_input]:[&:-webkit-autofill]:[-webkit-text-fill-color:#f1f5f9]"
              />
            </Field>

            {/*
              Spinner.

              `ActionButton` sudah merender spinner sendiri saat `loading`
              aktif — lihat `primitives.tsx`, baris
              `{loading ? <Loader2 … /> : icon}`. Menulis `Loader2` kedua
              di dalam `children` membuat dua ikon berputar berdampingan,
              dan itu memang terjadi di sini sebelum diperbaiki.

              Jadi `children` cukup teks; `icon` pun otomatis hilang saat
              loading karena `ActionButton` yang menggantinya.
            */}
            <ActionButton
              id="login-submit"
              type="submit"
              block
              disabled={!bisaMasuk}
              loading={loading}
              className="mt-1 !justify-center !gap-2 !rounded-full !border-none !px-5 !py-[13px] !text-[0.9rem] !font-extrabold !tracking-[0.02em] !shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-200 hover:!-translate-y-0.5 hover:!shadow-[0_4px_14px_rgba(0,0,0,0.18)] active:!scale-[0.97]"
              style={{
                background: `linear-gradient(135deg, ${EMAS} 0%, ${EMAS_GELAP} 100%)`,
                color: "#1a0f00",
              }}
              icon={!loading && !terkunci ? <LogIn className="h-4 w-4" strokeWidth={2.5} /> : undefined}
            >
              {terkunci
                ? `Tunggu ${detikKunci} detik`
                : loading
                  ? "Memverifikasi…"
                  : "Masuk ke Sistem"}
            </ActionButton>
          </form>

          <p className="mt-6 text-center text-[0.62rem] leading-[1.5] text-slate-400 dark:text-slate-500">
            &copy; 2026 {APP_INSTANSI}
          </p>
        </div>
      </div>
    </div>
  )
}

function normalizeAuthError(err: unknown): string {
  const code =
    typeof err === "object" && err !== null && "code" in err
      ? String((err as { code: string }).code)
      : ""

  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Username atau password salah."
    case "auth/too-many-requests":
      return "Terlalu banyak percobaan. Coba lagi beberapa saat lagi."
    case "auth/network-request-failed":
      return "Tidak dapat menghubungi server autentikasi. Periksa koneksi jaringan."
    case "auth/user-disabled":
      return "Akun ini dinonaktifkan. Hubungi administrator."
    case "auth/invalid-email":
      return "Username tidak dikenali."
    case "auth/email-already-in-use":
      return "Username tersebut sudah digunakan."
    default:
      if (code === "" && err instanceof Error && err.message) return err.message
      return err instanceof Error ? err.message : "Gagal masuk. Coba lagi."
  }
}
