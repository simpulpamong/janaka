/**
 * Cek kontrak — sumber kebenaran yang tersebar harus tetap sama.
 *
 * ## Kenapa perlu
 * Ada nilai yang ditulis di beberapa tempat sekaligus:
 *
 *  • Kontrak izin (`AppPermissions`) ada di `src/lib/access.ts` **dan** di
 *    `server/janakaAdminApi.ts`. Browser menentukan apa yang terlihat, tapi
 *    server yang memutuskan boleh/tidak. Kalau keduanya berbeda, petugas
 *    melihat tombol yang pasti ditolak server.
 *
 *  • Rute ditulis sebagai string di `src/routes/index.tsx`, `Sidebar.tsx`,
 *    dan skrip uji. Salah ketik di string = 404 yang tidak ketahuan sampai
 *    dipakai.
 *
 *  • Service worker ditulis lewat **substitusi string** di
 *    `vite-plugin-pwa-janaka.ts`. Kalau blok yang diganti tidak persis sama
 *    dengan isi `sw-template.js`, `addAll` tetap jalan tanpa daftar precache:
 *    aplikasi terpasang tapi tidak ada aset ter-cache. TypeScript tidak bisa
 *    menangkap ini — hanya `vite build` yang berhasil.
 *
 * Yang diperiksa: ketiganya, plus-meta yang gampang rusak diam-diam.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs"
import { join } from "node:path"

const root = process.cwd()
const baca = (p: string): string => readFileSync(join(root, p), "utf8")

let gagal = 0
let lulus = 0

const hijau = (s: string): string => `\x1b[32m${s}\x1b[0m`
const merah = (s: string): string => `\x1b[31m${s}\x1b[0m`
const tebal = (s: string): string => `\x1b[1m${s}\x1b[0m`

function ok(pesan: string): void {
  lulus++
  console.log(`  ${hijau("OK")} ${pesan}`)
}
function tidakOk(pesan: string, detail?: string): void {
  gagal++
  console.log(`  ${merah("X ")} ${pesan}`)
  if (detail) console.log(`     ${detail}`)
}

/* ══════════════════════════════════════════════════════════════════
 *  1. Kontrak izin harus sama di browser & server
 * ══════════════════════════════════════════════════════════════════ */

console.log(`\n${tebal("1. KONTRAK IZIN (browser vs server)")}`)

const access = baca("src/lib/access.ts")
const server = baca("server/janakaAdminApi.ts")

/**
 * Kunci izin HARUS diambil dari badan interface/objek izin saja.
 *
 * `access.ts` punya banyak `xxx: boolean` lain (`AppUser.isActive`, dll).
 * Kalau dipindai seluruh berkas, `isActive` ikut terhitung sebagai izin dan
 * dilaporkan "tidak ada di server" — laporan palsu yang train nada.
 */
function kunciIzinDari(teks: string, penanda: RegExp): string[] {
  const mulai = teks.search(penanda)
  if (mulai < 0) return []
  // Ambil sampai kurung kurawal penutup tingkat pertama.
  const dariKurung = teks.indexOf("{", mulai)
  let depth = 0
  let akhir = -1
  for (let i = dariKurung; i < teks.length; i++) {
    if (teks[i] === "{") depth++
    else if (teks[i] === "}") {
      depth--
      if (depth === 0) {
        akhir = i
        break
      }
    }
  }
  if (akhir < 0) return []
  return [...teks.slice(dariKurung, akhir).matchAll(/^\s{2}([a-zA-Z][\w]*): (?:boolean|true|false)\s*[,;]?\s*$/gm)].map(
    (m) => m[1],
  )
}

const kunciIzin = kunciIzinDari(access, /interface AppPermissions/)
const kunciServer = kunciIzinDari(server, /DEFAULT_ADMIN_PERMISSIONS\s*(?::[^=]*)?=/)

if (kunciIzin.length === 0) {
  tidakOk("Tidak bisa membaca daftar izin dari `src/lib/access.ts`.")
} else {
  const hanyaBrowser = kunciIzin.filter((k) => !kunciServer.includes(k))
  const hanyaServer = kunciServer.filter((k) => !kunciIzin.includes(k))

  if (hanyaBrowser.length === 0 && hanyaServer.length === 0) {
    ok(`${kunciIzin.length} kunci izin identik di kedua sisi.`)
  } else {
    if (hanyaBrowser.length) {
      tidakOk(
        `Izin ada di browser tapi tidak di server: ${hanyaBrowser.join(", ")}.`,
        "Server akan menolak menu yang browser masih perlakukan boleh.",
      )
    }
    if (hanyaServer.length) {
      tidakOk(`Izin ada di server tapi tidak di browser: ${hanyaServer.join(", ")}.`)
    }
  }
}

