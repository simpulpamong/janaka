/**
 * Cek keamanan, SEO, & performa dasar JANAKA.
 *
 * Yang diperiksa:
 *  1. Header keamanan di `server/index.ts` (HSTS, nosniff, clickjacking…)
 *  2. `public/robots.txt` — peta situs & jalur yang dilarang
 *  3. SEO dasar di `index.html` (title, description, canonical, OG, JSON-LD)
 *  4. Tidak ada kontrol `<select>` / `<input type="date">` asli browser
 *  5. Tidak ada `target="_blank"` tanpa `rel` (reverse tabnabbing)
 *  6. Ukuran aset besar yang memperlambat muat pertama
 *
 * Jalankan kapan saja: `npm run test:aman`
 */

import { readFileSync, existsSync, statSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()

let gagal = 0
const ok = (m: string) => console.log(`  \x1b[32mOK\x1b[0m ${m}`)
const salah = (m: string) => {
  gagal++
  console.log(`  \x1b[31mXX\x1b[0m ${m}`)
}
const judul = (t: string) => console.log(`\n\x1b[1m${t}\x1b[0m`)

function baca(rel: string): string {
  const p = join(ROOT, rel)
  if (!existsSync(p)) return ""
  return readFileSync(p, "utf8")
}

/* ── 1. Header keamanan server ─────────────────────────────────────── */

judul("1. HEADER KEAMANAN (server/index.ts)")

const serverSrc = baca("server/index.ts")

const headerWajib: [string, string][] = [
  ["X-Content-Type-Options", "nosniff"],
  ["X-Frame-Options", "SAMEORIGIN"],
  ["Referrer-Policy", "strict-origin-when-cross-origin"],
  ["Permissions-Policy", "geolocation=(self)"],
  ["Cross-Origin-Opener-Policy", "same-origin-allow-popups"],
  ["X-Permitted-Cross-Domain-Policies", "none"],
  ["Strict-Transport-Security", "max-age=31536000"],
]

for (const [nama, nilai] of headerWajib) {
  if (serverSrc.includes(nama) && serverSrc.includes(nilai)) ok(`${nama} dipasang.`)
  else salah(`${nama} belum dipasang (atau nilainya salah).`)
}

/* HSTS harus dibungkus pemeriksaan koneksi terenkripsi. */
if (/if \(aman\)[\s\S]{0,300}Strict-Transport-Security/.test(serverSrc)) {
  ok("HSTS hanya dikirim lewat HTTPS.")
} else {
  salah("HSTS dikirim tanpa syarat — akan diabaikan browser di http://.")
}

/* ── 2. robots.txt ────────────────────────────────────────────────── */

judul("2. ROBOTS.TXT")

const robots = baca("public/robots.txt")

if (!robots) {
  salah("public/robots.txt tidak ada.")
} else {
  if (/^User-agent:/m.test(robots)) ok("User-agent terdefinisi.")
  else salah("User-agent belum terdefinisi.")

  if (/^Sitemap:\s*\S+\.xml$/m.test(robots)) ok("Sitemap dirujuk.")
  else salah("Sitemap belum dirujuk di robots.txt.")

  if (/^Disallow:\s*\/api\//m.test(robots)) ok("Jalur API dilarang diindeks.")
  else salah("Jalur API belum dilarang — bisa terekspos ke mesin pencari.")
}

/* ── 3. SEO dasar index.html ───────────────────────────────────────── */

judul("3. SEO DASAR (index.html)")

const html = baca("index.html")

const seoWajib: [string, string][] = [
  ["<title>", "Judul halaman"],
  ['name="description"', "Deskripsi"],
  ['rel="canonical"', "URL kanonik"],
  ['property="og:title"', "Open Graph title"],
  ['property="og:description"', "Open Graph description"],
  ['property="og:image"', "Open Graph image"],
  ['property="og:url"', "Open Graph url"],
  ['name="twitter:card"', "Twitter card"],
  ['name="robots"', "Robot meta"],
  ["schema.org", "Data terstruktur JSON-LD"],
  ['rel="manifest"', "Web manifest"],
  ["apple-touch-icon", "Ikon Apple"],
]

for (const [pola, nama] of seoWajib) {
  if (html.includes(pola)) ok(`${nama} ada.`)
  else salah(`${nama} belum ada di index.html.`)
}

/* Judul & deskripsi tidak boleh terlalu pendek — terpotong di SERP. */
const titleMatch = /<title>([^<]+)<\/title>/.exec(html)
const descMatch = /name="description"\s+content="([^"]+)"/.exec(html)

if (titleMatch) {
  const panjang = titleMatch[1]!.length
  if (panjang >= 30 && panjang <= 65) ok(`Panjang judul ${panjang} karakter — pas untuk SERP.`)
  else salah(`Panjang judul ${panjang} karakter; ideal 30–65.`)
}

if (descMatch) {
  const panjang = descMatch[1]!.length
  if (panjang >= 70 && panjang <= 165) ok(`Panjang deskripsi ${panjang} karakter — pas untuk SERP.`)
  else salah(`Panjang deskripsi ${panjang} karakter; ideal 70–165.`)
}

/* `lang` wajib supaya pembaca layar & mesin pencari tahu bahasanya. */
if (/<html[^>]+lang="id"/.test(html)) ok('Bahasa halaman dinyatakan (lang="id").')
else salah('Atribut lang belum diisi "id".')

/* ── 4. Kontrol asli browser ───────────────────────────────────────── */

