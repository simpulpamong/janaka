/**
 * Cek sinkronisasi status profil.
 *
 * ## Bug yang menambah alat ini
 * `login()` selesai begitu Firebase mengembalikan token, padahal
 * `isAuthenticated` = `!!user && !!profile` — dan `profile` baru tiba
 * beberapa ratus milidetik kemudian, lewat panggilan jaringan ke server.
 *
 * Akibatnya `navigate("/dashboard")` berjalan saat `profile` masih `null`.
 * `ProtectedRoute` bounced balik ke `/login`, lalu begitu profil tiba
 * halamannya melompat lagi ke dashboard. Terlihat sebagai kedipan:
 * dashboard → login → dashboard.
 *
 * Perbaikannya: `login()` menunggu profil sebelum resolve.
 *
 * ## Yang dijaga di sini
 * `profilSiap` adalah penanda yang dibaca `login()` **secara sinkron**.
 * Ia harus ditulis di sebelah setiap `setProfile`, bukan lewat
 * `useEffect` — `useEffect` baru jalan setelah render berikutnya, jadi ada
 * jendela balapan di mana profil sudah ada tapi penandanya masih `false`,
 * dan `login()` lalu menunggu sinyal yang sudah lewat.
 *
 * Alat ini memeriksa tiga hal:
 * 1. Setiap `setProfile` diikuti `profilSiap.current` dalam 3 baris.
 * 2. Penanda itu tidak ditulis lewat `useEffect`.
 * 3. Setiap jalur keluar melepas `login()` yang sedang menunggu.
 */
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"

const root = process.cwd()
const zf = "\x1b[0m"
const hijau = (s: string): string => `\x1b[32m${s}${zf}`
const merah = (s: string): string => `\x1b[31m${s}${zf}`
const tebal = (s: string): string => `\x1b[1m${s}${zf}`

const BERKAS = "src/context/AuthContext.tsx"

if (!existsSync(join(root, BERKAS))) {
  console.log(merah(`Berkas ${BERKAS} tidak ditemukan.`))
  process.exit(1)
}

const isi = readFileSync(join(root, BERKAS), "utf8")
const baris = isi.split("\n")

let gagal = 0

console.log(`\n${tebal("STATUS PROFIL")}`)
console.log(`  ${BERKAS}\n`)

/* ── 1. Setiap setProfile harus bertanda ── */
console.log(`${tebal("PASANGAN setProfile")}`)
let jumlah = 0
let benar = 0

for (let i = 0; i < baris.length; i++) {
  if (!baris[i]!.includes("setProfile(")) continue
  jumlah++
  const jendela = baris.slice(i + 1, i + 4).join("\n")
  const ok = jendela.includes("profilSiap.current")
  if (ok) benar++
  else {
    gagal++
    console.log(
      `  ${merah("X")} baris ${i + 1}: ${baris[i]!.trim()}\n` +
        `      → tanpa "profilSiap.current" dalam 3 baris berikutnya`,
    )
  }
}

if (gagal === 0) {
  console.log(`  ${hijau("OK")} ${benar}/${jumlah} setProfile bertanda`)
}

/* ── 2. Penanda harus sinkron, bukan lewat efek ── */
console.log(`\n${tebal("CARA PENANDAAN")}`)

/*
 * Deteksi lewat baris, bukan regex satu baris.
 *
 * Regex seperti `useEffect\s*\([^)]*profilSiap\.current` **tidak
 * bekerja**: `[^)]*` berhenti di tanda kurung pertama — yaitu `(` pada
 * `useEffect(` — sehingga tidak pernah sampai ke isi-bodiedanya. Diuji:
 * pola itu lolos begitu `profilSiap` dipindah ke dalam `useEffect`,
 * padahal justru hal yang paling dilarang.
 */
