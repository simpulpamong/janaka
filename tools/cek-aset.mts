/**
 * Cek rujukan aset statis.
 *
 * ## Bug yang menambah alat ini
 * `index.html`, service worker, dan `manifest.webmanifest` menunjuk
 * `/assets/favicon-32.png`, `/assets/favicon-16.png`,
 * `/assets/maskable-192.png`, dan `/assets/maskable-512.png` — **keempatnya
 * tidak ada** di `public/assets/`. Yang ada: `icon-16.png`,
 * `icon-32.png`, `icon-48.png`, `icon-192.png`, `icon-512.png`,
 * `apple-touch-icon.png`, dan `favicon.ico`.
 *
 * Akibatnya:
 * - Dua `<link rel="icon">` 404 di setiap muat halaman.
 * - `cache.addAll()` di service worker **menolak seluruh Promise** kalau
 *   satu URL gagal. Satu ikon hilang berarti shell PWA tidak pernah
 *   ter-cache sama sekali — aplikasi tidak bisa dibuka offline.
 *
 * Alat ini memeriksa setiap `/assets/...` yang dirujuk di mana saja dan
 * memastikan berkasnya benar-benar ada.
 *
 * ## Kenapa tidak "bikin ikon yang hilang"
 * Ikon yang ada di `public/assets/` adalah hasil derivasi resmi
 * (`npm run gen:icons`). Membuat ikon baru untuk menambal rujukan yang
 * rusak hanya perpetuate masalahnya: yang benar adalah rujukan yang
 * menunjuk aset yang memang ada.
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const root = process.cwd()
const zf = "\x1b[0m"
const hijau = (s: string): string => `\x1b[32m${s}${zf}`
const merah = (s: string): string => `\x1b[31m${s}${zf}`
const tebal = (s: string): string => `\x1b[1m${s}${zf}`

const ASET = join(root, "public", "assets")

if (!existsSync(ASET)) {
  console.log(merah("public/assets tidak ditemukan — tidak bisa memverifikasi."))
  process.exit(1)
}

/* ── Berkas yang boleh merujuk ────────────────────────────────────── */
const SKIP_DIR = new Set(["node_modules", "dist", ".git", ".vite", ".vercel", "coverage"])

function kumpulkan(dir: string, keluar: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (SKIP_DIR.has(e)) continue
    const p = join(dir, e)
    if (statSync(p).isDirectory()) kumpulkan(p, keluar)
    else keluar.push(p)
  }
  return keluar
}

const cek: string[] = [
  join(root, "index.html"),
  join(root, "public", "manifest.webmanifest"),
  join(root, "vercel.json"),
  join(root, "vite-plugin-pwa-janaka.ts"),
  join(root, "vite.config.ts"),
  join(root, "src", "index.css"),
]
cek.push(...kumpulkan(join(root, "src")))
cek.push(...kumpulkan(join(root, "tools")))
/*
 * Buang berkas ini sendiri dari daftar.
 *
 * Comentarnya di atas **menyebut** `/assets/favicon-32.png` dan
 * `maskable-192.png` sebagai contoh kasus yang dulu rusak. Kalau berkas
 * ini ikut dipindai, alatnya akan melaporkan rujukan yang "rusak" itu
 * sebagai rujukan yang rusak sementara — persis counterproductive yang seharusnya dicek.
 */
const DIRI = new URL(import.meta.url).pathname

/* ── Kumpulkan rujukan ─────────────────────────────────────────────── */
const POLA = /(?:\/assets\/|\.\/assets\/)([A-Za-z0-9._-]+\.(?:png|svg|webp|jpg|jpeg|ico|json|woff2?))/g

const rujukan = new Map<string, Set<string>>()
const isian = new Map<string, string>()

for (const f of cek) {
  if (!existsSync(f) || statSync(f).isDirectory()) continue
  if (resolve(f) === resolve(DIRI)) continue
  // Hanya berkas teks; tries decoding aset biner akan menghasilkan sampah.
  if (/\.(png|jpg|jpeg|webp|ico|woff2?)$/i.test(f)) continue
  const isi = readFileSync(f, "utf8")
  isian.set(f, isi)
  for (const m of isi.matchAll(POLA)) {
    const nama = m[1]!
    rujukan.set(nama, (rujukan.get(nama) ?? new Set()).add(relative(root, f)))
  }
}

const ada = new Set(readdirSync(ASET))

console.log(`\n${tebal("RUJUKAN ASET")}`)
console.log(`  ${rujukan.size} rujukan unik → public/assets\n`)

/* ── Yang hilang ──────────────────────────────────────────────────── */
const hilang = [...rujukan.entries()].filter(([n]) => !ada.has(n))