/** Izin wajib & khusus-admin harus persis sama di kedua sisi. */
for (const [label, pola] of [
  ["IZIN_WAJIB", /IZIN_WAJIB[^=]*=\s*(?:keyof AppPermissions\s*)?\[\s*([^\]]*)\]/s],
  [
    "PERMISSION_KHUSUS_ADMIN",
    /PERMISSION_KHUSUS_ADMIN[^=]*=\s*(?:\(keyof AppPermissions\)\?\s*)?\[\s*([^\]]*)\]/s,
  ],
] as const) {
  const a = access.match(pola)?.[1]?.match(/"([^"]+)"/g)?.map((x) => x.replace(/"/g, ""))
  const b = server.match(pola)?.[1]?.match(/"([^"]+)"/g)?.map((x) => x.replace(/"/g, ""))
  if (!a || !b) {
    tidakOk(`Tidak bisa membaca ${label} dari kedua sisi.`)
  } else if (JSON.stringify(a) === JSON.stringify(b)) {
    ok(`${label} sama: ${a.join(", ") || "(kosong)"}.`)
  } else {
    tidakOk(
      `${label} berbeda.`,
      `browser = [${a.join(", ")}]\n     server  = [${b.join(", ")}]`,
    )
  }
}

/* ══════════════════════════════════════════════════════════════════
 *  2. Rute: semua string harus benar-benar terdaftar
 * ══════════════════════════════════════════════════════════════════ */

console.log(`\n${tebal("2. RUTE")}`)

const routesTs = baca("src/routes/index.tsx")
const terdaftar = new Set(
  [...routesTs.matchAll(/path:\s*"([^"]+)"/g)].map((m) => m[1]),
)

if (terdaftar.has("/dashboard")) {
  ok("`/dashboard` terdaftar sebagai rute ber-parameter.")
} else {
  tidakOk("`/dashboard` tidak terdaftar — beranda harus punya rute sendiri.")
}

if (terdaftar.has("/") && [...routesTs.matchAll(/path: "\/"/g)].length === 1) {
  ok("`/` pengalih, bukan duplikat halaman beranda.")
} else {
  tidakOk("`/` harus tetap ada sebagai pengalih ke `/dashboard`.")
}

