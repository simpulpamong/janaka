/** Uji 404, responsivitas, dan kebersihan console JANAKA. */
import puppeteer from "puppeteer-core"
import type { Page, ConsoleMessage } from "puppeteer-core"

const BASE = process.env.BASE_URL || "http://localhost:5173"
const EMAIL = process.env.JANAKA_EMAIL || ""
const PASSWORD = process.env.JANAKA_PASSWORD || ""

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
})

let failures = 0
let skipped = 0
const fail = (m: unknown) => { failures++; console.log(`  ❌ ${m}`) }
const ok = (m: unknown) => console.log(`  ✅ ${m}`)
const skip = (m: unknown) => { skipped++; console.log(`  ⏭️  ${m}`) }
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const judul = (t: string) => {
  console.log("")
  console.log("═".repeat(70))
  console.log(`  ${t}`)
  console.log("═".repeat(70))
}

/** Listener console yang menyaring noise yang memang diharapkan. */
function pasang(page: Page): string[] {
  const errs: string[] = []
  page.on("console", (m: ConsoleMessage) => {
    if (m.type() !== "error") return
    const t = m.text()
    if (/favicon|DevTools|Future Flag|React Router Future/i.test(t)) return
    // 503 dari probe `/api/janaka/server:status` adalah jawaban yang benar
    // ketika Firebase Admin SDK belum dikonfigurasi.
    if (/status of 503/.test(t) && (m.location?.()?.url ?? "").includes("/api/janaka")) return
    errs.push(t)
  })
  page.on("pageerror", (e: Error) => errs.push(`[pageerror] ${e.message}`))
  return errs
}

/** Masuk bila kredensial tersedia; true bila sesi aktif. */
async function masuk(page: Page): Promise<boolean> {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle2", timeout: 45000 })
  await wait(1200)
  if (await page.evaluate(() => !/Selamat Datang/.test(document.body.innerText))) return true
  if (!EMAIL || !PASSWORD) return false
  await page.type("#email", EMAIL)
  await page.type("#password", PASSWORD)
  await Promise.all([
    page.waitForFunction(() => location.pathname !== "/login", { timeout: 20000 }),
    page.click("#login-submit"),
  ])
  await wait(1800)
  return true
}

/* ── 1. Route tidak dikenal → 404 ── */
judul("1. ROUTE TIDAK DIKENAL")
{
  const page = await browser.newPage()
  pasang(page)
  await page.goto(`${BASE}/halaman-yang-tidak-ada`, { waitUntil: "networkidle2" })
  await wait(4000)
  const r = await page.evaluate(() => ({
    text: document.body.innerText,
    overflowX: document.documentElement.scrollWidth > window.innerWidth + 2,
  }))
  if (/404/.test(r.text) && /tidak ditemukan/i.test(r.text)) ok("halaman 404 informatif tampil")
  else fail(`halaman 404 tidak tampil (path: ${r.text.slice(0, 60)})`)
  if (!/Unexpected/.test(r.text)) ok("tidak ada layar error putih")
  if (!r.overflowX) ok("tidak ada overflow horizontal")
  await page.close()
}

/* ── 2. Halaman login ── */
judul("2. HALAMAN LOGIN")
let SUDAH_LOGIN = false
{
  const page = await browser.newPage()
  const errs = pasang(page)
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" })
  await wait(2500)
  const r = await page.evaluate(() => ({
    judul: /Selamat Datang/.test(document.body.innerText),
    overflowX: document.documentElement.scrollWidth > window.innerWidth + 2,
    tinggi: document.body.scrollHeight > window.innerHeight,
  }))
  if (r.judul) ok("judul 'Selamat Datang' tampil")
  if (!r.overflowX) ok("tidak ada overflow horizontal")
  if (r.tinggi) ok("halaman dapat digulir (tidak terpotong di layar pendek)")
  if (errs.length) fail(`console error: ${errs[0]?.slice(0, 120)}`)

  SUDAH_LOGIN = await masuk(page)
  if (SUDAH_LOGIN) ok("berhasil masuk ke aplikasi")
  else skip("JANAKA_EMAIL / JANAKA_PASSWORD belum diisi — uji protected dilewati")
  await page.close()
}

/* ── 3. Layout responsif ── */
judul("3. RESPONSIF (desktop / laptop / tablet / ponsel)")
const VIEWPORTS = [
  { name: "Desktop", w: 1920, h: 1080 },
  { name: "Laptop", w: 1366, h: 768 },
  { name: "Tablet", w: 820, h: 1180 },
  { name: "Ponsel", w: 390, h: 844 },
]

