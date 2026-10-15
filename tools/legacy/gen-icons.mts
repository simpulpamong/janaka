/**
 * Generator ikon PWA JANAKA.
 *
 * Satu sumber logo (`public/assets/icon-512.png`) diturunkan menjadi seluruh
 * ukuran yang dibutuhkan peramban. Dibangkitkan lewat peramban, bukan
 * dianotasi manual: menjaga setiap ikon benar-benar sama persis dengan logo
 * resmi tanpa perlu alat gambar.
 *
 * ## Kenapa `maskable` terpisah
 * Android boleh memotong ikon jadi lingkaran atau squircle saat diletakkan di
 * layar utama. Area aman yang dijamin adalah lingkaran **80%** di tengah.
 * Ikon `any` yang fulfill sampai tepi akan membuat sayap Pegasus terpotong —
 * jadi varian `maskable` mengecilkan emblem jadi 80% di atas latar hijau tua
 * yang sama dengan warna dalam logonya.
 *
 * ## Kenapa Apple Touch diberi latar
 * iOS menempelkan `apple-touch-icon` ke latar putih dan **tidak**campo alpha.
 * Logo JANAKA punya tepi transparan; tanpa latar, hasilnya kotak putih di
 * sekeliling lingkaran hitam-hijau.
 *
 * Jalankan: `npm run gen:icons`
 */
import puppeteer from "puppeteer-core"
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { resolve } from "node:path"

const ROOT = resolve(import.meta.dirname, "..", "..")
const OUT = resolve(ROOT, "public/assets")
const SUMBER = resolve(OUT, "icon-512.png")

/** Hijau tua yang sama dengan warna dalam emblem resmi. */
const LATAR = "#0b3b2e"

/** Chrome untuk headless render. Sesuaikan bila di mesin lain. */
const CHROME =
  process.env.CHROME_PATH ??
  ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"].find(Boolean)

if (!CHROME) {
  console.error(
    "Chrome tidak ditemukan. Set CHROME_PATH=/path/ke/chrome lalu jalankan ulang.",
  )
  process.exit(1)
}

/** Satu varian ikon yang perlu dirender. */
interface TargetIkon {
  nama: string
  size: number
  /** Porsi kanvas yang boleh diisi gambar (0.8 = area aman maskable). */
  padding: number
  /** Warna latar; `undefined` = transparan. */
  latar?: string
}

/** Berapa sisi kanvas yang boleh diisi gambar (0.8 = area aman maskable). */
function html(size: number, data: string, { padding, latar }: TargetIkon): string {
  const sisi = Math.round(size * padding)
  return `<!doctype html><html><body style="margin:0;width:${size}px;height:${size}px;background:${
    latar ?? "transparent"
  };display:flex;align-items:center;justify-content:center;overflow:hidden">
<img src="${data}" style="width:${sisi}px;height:${sisi}px;display:block" />
</body></html>`
}

/** @type {{nama: string; size: number; padding: number; latar?: string}[]} */
const TARGET = [
  { nama: "apple-touch-icon.png", size: 180, padding: 0.86, latar: LATAR },
  { nama: "maskable-512.png", size: 512, padding: 0.8, latar: LATAR },
  { nama: "maskable-192.png", size: 192, padding: 0.8, latar: LATAR },
  { nama: "favicon-32.png", size: 32, padding: 0.94 },
  { nama: "favicon-16.png", size: 16, padding: 0.94 },
]

const data = `data:image/png;base64,${readFileSync(SUMBER).toString("base64")}`
mkdirSync(OUT, { recursive: true })

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
})

try {
  console.log("Membuat ikon PWA dari", SUMBER.replace(`${ROOT}/`, ""))
  for (const t of TARGET) {
    const page = await browser.newPage()
    await page.setViewport({ width: t.size, height: t.size, deviceScaleFactor: 1 })
    await page.setContent(html(t.size, data, t), { waitUntil: "load" })
    const buf = await page.screenshot({ omitBackground: !t.latar, type: "png" })
    writeFileSync(resolve(OUT, t.nama), buf)
    console.log(
      `  ${t.nama.padEnd(24)} ${String(t.size).padStart(3)}×${t.size}  ${(buf.length / 1024).toFixed(1)} KB`,
    )
    await page.close()
  }
  console.log("Selesai.")
} finally {
  await browser.close()
}
