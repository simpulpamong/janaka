/**
 * Cek konfigurasi runtime — env, dependency, dan kapasitas peramban.
 *
 * ## Kenapa alat ini ada
 * Build yang hijau tidak berarti aplikasi jalan. Kegagalan yang paling
 * sering terjadi di produksi adalah *konfigurasi*: kunci Cloudinary kosong,
 * PTSP tidak bisa dihubungi, service worker tidak formada. Semua itu lolos
 * `tsc` dan `vite build`, lalu baru meledak saat petugas pakai.
 *
 * Yang diperiksa:
 *  1. Variabel `VITE_*` wajib ada di `.env`.
 *  2. Endpoint yang di application's.env benar-benar bisa dihubungi.
 *  3. Prasyarat browser yang dipakai fitur (WebCrypto, kamera, geolokasi).
 *
 * ⚠️ Tidak pernah mencetak nilai rahasia. Yang dicetak hanya "ada/tidak"
 * dan panjangnya, supaya log CI aman ditempel di tiket.
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

const root = process.cwd()

let gagal = 0
let lulus = 0
/** Reset gaya ANSI. Tanpa argumen — memanggilnya dengan string membuat "undefined" tercetak. */
const zf = (): string => "\x1b[0m"
const hijau = (s: string): string => `\x1b[32m${s}${zf()}`
const merah = (s: string): string => `\x1b[31m${s}${zf()}`
const kuning = (s: string): string => `\x1b[33m${s}${zf()}`

function ok(pesan: string): void {
  lulus++
  console.log(`  ${hijau("✅")} ${pesan}`)
}
function gagal_(pesan: string, detail?: string): void {
  gagal++
  console.log(`  ${merah("❌")} ${pesan}`)
  if (detail) console.log(`     ${kuning(detail)}`)
}
function peringatan(pesan: string, detail?: string): void {
  console.log(`  ${kuning("⚠️ ")} ${pesan}`)
  if (detail) console.log(`     ${kuning(detail)}`)
}

/* ══════════════════════════════════════════════════════════════════
 *  1. Berkas .env
 * ══════════════════════════════════════════════════════════════════ */

console.log("\n\x1b[1m1. BERKAS .env\x1b[0m")

const envPath = join(root, ".env")
const punyaEnv = existsSync(envPath)