const barisEfek: number[] = []
for (let i = 0; i < baris.length; i++) {
  if (!/profilSiap\.current/.test(baris[i]!)) continue
  // Cari `useEffect(` dalam 4 baris ke atas — pola penulisan yang
  // tidak boleh dipakai.
  const atas = baris.slice(Math.max(0, i - 4), i).join("\n")
  if (/useEffect\s*\(/.test(atas)) barisEfek.push(i)
}

if (barisEfek.length > 0) {
  gagal++
  console.log(
    `  ${merah("X")} profilSiap ditulis di dalam useEffect (baris ${barisEfek
      .map((n) => n + 1)
      .join(", ")}).\n` +
      `      useEffect baru jalan setelah render berikutnya — ada jendela\n` +
      `      balapan di mana profil sudah ada tapi penandanya masih false,\n` +
      `      dan login() lalu menunggu sinyal yang sudah lewat.`,
  )
} else {
  console.log(`  ${hijau("OK")} ditulis sinkron di sebelah setProfile`)
}

/* ── 3. login() harus benar-benar menunggu ── */
console.log(`\n${tebal("MENUNGGU PROFIL")}`)

const badanLogin = (() => {
  const mulai = isi.indexOf("const login = useCallback")
  if (mulai < 0) return ""
  const selesai = isi.indexOf("const logout", mulai)
  return isi.slice(mulai, selesai < 0 ? undefined : selesai)
})()

if (!badanLogin) {
  gagal++
  console.log(`  ${merah("X")} blok login tidak ditemukan`)
} else {
  const adaTunggu = /await new Promise/.test(badanLogin)
  const adaBatasWaktu = /setTimeout/.test(badanLogin)
  const adaCekSiap = /profilSiap\.current/.test(badanLogin)

  if (!adaTunggu) {
    gagal++
    console.log(
      `  ${merah("X")} login() tidak menunggu profil (tidak ada await new Promise).\n` +
        `      navigate("/dashboard") akan berjalan duluan dan guard akan bounce balik.`,
    )
  } else {
    console.log(`  ${hijau("OK")} login() menunggu profil`)
  }

  if (!adaCekSiap) {
    gagal++
    console.log(
      `  ${merah("X")} login() tidak mengecek profilSiap.current — menunggu\n` +
        `      sinyal yang mungkin sudah lewat.`,
    )
  } else {
    console.log(`  ${hijau("OK")} profil sudah ada dicek lebih dulu`)
  }

  if (!adaBatasWaktu) {
    gagal++
    console.log(
      `  ${merah("X")} tidak ada batas waktu — tombol masuk bisa menggantung\n` +
        `      berputar selamanya kalau onAuthStateChanged tidak pernah menyentuh callback.`,
    )
  } else {
    console.log(`  ${hijau("OK")} ada batas waktu (tidak menggantung)`)
  }
}

/* ── 4. Setiap jalur keluar harus melepas penunggu ── */
console.log(`\n${tebal("JALUR KELUAR")}`)

/*
 * Polanya harus cocok ke *pemakaian*, bukan deklarasi. Kalau hanya
 * `SESSION_MAX_AGE_MS`, yang kena adalah baris `const` di paling atas
 * file — jauh dari `bebaskanPenunggu()` — dan jalur yang sebenarnya
 * terlewat.
 */
const jalur = isi.split("\n")
const harusLepas = [
  { nama: "belum ada user", pola: /if \(!firebaseUser\)/ },
  {
    nama: "masa sesi habis",
    pola: /!meta \|\|/,
  },
  { nama: "profil gagal dimuat", pola: /Profil akun belum siap/ },
  { nama: "akun dinonaktifkan", pola: /Akun Anda dinonaktifkan/ },
  { nama: "profil siap (sukses)", pola: /setProfile\(p\)/ },
]

for (const j of harusLepas) {
  const idx = jalur.findIndex((b) => j.pola.test(b))
  if (idx < 0) {
    gagal++
    console.log(`  ${merah("X")} jalur "${j.nama}" tidak ditemukan`)
    continue
  }
  const jendela = jalur.slice(idx, idx + 14).join("\n")
  const ok = jendela.includes("bebaskanPenunggu()")
  if (ok) console.log(`  ${hijau("OK")} ${j.nama}`)
  else {
    gagal++
    console.log(
      `  ${merah("X")} ${j.nama} — tidak memanggil bebaskanPenunggu();\n` +
        `      login() yang sedang menunggu akan menggantung sampai batas waktu.`,
    )
  }
}

const logoutIdx = isi.indexOf("const logout = useCallback")
const logoutTubuh = logoutIdx < 0 ? "" : isi.slice(logoutIdx, logoutIdx + 400)
if (logoutTubuh.includes("bebaskanPenunggu()")) {
  console.log(`  ${hijau("OK")} logout`)
} else {
  gagal++
  console.log(`  ${merah("X")} logout — tidak melepas penunggu`)
}

const authFirebase = readFileSync(join(root, "src/lib/firebase/auth.ts"), "utf8")
if (authFirebase.includes("browserSessionPersistence") && authFirebase.includes("setPersistence(auth")) {
  console.log(`  ${hijau("OK")} Firebase memakai session persistence browser`)
} else {
  gagal++
  console.log(`  ${merah("X")} Firebase tidak dibatasi ke persistence sesi browser`)
}

if (isi.includes("setTimeout(akhiriSesi, sisaMs)")) {
  console.log(`  ${hijau("OK")} sesi aktif berakhir otomatis setelah 12 jam`)
} else {
  gagal++
  console.log(`  ${merah("X")} sesi aktif tidak memiliki timer kedaluwarsa`)
}

console.log("")
if (gagal === 0) {
  console.log(hijau("Status profil tersinkron — tidak akan berkedip saat masuk."))
  process.exit(0)
} else {
  console.log(merah(`${gagal} masalah sinkronisasi profil.`))
  process.exit(1)
}