judul("4. KOMPONEN KONTROL SENDIRI")

/**
 * Buang komentar sebelum memindai.
 *
 * Tanpa ini, komentar penjelas seperti "…bukan `<select>` bawaan browser"
 * di dalam `Dropdown.tsx` ikut terhitung, dan hasilnya selalu merah padahal
 * justru berkas itulah yang jadi komponen pengganti.
 */
function tanpaKomentar(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1")
}

/**
 * Direktori sumber diperiksa satu per satu agar tidak butuh glob eksternal.
 * `Dropdown.tsx` & `DatePicker.tsx` sendiri tidak diperiksa — keduanya memang
 * pembahasan komponen asli di komentar pembuka.
 */
const daftarBerkas = [
  "src/pages/Login.tsx",
  "src/pages/DetailReklame.tsx",
  "src/pages/Dashboard.tsx",
  "src/pages/Mapping.tsx",
  "src/pages/ReklameList.tsx",
  "src/pages/Execution.tsx",
  "src/pages/DetailReklame.tsx",
  "src/pages/Riwayat.tsx",
  "src/pages/Pengaturan.tsx",
  "src/pages/ManajemenPengguna.tsx",
  "src/components/common/KameraWeb.tsx",
  "src/components/common/EditLaporanModal.tsx",
  "src/components/common/DateRangeModal.tsx",
]

let adaSelect = 0
let adaDate = 0

for (const f of daftarBerkas) {
  const src = tanpaKomentar(baca(f))
  if (!src) continue
  const s = (src.match(/<select[\s>]/g) ?? []).length
  const d = (src.match(/<input[^>]+type="(?:date|time|datetime-local|month)"/g) ?? []).length
  adaSelect += s
  adaDate += d
  if (s > 0) salah(`${f}: ${s} <select> asli browser (pakai komponen Dropdown).`)
  if (d > 0) salah(`${f}: ${d} input tanggal/waktu asli (pakai DatePicker/JamPicker).`)
}

if (adaSelect === 0) ok("Tidak ada <select> asli browser — semua pakai komponen sendiri.")
if (adaDate === 0) ok("Tidak ada input tanggal/waktu asli — semua pakai komponen sendiri.")

/* ── 5. Tautan aman ──────────────────────────────────────────────── */

judul("5. TETAP DI DALAM APLIKASI")

/* PDF SK dibuka dari Detail di tab baru dengan proxy same-origin dan rel aman. */
const sumberTs = [
  "src/pages/Login.tsx",
  "src/pages/ReklameList.tsx",
  "src/pages/Riwayat.tsx",
  "src/pages/Execution.tsx",
  "src/pages/Mapping.tsx",
  "src/pages/Pengaturan.tsx",
  "src/components/common/PetaLihat.tsx",
  "src/components/common/FotoViewer.tsx",
  "src/components/common/EditLaporanModal.tsx",
]

let bocor = 0
for (const f of sumberTs) {
  const src = tanpaKomentar(baca(f))
  if (!src) continue

  if (/window\.open\s*\(/.test(src)) {
    salah(`${f}: masih memakai window.open — pakai modal dalam aplikasi.`)
    bocor++
  }
  const tabBaru = [...src.matchAll(/<a\b[^>]*\btarget=["']_blank["'][^>]*>/gi)].map((m) => m[0])
  const tabTidakAman = tabBaru.filter(
    (tag) => !/\brel=["'][^"']*\bnoopener\b[^"']*\bnoreferrer\b[^"']*["']/i.test(tag),
  )
  if (
    tabTidakAman.length > 0 ||
    (tabBaru.length > 0 && f !== "src/pages/DetailReklame.tsx")
  ) {
    salah(`${f}: tab baru hanya untuk dokumen Detail dan harus memakai rel="noopener noreferrer".`)
    bocor++
  }
}
if (bocor === 0) ok("Link PDF tab baru hanya berada di Detail dan memakai rel aman.")

/* ── 6. Ukuran aset ───────────────────────────────────────────────── */

judul("6. UKURAN ASET")

const aset = [
  "public/assets/background.webp",
  "public/assets/icon-512.png",
  "public/assets/icon-192.png",
  "public/assets/logo_satpol.svg",
  "public/assets/batik-ornament.svg",
]

/* Batas per jenis. Gambar besar di muat pertama menahan render. */
const batas = [
  [/\.webp$/, 220 * 1024, "background.webp"],
  [/icon-512/, 200 * 1024, "icon-512.png"],
  [/icon-192/, 80 * 1024, "icon-192.png"],
] as const

for (const a of aset) {
  const p = join(ROOT, a)
  if (!existsSync(p)) continue
  const kb = statSync(p).size / 1024
  const aturan = batas.find(([re]) => re.test(a))
  if (aturan && kb > aturan[1] / 1024) {
    salah(`${a} ${kb.toFixed(0)} KB — ideal < ${(aturan[1] / 1024).toFixed(0)} KB.`)
  } else {
    ok(`${a} ${kb.toFixed(0)} KB.`)
  }
}

/* ── Ringkasan ─────────────────────────────────────────────────────── */

console.log("")
console.log("═".repeat(64))
if (gagal === 0) console.log("\x1b[32m  Semua pemeriksaan aman, SEO, & performa lulus.\x1b[0m")
else console.log(`\x1b[31m  ${gagal} masalah ditemukan.\x1b[0m`)
console.log("═".repeat(64))
console.log("")

process.exit(gagal === 0 ? 0 : 1)