/**
 * Breakpoint sidebar — sama dengan prabawa: `lg` Tailwind = 1024px.
 *
 * Di bawah 1024px sidebar jadi drawer yang dibuka lewat tombol menu, sama
 * seperti proyek referensi. Jadi tablet potret (820px) memang **harus**
 * memakai drawer — itu bukan cacat.
 */
const SIDEBAR_LEBAR_PADA = 1024

if (!SUDAH_LOGIN) skip("butuh sesi — responsif halaman dalam dilewati")

for (const v of VIEWPORTS) {
  const page = await browser.newPage()
  pasang(page)
  await page.setViewport({ width: v.w, height: v.h })
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" })
  await wait(1500)
  if (SUDAH_LOGIN) {
    await page.goto(`${BASE}/`, { waitUntil: "networkidle2" })
    await wait(7000)
  }

  const r = await page.evaluate(() => {
    const doc = document.documentElement
    const sidebar = document.querySelector("aside")
    const asideRect = sidebar?.getBoundingClientRect()
    return {
      overflowX: doc.scrollWidth > doc.clientWidth + 2,
      scrollW: doc.scrollWidth,
      clientW: doc.clientWidth,
      menuBtn: !!document.querySelector('[aria-label="Buka menu"]'),
      // Sidebar mobile tersembunyi bila seluruhnya di kiri viewport.
      sidebarTersembunyi: asideRect ? asideRect.right <= 1 : null,
      sidebarTerlihat: asideRect ? asideRect.left >= 0 && asideRect.width > 0 : false,
      topbarAda: !!document.querySelector("header"),
      isiAda: (document.querySelector("main")?.innerText ?? "").length > 20,
    }
  })

  const issues = []
  if (r.overflowX) issues.push(`overflow-x (${r.scrollW}>${r.clientW})`)
  if (!r.topbarAda && SUDAH_LOGIN) issues.push("topbar tidak ada")
  if (SUDAH_LOGIN && !r.isiAda) issues.push("konten kosong")

  if (SUDAH_LOGIN) {
    if (v.w < SIDEBAR_LEBAR_PADA) {
      // Drawer: sidebar tersembunyi & ada tombol pembuka.
      if (!r.sidebarTersembunyi) issues.push("drawer sidebar tidak tersembunyi di layar sempit")
      if (!r.menuBtn) issues.push("tombol menu tidak ada di layar sempit")
    } else if (!r.sidebarTerlihat) {
      issues.push("sidebar tidak terlihat di layar lebar")
    }
  }

  const label = `${v.name} ${v.w}×${v.h}`
  if (issues.length === 0) ok(`${label} — bersih`)
  else fail(`${label} — ${issues.join("; ")}`)

  await page.close()
}

/* ── 4. Console error di semua route ── */
judul("4. CONSOLE ERROR PER ROUTE")
{
  if (!SUDAH_LOGIN) {
    skip("butuh sesi — dilewati")
  } else {
    const routes = [
      "/",
      "/data-reklame",
      "/data-reklame/339",
      "/laporan",
      "/rekap",
      "/mapping",
      "/pengaturan",
      "/pengaturan/pengguna",
    ]
    const semua = []
    for (const route of routes) {
      const page = await browser.newPage()
      await page.setViewport({ width: 1440, height: 900 })
      const errs = pasang(page)
      await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" })
      await wait(600)
      if (!(await masuk(page))) {
        await page.close()
        continue
      }
      await page.goto(`${BASE}${route}`, { waitUntil: "networkidle2" })
      await wait(7000)
      if (errs.length) {
        fail(`${route}: ${errs.length} error`)
        errs.slice(0, 2).forEach((e) => console.log(`       · ${e.slice(0, 140)}`))
      } else {
        ok(`${route} — 0 console error`)
      }
      semua.push(...errs)
      await page.close()
    }
    if (semua.length === 0 && routes.length) ok("tidak ada console error di seluruh route")
  }
}

console.log("")
console.log("═".repeat(70))
console.log(
  failures === 0
    ? `  ✅ SEMUA UJI LULUS${skipped ? ` · ${skipped} dilewati` : ""}`
    : `  ❌ ${failures} MASALAH${skipped ? ` · ${skipped} dilewati` : ""}`,
)
console.log("═".repeat(70))
console.log("")

await browser.close()
process.exit(failures === 0 ? 0 : 1)