/** Kumpulkan rujukan rute berupa string literal di seluruh repo. */
const berkasRute = [
  "src/components/layout/Sidebar.tsx",
  "src/pages/Dashboard.tsx",
  "src/pages/DetailReklame.tsx",
  "src/pages/ReklameList.tsx",
  "src/pages/Mapping.tsx",
  "src/pages/Execution.tsx",
  "src/routes/index.tsx",
  "public/manifest.webmanifest",
]
const polaRute = /(?:to|navigate|url|href|path)\s*[:(=]\s*[`"'](\/[a-z0-9\-/:]*)["'`]/gi

const rujukanBaru: { dari: string; rute: string }[] = []
for (const f of berkasRute) {
  if (!existsSync(join(root, f))) continue
  for (const m of baca(f).matchAll(polaRute)) {
    const rute = m[1]
    if (rute && rute.length > 1) rujukanBaru.push({ dari: f, rute })
  }
}

const cocok = rujukanBaru.filter(({ rute }) => {
  // Strip wildcard `:id` supaya bisa dicocokkan ke pola ber-parameter.
  const pola = rute.replace(/\/:[a-zA-Z_]\w*/g, "/:x")
  for (const t of terdaftar) {
    if (t === rute) return true
    if (t.replace(/\/:[a-zA-Z_]\w*/g, "/:x") === pola) return true
  }
  return false
})

if (cocok.length === rujukanBaru.length) {
  ok(`${rujukanBaru.length} rujukan rute semuanya terdaftar.`)
} else {
  const buruk = rujukanBaru.filter((r) => !cocok.includes(r))
  for (const b of buruk) {
    tidakOk(`Rute tidak terdaftar: "${b.rute}"`, `ditemukan di ${b.dari}`)
  }
}

/* ══════════════════════════════════════════════════════════════════
 *  3. Substitusi service worker harus benar-benar menempel
 * ══════════════════════════════════════════════════════════════════ */

console.log(`\n${tebal("3. SERVICE WORKER")}`)

const swTemplate = baca("src/pwa/sw-template.js")
const swPlugin = baca("vite-plugin-pwa-janaka.ts")

/*
 * Placeholder harus muncul TEBAK SEKALI — persis di baris `const VERSI`.
 *
 * Kalau muncul dua kali (misalnya masih ada di komentar), `replace` biasa
 * hanya mengganti occurrence pertama: yang kena komentar, sedangkan `VERSI`
 * tetap berupa placeholder kosong. Akibatnya `VERSI` nilainya sama di
 * setiap build, cache SW lama tidak pernah dibersihkan, dan service worker
 * bisa menyajikan bundle versi lama.
 */
const jmlPlaceholder = (swTemplate.match(/__JANAKA_BUILD__/g) ?? []).length
const barisVersi = swTemplate.split("\n").find((b) => b.includes("const VERSI")) ?? ""

if (jmlPlaceholder === 1 && barisVersi.includes('"janaka-v__JANAKA_BUILD__"')) {
  ok("Placeholder build ada tepat sekali, di baris `const VERSI`.")
} else {
  tidakOk(
    `Placeholder build muncul ${jmlPlaceholder}x (harusnya 1, di baris \`const VERSI\`).`,
    "Kalau muncul >1, `replace` hanya mengganti yang pertama dan `VERSI` " +
      "tidak berubah antar-build — cache service worker tidak akan pernah dibersihkan.",
  )
}

if (swPlugin.includes(".replaceAll(\"__JANAKA_BUILD__\"")) {
  ok("Plugin memakai replaceAll untuk placeholder build.")
} else {
  tidakOk("Plugin masih memakai `replace` — placeholder kedua akan lolos ke produksi.")
}

/*
 * `index.html` harus dibaca dari disk di `closeBundle`.
 *
 * Di `generateBundle`, `bundle["index.html"]` belum ada — HTML diproses di
 * pipeline `post`. Membacanya di sana selalu `undefined` → hash string
 * kosong → `revision` beku → digest precache beku → service worker tidak
 * pernah tahu ada versi baru dan terus menyajikan shell lama.
 */
if (
  /closeBundle\(\)/.test(swPlugin) &&
  /readFileSync\(INDEX_HTML/.test(swPlugin) &&
  !/hashIsi\(bundle\["index\.html"\]\)/.test(swPlugin)
) {
  ok("sw.js ditulis di closeBundle dan index.html di-hash dari disk.")
} else {
  tidakOk(
    "index.html di-hash dari `bundle` (selalu undefined) atau sw.js ditulis terlalu awal — digest cache service worker akan beku.",
  )
}

// `hashIsi` harus membaca `.source` (asset: CSS/HTML/gambar), bukan hanya
// `.code` (chunk JS). Tanpa itu semua asset mendapat hash string kosong.
const helperHash = swPlugin.match(/function hashIsi\([\s\S]*?\n}/)?.[0] ?? ""
if (/"source" in chunk/.test(helperHash)) {
  ok("hashIsi membaca .source (asset) selain .code (chunk).")
} else {
  tidakOk("hashIsi hanya membaca .code — asset seperti index.html & CSS akan selalu beku.")
}

// Setiap pola `.replace(pola, ...)` harus benar-benar ada di template.
// Hanya `.replace(`, BUKAN `.replaceAll(` — yang ini menyisipkan blok kode.
const polaReplace = [...swPlugin.matchAll(/(?<!\.replaceAll)\.replace\(\s*(`[\s\S]*?`|"[^"]*")\s*,/g)].map((m) => m[1])
let cocokSemua = true
for (const p of polaReplace) {
  const isi = p.startsWith("`") ? p.slice(1, -1) : p.slice(1, -1)
  if (isi.startsWith("const CACHE_ASET")) continue // sudah disisipkan, bukan teks asli
  if (!swTemplate.includes(isi)) {
    tidakOk(
      "Blok yang akan disisipkan tidak ditemukan di `sw-template.js`.",
      `Pola: ${isi.split("\n")[0]}…\n     Plugin tidak akan menyisipkan apa pun.`,
    )
    cocokSemua = false
  }
}
if (cocokSemua && polaReplace.length > 0) {
  ok(`${polaReplace.length} blok substitusi cocok dengan template.`)
}

if (!swTemplate.includes("/offline.html")) {
  ok("Tidak ada rujukan `offline.html` (fallback memakai shell SPA).")
} else {
  tidakOk("`sw-template.js` masih menyebut `/offline.html` — berkasnya sudah dihapus.")
}

/* ══════════════════════════════════════════════════════════════════
 *  4. Tidak ada tautan yang melempar keluar dari aplikasi
 * ══════════════════════════════════════════════════════════════════ */

console.log(`\n${tebal("4. TAUTAN KELUAR")}`)

/*
 * Dokumen dan foto dibuka di modal. Satu pengecualian: tautan SK Digital
 * pada Detail Reklame boleh dibuka di tab baru untuk browser yang menolak embed.
 *
 * Alasannya nyata: petugas membuka SK Digital lalu kembali ke halaman yang
 * sudah bergeser dan harus mencari ulang reklame yang sedang dikerjakan.
 * Dan secara sistem, aplikasi tidak boleh scatter ke domain lain.
 *
 * Google Maps tetap hanya dimuat di iframe. Tautan SK tab baru harus memakai
 * URL proxy JANAKA bila tersedia dan `noopener noreferrer`.
 */
const JEJAK_KELUAR: [RegExp, string][] = [
  [/target\s*=\s*["']_blank["']/, 'target="_blank" membuka tab baru'],
  [/window\.open\s*\(/, "window.open() membuka jendela baru"],
  // Hanya navigasi ke alamat LUAR. `location.href = "/"` berpindah di dalam
  // aplikasi dan itu wajar — tombol "Ke Dashboard" di ErrorBoundary.
  [
    /location\.href\s*=\s*["'`](?:https?:)?\/\//,
    "location.href ke alamat luar",
  ],
  [
    /location\.(?:assign|replace)\s*\(\s*["'`](?:https?:)?\/\//,
    "location.assign ke alamat luar",
  ],
]

/** Berkas yang memang boleh menyebut pola di atas (komentar/jembatan). */
const KECUALIAN = new Set([
  "src/components/common/FotoViewer.tsx",
  "src/components/peta/MappingWithDraw.tsx",
  "src/pages/DetailReklame.tsx",
])

let jumlahKeluar = 0
const semuaBerkas: string[] = []
;(function jalan(dir: string): void {
  for (const e of readdirSync(dir)) {
    if (["node_modules", "dist", "public", ".git", ".vite", ".vercel", "assets"].includes(e)) continue
    // `dir`, bukan `root` — kalau pakai root, rekursi tidak pernah
    // turun ke subdirektori dan hanya berkas level atas yang terlihat.
    const p = join(dir, e)
    if (!existsSync(p)) continue
    if (statSync(p).isDirectory()) jalan(p)
    else if (/\.tsx?$/.test(e)) semuaBerkas.push(p)
  }
})(root)

for (const abs of semuaBerkas) {
  const f = abs.slice(root.length + 1)
  if (KECUALIAN.has(f)) continue
  const baris = baca(f).split("\n")
  baris.forEach((l, i) => {
    // Baris komentar bukan kode.
    const t = l.trim()
    if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return
    for (const [pola, nama] of JEJAK_KELUAR) {
      if (pola.test(l)) {
        jumlahKeluar++
        tidakOk(`${f}:${i + 1}  ${nama}.`, `Gunakan modal yang ada atau tautan dokumen Detail yang aman.`)
      }
    }
  })
}
if (jumlahKeluar === 0) {
  ok("Tidak ada tautan yang membuka tab/jendela baru di seluruh aplikasi.")
}

const detailDokumen = baca("src/pages/DetailReklame.tsx")
if (
  detailDokumen.includes("href={urlDokumenProksi(") &&
  detailDokumen.includes('target="_blank"') &&
  detailDokumen.includes('rel="noopener noreferrer"') &&
  detailDokumen.includes('referrerPolicy="no-referrer"')
) {
  ok("Fallback SK Digital di Detail memakai proxy JANAKA dan atribut tab aman.")
} else {
  tidakOk("Tautan SK tab baru harus memakai proxy JANAKA, no-referrer, dan noopener noreferrer.")
}

/* ══════════════════════════════════════════════════════════════════
 *  5. Konsistensi meta aplikasi
 * ══════════════════════════════════════════════════════════════════ */

console.log(`\n${tebal("5. META APLIKASI")}`)

const fullName = access.match(/APP_FULL_NAME\s*=\s*"([^"]+)"/)?.[1]
if (!fullName) {
  tidakOk("`APP_FULL_NAME` tidak terbaca dari `src/lib/access.ts`.")
} else {
  const carriers = ["index.html", "public/manifest.webmanifest", "public/offline.html"].filter(
    (f) => existsSync(join(root, f)),
  )
  let sama = true
  for (const f of carriers) {
    if (!baca(f).includes(fullName)) {
      tidakOk(`Kepanjangan JANAKA berbeda di ${f}.`, `Harus: "${fullName}"`)
      sama = false
    }
  }
  if (sama) ok(`Kepanjangan JANAKA sama di ${carriers.length} berkas: "${fullName}".`)
}

const robots = baca("public/robots.txt")
const ada404 = existsSync(join(root, "public/offline.html"))
if (!ada404) {
  if (robots.includes("Disallow: /offline.html")) {
    tidakOk("`robots.txt` masih melarang `/offline.html` yang sudah dihapus.")
  } else {
    ok("`robots.txt` tidak merujuk berkas yang sudah dihapus.")
  }
}

/* ══════════════════════════════════════════════════════════════════
 *  6. Function & proxy Vercel
 * ══════════════════════════════════════════════════════════════════ */

console.log(`\n${tebal("6. INTEGRASI VERCEL")}`)

type RuteVercel = {
  src?: string
  dest?: string
  handle?: string
  check?: boolean
  transforms?: { type?: string; target?: { key?: string }; args?: string; env?: string[] }[]
}
type AturanHeader = { source?: string; headers?: { key?: string; value?: string }[] }
type ConfigVercel = {
  functions?: Record<string, { maxDuration?: number; excludeFiles?: string }>
  routes?: RuteVercel[]
  headers?: AturanHeader[]
}

const vercel = JSON.parse(baca("vercel.json")) as ConfigVercel
const ruteVercel = vercel.routes ?? []

/*
 * Dua entry point, satu per kebutuhan:
 *  • `api/ptsp.ts`    → `/api/*` + `/v1/*`   (tanpa firebase-admin)
 *  • `api/janaka.ts`  → `/api/janaka/*`      (firebase-admin)
 *
 * Pemisahan ini bukan kosmetik: `firebase-admin` berukuran ~15 MB dan hanya
 * dibutuhkan oleh rute manajemen akun. Kalau digabung, function PTSP yang
 * paling sering dipanggil ikut membawa 15 MB itu.
 */
const entryPtsp = baca("api/ptsp.ts")
const entryJanaka = baca("api/janaka.ts")
const handlerPtspSrc = baca("server/ptspHandler.ts")
const handlerJanakaSrc = baca("server/janakaHandler.ts")

if (
  entryPtsp.includes('from "../server/ptspHandler.js"') &&
  entryJanaka.includes('from "../server/janakaHandler.js"') &&
  handlerPtspSrc.includes("export default async function handlerPtsp") &&
  handlerJanakaSrc.includes("export default async function handlerJanaka")
) {
  ok("Dua entry point function Vercel — PTSP dipisah dari manajemen akun.")
} else {
  tidakOk("api/ptsp.ts atau api/janaka.ts belum menunjuk handler yang benar.")
}

/*
 * Rute PTSP tidak boleh menyentuh `firebase-admin` sama sekali.
 *
 * `janakaAdminApi.ts` diimpor secara dinamis, tapi file tracer Vercel
 * (`node-file-trace`) tetap mengikuti impor dinamis — jadi SDK ikut ter-bundle
 * walau tidak pernah dieksekusi. Rantai impor dari `api/ptsp.ts` diperiksa
 * sampai ke modul yang mengimpor firebase-admin.
 */
const rantaiPtsp = ["server/ptspHandler.ts", "server/ptspProxy.ts", "api/ptsp.ts"].map((f) => ({
  f,
  // Hanya pernyataan impor yang dihitung; komentar sering menyebut nama paket
  // untuk menjelaskan alasan, dan itu tidak menarik apa pun ke bundle.
  impor: [...baca(f).matchAll(/(?:^|\n)\s*import\s[^;]*?from\s*"[^"]*"|import\("[^"]*"\)/g)]
    .map((m) => m[0])
    .join("\n"),
}))
const bocorFirebase = rantaiPtsp.filter((x) => /janakaAdminApi|firebase-admin/.test(x.impor))
if (bocorFirebase.length === 0) {
  ok("Rantai impor api/ptsp.ts bebas firebase-admin (function PTSP tetap ringan).")
} else {
  tidakOk(
    `Rantai impor api/ptsp.ts menyentuh firebase-admin — function PTSP ikut membawa ~15 MB: ${bocorFirebase
      .map((x) => x.f)
      .join(", ")}`,
  )
}

if (/import\("\.\/janakaAdminApi\.js"\)/.test(handlerJanakaSrc)) {
  ok("firebase-admin hanya di-import dinamis, dari handler janaka.")
} else {
  tidakOk("Handler janaka tidak memakai impor dinamis untuk firebase-admin.")
}

/*
 * `excludeFiles` memangkas source map & deklarasi tipe dari bundle.
 * Di dalam `firebase-admin` saja ada ~8 MB `.map` + `.d.ts` yang tidak
 * pernah dipakai saat runtime.
 */
/*
 * Pola ditulis dalam bentuk brace expansion (`{map,d.ts,…}`), jadi `map` dan
 * `d.ts` tidak diawali titik. Yang dicek adalah keduanya ada di pola.
 */
const polaExclude = vercel.functions?.["api/*.ts"]?.excludeFiles ?? ""
const polaAkanPangkas = /\bmap\b/.test(polaExclude) && /\bd\.ts\b/.test(polaExclude)
if (polaAkanPangkas) {
  ok(`excludeFiles memangkas .map & .d.ts dari bundle (${polaExclude}).`)
} else {
  tidakOk(
    `excludeFiles belum memangkas .map & .d.ts — pola sekarang: "${polaExclude || "(kosong)"}".`,
  )
}

/*
 * Ekstensi `.js` pada impor relatif.
 *
 * Ini bukan gaya penulisan: `server/` + `api/` di-deploy ke Vercel sebagai
 * ESM native (`"type": "module"`), dan ESM menolak impor tanpa ekstensi.
 * Gejalanya muncul saat runtime, bukan saat build:
 *
 *   Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/var/task/server/ptspHandler'
 *   imported from /var/task/api/ptsp.js
 *
 * TypeScript menunjuk ke sumber `.ts`-nya sendiri lewat pemetaan ekstensi,
 * jadi menulis `.js` di sini tetap benar.
 */
const berkasRuntime = [
  "api/ptsp.ts",
  "api/janaka.ts",
  "server/ptspHandler.ts",
  "server/janakaHandler.ts",
  "server/ptspProxy.ts",
  "server/janakaAdminApi.ts",
  "server/index.ts",
  "vite.config.ts",
  "vite-plugin-janaka-api.ts",
]
const imporTanpaEkstensi = berkasRuntime.flatMap((f) => {
  const isi = baca(f)
  const found: string[] = []
  for (const cocok of isi.matchAll(/(?:from|import)\s*\(?\s*"(\.[^"]*)"/g)) {
    const spec = cocok[1]!
    if (!/\.(js|mjs|cjs|json)$/.test(spec)) found.push(`${f} → ${spec}`)
  }
  return found
})
if (imporTanpaEkstensi.length === 0) {
  ok("Semua impor relatif di berkas runtime menyebut ekstensi .js (aman untuk ESM Vercel).")
} else {
  tidakOk(
    `Impor relatif tanpa ekstensi akan gagal di Vercel (ESM): ${imporTanpaEkstensi.join(", ")}`,
  )
}

/*
 * `tsconfig.node.json` berisi komentar, jadi `JSON.parse` tidak bisa
 * dipakai. Yang dibaca hanya dua nilai string, jadi cukup Cari langsung.
 */
const isiTsconfigNode = baca("tsconfig.node.json")
const ambilOpsi = (kunci: string): string =>
  isiTsconfigNode.match(new RegExp(`"${kunci}"\\s*:\\s*"([^"]+)"`))?.[1] ?? ""

if (
  ambilOpsi("moduleResolution") === "nodenext" &&
  ambilOpsi("module") === "NodeNext"
) {
  ok("tsconfig.node.json memakai nodenext, jadi aturan ekstensi ESM ditegakkan saat build.")
} else {
  tidakOk(
    `tsconfig.node.json masih module:${ambilOpsi("module") || "?"} / ` +
      `moduleResolution:${ambilOpsi("moduleResolution") || "?"} — impor tanpa ekstensi bisa lolos ke produksi.`,
  )
}

const sudahAdaFilesystem = ruteVercel.findIndex((r) => r.handle === "filesystem")
const rewriteKeFunction = ruteVercel.filter(
  (r) => (r.dest === "/api/ptsp" || r.dest === "/api/janaka") && r.check === true,
)
const indeksFunctionTerakhir = Math.max(-1, ...rewriteKeFunction.map((r) => ruteVercel.indexOf(r)))
if (
  sudahAdaFilesystem === 0 &&
  rewriteKeFunction.some((r) => r.src === "/api(/.*)?") &&
  rewriteKeFunction.some((r) => r.src === "/v1/(.*)") &&
  rewriteKeFunction.some((r) => r.src === "/api/janaka(/.*)?")
) {
  ok("Rewrite /api/* dan /v1/* diarahkan ke function, setelah cek filesystem.")
} else {
  tidakOk("Rute /api/* dan /v1/* tidak terjangkau function Vercel.")
}

if (
  handlerPtspSrc.includes('path.startsWith("/v1/")') &&
  handlerPtspSrc.includes('path.startsWith("/api/")')
) {
  ok("Proxy PTSP menangani /api/* dan /v1/*.")
} else {
  tidakOk("Handler PTSP belum mencakup /api/* dan /v1/*.")
}

if (handlerJanakaSrc.includes("createJanakaAdminApi")) {
  ok("API JANAKA ditangani server-side lewat Firebase Admin SDK.")
} else {
  tidakOk("Handler janaka tidak memuat API JANAKA.")
}

/*
 * Jaring pengaman: kalau function ternyata tidak ter-deploy, `/api/reklame-items`
 * tetap harus sampai ke PTSP lewat external rewrite — bukan fell ke
 * `index.html` seperti keluhan awal.
 */
const proxyCadanganPtsp = ruteVercel.filter(
  (r) => typeof r.dest === "string" && r.dest.startsWith("https://sprinter.ponorogo.go.id/"),
)
const pengesahApiKey = proxyCadanganPtsp.every(
  (r) =>
    r.transforms?.some(
      (t) =>
        t.type === "request.headers" &&
        t.target?.key === "x-api-key" &&
        t.args === "$PTSP_API_KEY" &&
        t.env?.includes("PTSP_API_KEY"),
    ) ?? false,
)
const menutupiJanaka = proxyCadanganPtsp.some((r) => /\(\?!janaka\|health\)/.test(r.src ?? ""))

/*
 * Urutannya penting: rewrite ke function harus dicoba lebih dulu
 * (`check: true` → kalau tidak ada, dilewati), baru proxy cadangan.
 */
const indeksCadanganPertama = Math.min(
  ...proxyCadanganPtsp.map((r) => ruteVercel.indexOf(r)),
)

if (
  proxyCadanganPtsp.length >= 2 &&
  pengesahApiKey &&
  menutupiJanaka &&
  indeksCadanganPertama > indeksFunctionTerakhir
) {
  ok("Proxy cadangan PTSP ada, di belakang function, dan menyisipkan API key dari env.")
} else {
  tidakOk(
    "Proxy cadangan PTSP tidak lengkap — tanpa function, data PTSP akan jatuh ke index.html.",
  )
}

const klienPtsp = baca("src/services/ptspservice.ts")
/*
 * Pembacaan key & fetch dipindah ke `server/ptspProxy.ts` supaya Vercel
 * dan `npm start` memakai kode yang sama persis.
 */
const proxyPtspSrc = baca("server/ptspProxy.ts")
if (
  // Boleh lewat `process.env.X` langsung atau lewat helper `bacaApiKeyPtsp()`.
  proxyPtspSrc.includes("process.env.PTSP_API_KEY") &&
  proxyPtspSrc.includes("process.env.VITE_PTSP_API_KEY") &&
  !klienPtsp.includes("VITE_PTSP_API_KEY")
) {
  ok("Nama key PTSP lama tetap kompatibel tanpa masuk ke kode browser.")
} else {
  tidakOk("Key PTSP lama tidak kompatibel atau terekspos di kode browser.")
}

/*
 * `/api/health` harus ada di kedua runtime, dan `npm start` harus memakai
 * handler PTSP yang sama dengan Vercel — kalau berbeda, satu jalur bisa
 * bekerja sementara yang lain tidak.
 */
const serverProduksi = baca("server/index.ts")
if (
  proxyPtspSrc.includes("export async function healthPtsp") &&
  handlerPtspSrc.includes('path === "/api/health"') &&
  serverProduksi.includes('from "./ptspHandler.js"')
) {
  ok("Endpoint /api/health tersedia di Vercel maupun server produksi.")
} else {
  tidakOk("Endpoint /api/health belum tersedia di kedua runtime.")
}

if (serverProduksi.includes('from "./janakaAdminApi.js"')) {
  ok("npm start memakai handler yang sama dengan Vercel untuk kedua rute.")
} else {
  tidakOk("npm start tidak memakai handler Vercel — perilakunya bisa berbeda.")
}

/*
 * `/api/janaka/dokumen` mengirim PDF di dalam iframe, jadi harus boleh
 * SAMEORIGIN. Header `X-Frame-Options: DENY` yang berlaku ke semua path
 * akan menimpanya dan pratinjau dokumen tidak pernah tampil.
 */
const aturanHeaderApi = vercel.headers?.find((h) => h.source === "/api/(.*)")
const aturanHeaderShell = vercel.headers?.find(
  (h) => /\(\?!api\//.test(h.source ?? "") && h.headers?.some((x) => x.value === "DENY"),
)

if (
  aturanHeaderApi?.headers?.some((h) => h.key === "X-Frame-Options" && h.value === "SAMEORIGIN") &&
  aturanHeaderApi.headers?.some((h) => h.key === "CDN-Cache-Control" && h.value === "no-store") &&
  aturanHeaderShell
) {
  ok("Header keamanan mengecualikan /api/ dari X-Frame-Options DENY dan tidak meng-cache API.")
} else {
  tidakOk("Header /api/ masih kena DENY, atau respons API bisa ter-cache CDN.")
}

const janakaApiSource = baca("server/janakaAdminApi.ts")
const dokumenUrlSource = baca("src/lib/dokumen.ts")
const detailDokumenSource = baca("src/pages/DetailReklame.tsx")
const proxyDokumenAman =
  janakaApiSource.includes("/v1/legal/signed_dokumen") &&
  janakaApiSource.includes('target.protocol === "http:" && originSah.has(`https://${target.host}`)') &&
  janakaApiSource.includes('redirect: "manual"') &&
  janakaApiSource.includes("originSah.has(berikutnya.origin)") &&
  janakaApiSource.includes('Buffer.from("%PDF-")') &&
  janakaApiSource.includes('"Content-Type", "application/pdf"')
const linkDokumenTabAman =
  dokumenUrlSource.includes("signed_dokumen") &&
  detailDokumenSource.includes("href={urlDokumenProksi(item.urlSK)}") &&
  detailDokumenSource.includes("href={urlDokumenProksi(s.urlSK)}") &&
  detailDokumenSource.includes('target="_blank"') &&
  detailDokumenSource.includes('rel="noopener noreferrer"') &&
  detailDokumenSource.includes('referrerPolicy="no-referrer"')

if (proxyDokumenAman && linkDokumenTabAman) {
  ok("Proxy dokumen membatasi host/redirect, memvalidasi PDF, dan Detail membuka URL proxy yang aman di tab baru.")
} else {
  tidakOk("Jalur dokumen Detail harus memakai proxy tervalidasi dan link tab baru yang aman.")
}

/* ══════════════════════════════════════════════════════════════════
 *  7. Picker waktu 24 jam
 * ══════════════════════════════════════════════════════════════════ */

console.log(`\n${tebal("7. PICKER WAKTU")}`)

const jamPicker = baca("src/components/common/JamPicker.tsx")

/*
 * Empat lapis untuk picker waktu:
 *  1. 24 jam penuh (00–23 / 00–59), tanpa AM/PM bawaan browser yang
 *     menampilkan "12 AM" dan membingungkan petugas lapangan.
 *  2. Dua daftar bisa-gulir — pola dropdown SENAPATI, bukan input spinner.
 *  3. Klik jam/menit hanya mengubah draft; tombol "Pilih" atau klik luar
 *     menerapkan nilai supaya pengguna bisa memilih jam dan menit berurutan.
 *  4. `Esc` membatalkan draft; posisi popup mengikuti resize dan scroll.
 */
const adaDaftar24 = /length: 24/.test(jamPicker) && /length: 60/.test(jamPicker)
const adaRoleAksesibilitas =
  jamPicker.includes('role="listbox"') &&
  jamPicker.includes('role="option"') &&
  jamPicker.includes('aria-selected')
const klikMengubahDraft =
  jamPicker.includes("setDraft(`${dua(n)}:${dua(draftMenit)}`)") &&
  jamPicker.includes("setDraft(`${dua(draftJam)}:${dua(n)}`)")
const adaTombolPilih = />\s*Pilih\s*<\/button>/.test(jamPicker)
const klikLuarMenerapkan =
  /const klikLuar = \(e: Event\)[\s\S]*terapkanDanTutup\(\)/.test(jamPicker) &&
  /const terapkanDanTutup = \(\)[\s\S]*onChange\(draft\)/.test(jamPicker)
const batalDanPosisiStabil =
  jamPicker.includes("pointerdown") &&
  jamPicker.includes('e.key !== "Escape"') &&
  jamPicker.includes('window.addEventListener("resize", hitungPosisi)') &&
  jamPicker.includes('window.addEventListener("scroll", hitungPosisi, true)')

if (
  adaDaftar24 &&
  adaRoleAksesibilitas &&
  klikMengubahDraft &&
  adaTombolPilih &&
  klikLuarMenerapkan &&
  batalDanPosisiStabil &&
  !jamPicker.includes('type="time"')
) {
  ok("Picker waktu: draft 24 jam, tombol Pilih, klik luar menerapkan, dan Esc membatalkan.")
} else {
  tidakOk(
    "Picker waktu harus custom 24 jam dengan draft, tombol Pilih, klik luar menerapkan, dan Esc membatalkan.",
    [
      adaDaftar24 ? null : "• daftar 00–23 / 00–59 belum ada",
      adaRoleAksesibilitas ? null : "• role listbox/option belum ada",
      klikMengubahDraft ? null : "• klik jam/menit belum memperbarui draft",
      adaTombolPilih ? null : "• tombol Pilih belum ada",
      klikLuarMenerapkan ? null : "• klik luar belum menerapkan draft",
      batalDanPosisiStabil ? null : "• Esc atau penyesuaian posisi popup belum benar",
    ]
      .filter(Boolean)
      .join("\n     "),
  )
}

/* ══════════════════════════════════════════════════════════════════
 *  8. Loading data PTSP tidak boleh berputar tanpa henti
 * ══════════════════════════════════════════════════════════════════ */

console.log(`\n${tebal("8. LOADING DATA PTSP")}`)

const topbarSource = baca("src/components/layout/Topbar.tsx")
const storeSource = baca("src/hooks/useReklamaStore.ts")
const halamanPemakaiPTSP = [
  "src/pages/Dashboard.tsx",
  "src/pages/Execution.tsx",
  "src/pages/Mapping.tsx",
  "src/pages/ReklameList.tsx",
]
const pemuatanAwalDibatasi = halamanPemakaiPTSP.every((f) =>
  baca(f).includes("lastLoadedAt === null"),
)
if (topbarSource.includes("!loading && !error") && pemuatanAwalDibatasi) {
  ok("Auto-load berhenti setelah error dan tidak mengulang hasil kosong.")
} else {
  tidakOk("Auto-load PTSP berisiko mengulang request tanpa henti.")
}

if (
  storeSource.includes("set({ loading: true, progress: 5, error: null, stale: false })") &&
  storeSource.includes("Pengecekan pembaruan PTSP gagal")
) {
  ok("Probe cache menampilkan loading dan error saat gagal.")
} else {
  tidakOk("Probe cache tidak melaporkan loading/error dengan benar.")
}

const layananPtsp = baca("src/services/ptspservice.ts")
if (
  layananPtsp.includes("timeout: 20000") &&
  layananPtsp.includes("(config.__retry ?? 0) < 1") &&
  proxyPtspSrc.includes("AbortSignal.timeout(18_000)")
) {
  ok("Batas waktu dan retry request PTSP terbatas.")
} else {
  tidakOk("Request PTSP tidak memiliki batas waktu/retry yang terkontrol.")
}

/* ══════════════════════════════════════════════════════════════════
 *  9. Error PTSP harus terlihat oleh pengguna
 * ══════════════════════════════════════════════════════════════════ */

console.log(`\n${tebal("9. DIAGNOSTIK PTSP")}`)

const storeReklame = baca("src/hooks/useReklamaStore.ts")
const topbar = baca("src/components/layout/Topbar.tsx")
if (
  layananPtsp.includes("status === 401") &&
  storeReklame.includes("${pesanGagal}") &&
  topbar.includes('"Gagal"')
) {
  ok("401/API key dan kegagalan PTSP diteruskan ke banner serta Topbar.")
} else {
  tidakOk("Detail kegagalan PTSP masih tersembunyi dari pengguna.")
}

/* ══════════════════════════════════════════════════════════════════ */

console.log("")
if (gagal === 0) {
  console.log(hijau(`Semua ${lulus} pemeriksaan kontrak lulus.`))
  process.exit(0)
} else {
  console.log(merah(`${gagal} pemeriksaan kontrak gagal.`))
  process.exit(1)
}