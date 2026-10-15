/**
 * Cek kuota bundel — menjaga ukuran unduhan awal tetap terkendali.
 *
 * ## Kenapa perlu
 * Aplikasi ini dipakai di jaringan seluler lapangan, sering di area sinyal
 * lemah. Bundel yang membengkak tidak langsung merusak `npm run build`; ia
 * baru terasa sebagai "aplikasinya lambat" dan "halaman tidak mau kebuka".
 *
 * Yang dijaga:
 *  1. Ukuran tiap chunk di `dist/assets` (gzip — inilah yang benar-benar
 *     travels lewat jaringan).
 *  2. Total unduhan untuk **entrance pertama** (shell + entry + vendor wajib),
 *     bukan seluruh aplikasi. Lazy-loaded route tidak boleh ikut dihitung di
 *     sini: yang diunduh pengguna saat pertama buka memang tidak semuanya.
 *
 * ⚠️ Harus dijalankan **setelah** `vite build`; kalau `dist/` belum ada, alat
 * ini keluar dengan kode 0 dan memberi tahu — bukan gagal, karena itu bukan
 * kondisi salah.
 */
import { existsSync, readdirSync, statSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { gzipSync } from "node:zlib"

const root = process.cwd()
const dist = join(root, "dist")
const assets = join(dist, "assets")

const zf = "\x1b[0m"
const hijau = (s: string): string => `\x1b[32m${s}${zf}`
const merah = (s: string): string => `\x1b[31m${s}${zf}`
const kuning = (s: string): string => `\x1b[33m${s}${zf}`

/** Batas per chunk (gzip). Di atas ini chunk itu perlu dipecah. */
const BATAS_CHUNK = 400 * 1024
/** Batas total unduhan entrance pertama (gzip). */
const BATAS_ENTRANCE = 700 * 1024

if (!existsSync(assets)) {
  console.log(kuning("`dist/assets` belum ada — jalankan `npm run build` lebih dahulu."))
  process.exit(0)
}

const berkas = readdirSync(assets)
  .filter((f) => /\.(js|css)$/.test(f))
  .map((f) => {
    const buf = readFileSync(join(assets, f))
    return { nama: f, mentah: statSync(join(assets, f)).size, gzip: gzipSync(buf).length }
  })
  .sort((a, b) => b.gzip - a.gzip)

const kb = (n: number): string => `${(n / 1024).toFixed(1)} KB`

console.log(`\n\x1b[1mCHUNK TERBESAR\x1b[0m`)
for (const b of berkas.slice(0, 10)) {
  const lebih = b.gzip > BATAS_CHUNK
  const tanda = lebih ? merah("X ") : hijau("OK")
  console.log(
    `  ${tanda} ${b.nama.padEnd(34)} ${kb(b.gzip).padStart(10)} gzip${lebih ? "  " + merah(`(${kb(b.gzip - BATAS_CHUNK)} di atas batas)`) : ""}`,
  )
}

/**
 * Entrance = `index.html` + entry chunk + CSS + vendor wajib.
 *
 * Heuristik: yang dipilih adalah chunk yang dirujuk langsung `index.html`
 * (script & link), ditambah CSS. Chunk lain sengaja tidak dihitung — memuat
 * lazy route saat pertama buka bukan hal yang salah.
 */
const html = readFileSync(join(dist, "index.html"), "utf8")
const dirujuk = new Set<string>()
for (const m of html.matchAll(/(?:src|href)="\/assets\/([^"]+)"/g)) {
  if (m[1]) dirujuk.add(m[1])
}

let entrance = 0
for (const b of berkas) if (dirujuk.has(b.nama)) entrance += b.gzip

const total = berkas.reduce((n, b) => n + b.gzip, 0)

console.log(`\n\x1b[1mRINGKASAN\x1b[0m`)
console.log(`  Unduhan entrance pertama : ${kb(entrance)} gzip (${dirujuk.size} berkas)`)
console.log(`  Total seluruh chunk     : ${kb(total)} gzip (${berkas.length} berkas)`)

let gagal = 0
if (entrance > BATAS_ENTRANCE) {
  console.log(
    `\n  ${merah("X ")} Entrance ${kb(entrance)} melewati batas ${kb(BATAS_ENTRANCE)}.`,
  )
  gagal++
}
const berlebihan = berkas.filter((b) => b.gzip > BATAS_CHUNK)
if (berlebihan.length > 0) {
  console.log(
    `\n  ${merah("X ")} ${berlebihan.length} chunk melewati ${kb(BATAS_CHUNK)}: ` +
      berlebihan.map((b) => b.nama).join(", "),
  )
  gagal++
}

console.log("")
if (gagal === 0) {
  console.log(hijau("Kuota bundel terkendali."))
  process.exit(0)
} else {
  console.log(merah(`${gagal} batas kuota terlampaui.`))
  process.exit(1)
}