console.log(`${tebal("BERKAS HILANG")}`)
if (hilang.length === 0) {
  console.log(`  ${hijau("OK")} Semua rujukan menunjuk berkas yang ada.`)
} else {
  for (const [nama, pemanggil] of hilang) {
    console.log(`  ${merah("X ")} /assets/${nama}`)
    for (const p of pemanggil) console.log(`        dirujuk oleh ${p}`)
    console.log(
      `        ${merah("cache.addAll() di service worker gagal utuh kalau satu URL 404,")}\n` +
        `        ${merah("jadi shell PWA tidak akan pernah ter-cache.")}`,
    )
  }
}

/* ── Yang ada tapi tidak dirujuk ──────────────────────────────────── */
const terpakai = new Set(rujukan.keys())
const yatim = [...ada].filter((n) => !terpakai.has(n))

console.log(`\n${tebal("ASET TIDAK DIRUJUK")}`)
if (yatim.length === 0) {
  console.log(`  ${hijau("OK")} Semua aset dipakai minimal satu kali.`)
} else {
  for (const y of yatim) console.log(`  ${hijau("- ")} ${y}`)
  console.log(
    `  ${hijau("  (boleh — sebagian aset sengaja disimpan untuk dipakai manual)")}`,
  )
}

/* ── Manifest: ikon yang dideklarasikan harus ada ─────────────────── */
console.log(`\n${tebal("MANIFEST")}`)

const mfPath = join(root, "public", "manifest.webmanifest")
let mfGagal = 0
if (!existsSync(mfPath)) {
  console.log(`  ${merah("X ")} manifest.webmanifest tidak ditemukan`)
  mfGagal++
} else {
  const mf = JSON.parse(readFileSync(mfPath, "utf8")) as {
    icons?: { src: string; sizes?: string; purpose?: string }[]
    shortcuts?: { name: string; icons?: { src: string }[] }[]
  }

  type EntriIkon = { src: string; sizes?: string; purpose?: string; dari: string }

  const semua: EntriIkon[] = [
    ...(mf.icons ?? []).map((i) => ({ ...i, dari: "icons" })),
    ...(mf.shortcuts ?? []).flatMap((sh) =>
      (sh.icons ?? []).map((i) => ({ ...i, dari: `shortcuts[${sh.name}]` })),
    ),
  ]

  for (const i of semua) {
    const nama = i.src.replace(/^\/assets\//, "")
    if (ada.has(nama)) {
      console.log(`  ${hijau("OK ")} ${i.src} (${i.dari})`)
    } else {
      mfGagal++
      console.log(`  ${merah("X ")} ${i.src} (${i.dari}) — berkas tidak ada`)
    }
  }

  const adaMaskable = semua.some((i) => i.purpose?.includes("maskable"))
  const adaBerkasMaskable = [...ada].some((n) => n.includes("maskable"))
  if (adaMaskable && !adaBerkasMaskable) {
    mfGagal++
    console.log(
      `  ${merah("X ")} manifest mendeklarasikan "maskable" tapi tidak ada berkas maskable.`,
    )
  }
}

/* ── Substitusi service worker harus tetap sinkron ───────────────── */
console.log(`\n${tebal("SUBSTITUSI SERVICE WORKER")}`)

const swTpl = join(root, "src", "pwa", "sw-template.js")
const plugin = join(root, "vite-plugin-pwa-janaka.ts")

if (!existsSync(swTpl) || !existsSync(plugin)) {
  console.log(`  ${merah("X ")} salah satu berkas tidak ditemukan`)
  mfGagal++
} else {
  const tpl = readFileSync(swTpl, "utf8")
  const pl = readFileSync(plugin, "utf8")
  // Setiap URL yang ada di template harus utuh muncul di plugin.
  const blok = tpl.match(/await cache\.addAll\([\s\S]*?map\(\(u\) =>/)?.[0] ?? ""
  const urls = [...blok.matchAll(/"\/([^"]+)"/g)].map((m) => m[1]!)
  let gagal = 0
  for (const u of urls) {
    const adaDiPlugin = pl.includes(`"/${u}"`)
    if (adaDiPlugin) console.log(`  ${hijau("OK ")} /${u}`)
    else {
      gagal++
      mfGagal++
      console.log(
        `  ${merah("X ")} /${u} ada di template tapi tidak ada di plugin —\n` +
          `        hasil build tidak akan mendapat substitusi PRECACHE.`,
      )
    }
  }
  if (gagal === 0 && urls.length > 0) {
    console.log(`  ${hijau("OK ")} semua URL template ada di plugin`)
  }
}

console.log("")
const total = hilang.length + mfGagal
if (total === 0) {
  console.log(hijau("Semua rujukan aset menunjuk berkas yang benar-benar ada."))
  process.exit(0)
} else {
  console.log(merah(`${total} rujukan aset rusak.`))
  process.exit(1)
}