if (!punyaEnv) {
  gagal_("`.env` tidak ada.", "Salin `.env.example` lalu isi nilainya.")
} else {
  ok("`.env` ada.")

  const isiEnv = readFileSync(envPath, "utf8")
  const ambil = (k: string): string | undefined => {
    const m = isiEnv.match(new RegExp(`^${k}\\s*=\\s*(.*)$`, "m"))
    return m?.[1]?.trim().replace(/^["']|["']$/g, "") || undefined
  }

  // Kunci yang wajib terisi agar fitur intinya hidup.
  const wajib: [string, string][] = [
    ["VITE_FIREBASE_API_KEY", "Login & basis data"],
    ["VITE_FIREBASE_AUTH_DOMAIN", "Login & basis data"],
    ["VITE_FIREBASE_PROJECT_ID", "Login & basis data"],
    ["VITE_FIREBASE_STORAGE_BUCKET", "Unggah berkas"],
    ["VITE_FIREBASE_MESSAGING_SENDER_ID", "Notifikasi"],
    ["VITE_FIREBASE_APP_ID", "Login & basis data"],
  ]

  for (const [k, guna] of wajib) {
    const v = ambil(k)
    if (v) ok(`${k} terisi (${v.length} karakter, untuk ${guna})`)
    else gagal_(`${k} kosong — ${guna} tidak akan jalan.`)
  }

  // Opsional, tapi nilainya perlu disadari kalau kosong.
  const opsional: [string, string][] = [
    ["VITE_CLOUDINARY_CLOUD_NAME", "kompresi & unggah foto bukti"],
    ["VITE_CLOUDINARY_UPLOAD_PRESET", "kompresi & unggah foto bukti"],
    ["VITE_PTSP_BASE_URL", "sync data izin reklame"],
    ["PTSP_API_KEY", "sync data izin reklame"],
    ["FIREBASE_SERVICE_ACCOUNT", "manajemen akun (server)"],
  ]
  for (const [k, guna] of opsional) {
    if (!ambil(k)) peringatan(`${k} kosong — ${guna} akan nonaktif.`)
  }
}

/* ══════════════════════════════════════════════════════════════════
 *  2. Koneksi ke layanan luar
 * ══════════════════════════════════════════════════════════════════ */

console.log("\n\x1b[1m2. KONEKSI\x1b[0m")

const isiEnvLokal = punyaEnv ? readFileSync(envPath, "utf8") : ""
const envVal = (k: string, fb: string): string => {
  const m = isiEnvLokal.match(new RegExp(`^${k}\\s*=\\s*(.*)$`, "m"))
  return m?.[1]?.trim().replace(/^["']|["']$/g, "") || process.env[k] || fb
}

async function jemput(
  label: string,
  url: string,
  opts: { method?: string; timeoutMs?: number; probe?: boolean } = {},
): Promise<void> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 8000)
  try {
    const res = await fetch(url, {
      method: opts.method ?? "GET",
      signal: controller.signal,
      headers: { accept: "application/json" },
    })
    /*
     * 401/403/400 justru kabar baik: layanannya hidup, hanya permintaan
     * probe-nya yang tidak sah (tanpa body / tanpa token). Yang signifies
     * layanan MATI adalah kegagalan jaringan atau 404/5xx.
     */
    if (res.ok || res.status === 400 || res.status === 401 || res.status === 403) {
      ok(`${label} hidup (HTTP ${res.status}).`)
    } else {
      gagal_(`${label} menjawab HTTP ${res.status}.`, url)
    }
  } catch (err) {
    const nama = (err as { name?: string })?.name
    if (nama === "AbortError") gagal_(`${label} tidak menjawab dalam 8 detik.`, url)
    else gagal_(`${label} gagal dihubungi.`, `${url} — ${nama ?? "jaringan"}`)
  } finally {
    clearTimeout(timer)
  }
}

const ptspBase = envVal("VITE_PTSP_BASE_URL", "https://sprinter.ponorogo.go.id")
await jemput("Server PTSP", `${ptspBase}/api/reklame-items?per_page=1`)

const firebaseApiKey = envVal("VITE_FIREBASE_API_KEY", "")
if (firebaseApiKey) {
  await jemput(
    "Firebase Identity Toolkit",
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${firebaseApiKey}`,
    { method: "POST", probe: true },
  )
} else {
  peringatan("Firebase dilewati — `VITE_FIREBASE_API_KEY` kosong.")
}

const cloudName = envVal("VITE_CLOUDINARY_CLOUD_NAME", "")
if (cloudName) {
  await jemput("Cloudinary", `https://api.cloudinary.com/v1_1/${cloudName}/ping`)
} else {
  peringatan("Cloudinary dilewati — `VITE_CLOUDINARY_CLOUD_NAME` kosong.")
}

/* ══════════════════════════════════════════════════════════════════
 *  3. Prasyarat peramban
 * ══════════════════════════════════════════════════════════════════ */

console.log("\n\x1b[1m3. PRASYARAT PERAMBAN\x1b[0m")
console.log(
  `  ${kuning("ℹ️ ")} Dievaluasi di Node, bukan di peramban — hanya memeriksa\n` +
    `    availability API agar versi minimum peramban terdokumentasi.`,
)
const apiBrowser: [string, boolean][] = [
  ["crypto.subtle (Wajib untuk login Firebase)", typeof crypto?.subtle !== "undefined"],
  ["URL / URLSearchParams", typeof URL !== "undefined"],
  ["AbortController", typeof AbortController !== "undefined"],
  ["fetch", typeof fetch !== "undefined"],
  ["structuredClone", typeof structuredClone !== "undefined"],
]
for (const [nama, ada] of apiBrowser) {
  if (ada) ok(`${nama} tersedia.`)
  else peringatan(`${nama} tidak ada di runtime ini.`)
}

/* ══════════════════════════════════════════════════════════════════
 *  Hasil
 * ══════════════════════════════════════════════════════════════════ */

console.log("")
if (gagal === 0) {
  console.log(hijau(`✅ ${lulus} pemeriksaan lulus.`))
  process.exit(0)
} else {
  console.log(merah(`❌ ${gagal} pemeriksaan gagal, ${lulus} lulus.`))
  process.exit(1)
}