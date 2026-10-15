/**
 * Uji integrasi menyeluruh JANAKA:
 *
 *  0. Halaman login (tampilan + alur masuk)
 *  1. Semua route render tanpa error
 *  2. Tidak ada request API berulang (loop)
 *  3. Data benar-benar tampil (angka bukan 0)
 *  4. Interaksi: filter, pencarian, tab, modal
 *
 * Kredensial diambil dari JANAKA_EMAIL / JANAKA_PASSWORD.
 * Tanpa kredensial, hanya pemeriksaan halaman login yang dijalankan —
 * uji yang butuh sesi dilaporkan sebagai DILEWATI, bukan dianggap gagal.
 */
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
const bar = (n = 74) => console.log(`${"═".repeat(n)}`)
const judul = (t: string) => {
  console.log("")
  bar()
  console.log(`  ${t}`)
  bar()
}

/* ─────────── Helper ─────────── */
async function newPage(): Promise<{ page: Page; errors: string[]; apiCalls: string[] }> {
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 1000 })
  const errors: string[] = []
  const apiCalls: string[] = []
  page.on("console", (m: ConsoleMessage) => {
    const t = m.text()
    if (m.type() !== "error") return
    // 503 dari `/api/janaka/server:status` adalah jawaban yang benar bila
    // Firebase Admin SDK belum dikonfigurasi — bukan cacat aplikasi.
    const asal = m.location?.()?.url ?? ""
    if (/favicon|DevTools/i.test(t)) return
    if (/status of 503/.test(t) && asal.includes("/api/janaka")) return
    errors.push(t)
  })
  page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message}`))
  page.on("response", (r) => {
    const u = r.url()
    if (u.includes("/api/")) apiCalls.push(u.replace(BASE, ""))
  })
  return { page, errors, apiCalls }
}

/**
 * Buka /login lalu masuk bila kredensial tersedia.
 * @returns {Promise<boolean>} true bila sesi aktif dan bisa diuji.
 */
async function masuk(page: Page): Promise<boolean> {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle2", timeout: 45000 })
  await wait(1200)

  const sudahDiDalam = await page.evaluate(() => !/Selamat Datang/.test(document.body.innerText))
  if (sudahDiDalam) return true
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

/* ══════════════════════════════════════════════════════════════════
 *  0. HALAMAN LOGIN
 * ══════════════════════════════════════════════════════════════════ */
judul("0. HALAMAN LOGIN")

let SUDAH_LOGIN = false
{
  const { page, errors } = await newPage()

  // 0a. Tampilan halaman login (selalu diperiksa).
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle2", timeout: 45000 })
  await wait(1500)

  const info = await page.evaluate(() => ({
    diLogin: /Selamat Datang/.test(document.body.innerText),
    email: !!document.querySelector("#email"),
    password: !!document.querySelector("#password"),
    tombol: !!document.querySelector("#login-submit"),
    toggleSandi: !!document.querySelector('button[aria-label*="assword" i]'),
    toggleTema: !!document.querySelector('button[aria-label*="Mode" i]'),
    brand: !!document.querySelector("svg"),
    overflowX: document.documentElement.scrollWidth > window.innerWidth + 2,
  }))

  if (info.diLogin) ok("halaman login tampil (judul 'Selamat Datang')")
  else fail("halaman login tidak tampil")

  if (info.email && info.password && info.tombol)
    ok("form lengkap: email, password, tombol masuk")
  else fail("form login tidak lengkap")

  if (info.toggleSandi) ok("tombol tampil/sembunyikan password ada")
  if (info.toggleTema) ok("toggle tema ada")
  if (info.brand) ok("logo JANAKA tampil")
  if (!info.overflowX) ok("tidak ada overflow horizontal")
  else fail("halaman login melebar melebihi viewport")

  // 0b. Alur masuk.
  if (info.diLogin) {
    SUDAH_LOGIN = await masuk(page)
    if (SUDAH_LOGIN) ok("berhasil masuk ke aplikasi")
    else skip("JANAKA_EMAIL / JANAKA_PASSWORD belum diisi — uji protected dilewati")
  } else {
    // Sudah punya sesi dari storage peramban.
    SUDAH_LOGIN = true
    ok("sesi aktif dari storage peramban")
  }

  if (errors.length) fail(`console error: ${errors[0]?.slice(0, 130)}`)
  await page.close()
}

/* ══════════════════════════════════════════════════════════════════
 *  1. RENDER & DATA PER ROUTE
 * ══════════════════════════════════════════════════════════════════ */
judul("1. RENDER & DATA PER ROUTE")

const ROUTES = [
  { path: "/", name: "Dashboard", expectMarker: "380" },
  { path: "/data-reklame", name: "Data Reklame", expectMarker: "380" },
  { path: "/data-reklame/339", name: "Detail Reklame", expectMarker: "RSU" },
  { path: "/laporan", name: "Laporan Lapangan", expectMarker: null },
  { path: "/rekap", name: "Riwayat Penindakan", expectMarker: null },
  { path: "/mapping", name: "Peta", expectMarker: "274" },
  { path: "/pengaturan", name: "Pengaturan", expectMarker: "Ubah Password" },
  { path: "/pengaturan/pengguna", name: "Manajemen Pengguna", expectMarker: null },
]

if (!SUDAH_LOGIN) skip("seluruh route butuh sesi — dilewati")

for (const r of ROUTES) {
  if (!SUDAH_LOGIN) break
  const { page, errors, apiCalls } = await newPage()
  await page.goto(`${BASE}${r.path}`, { waitUntil: "networkidle2", timeout: 45000 })
  await wait(9000)

  const d = await page.evaluate(() => {
    const t = document.body.innerText
    return {
      error: /Unexpected Application Error|Terjadi Kesalahan/i.test(t),
      ditolak: /Akses Ditolak/.test(t),
      keLogin: location.pathname === "/login",
      tables: document.querySelectorAll("table").length,
      rows: document.querySelectorAll("tbody tr").length,
      markers: document.querySelectorAll("path.leaflet-interactive").length,
      overflowX: document.documentElement.scrollWidth > window.innerWidth + 2,
    }
  })
  const text = await page.evaluate(() => document.body.innerText)

  console.log(`\n  [${r.name}] ${r.path}`)
  if (errors.length) fail(`console error: ${errors[0]?.slice(0, 130)}`)
  if (d.error) fail("layar error tampil")
  if (d.keLogin) fail("diarahkan ke halaman login")
  if (d.ditolak) fail("ditolak guard Although menu diizinkan")

  // Deteksi loop API. Abaikan probe status server, dan anggap penggandaan
  // satu kali sebagai normal (React StrictMode memasang efek dua kali di dev).
  const ptsp = apiCalls.filter((u) => !u.includes("/api/janaka"))
  const uniq = new Set(ptsp)
  const berulang = ptsp.length - uniq.size
  if (berulang > uniq.size + 2)
    fail(`request API berulang (${ptsp.length} call, ${uniq.size} unik)`)

  if (r.expectMarker) {
    if (text.includes(r.expectMarker)) ok(`data tampil (mengandung "${r.expectMarker}")`)
    else fail(`data "${r.expectMarker}" tidak ditemukan di halaman`)
  } else {
    ok("render ok")
  }
  if (d.rows > 0) ok(`${d.tables} tabel, ${d.rows} baris data`)
  if (r.path === "/mapping" && d.markers > 0) ok(`${d.markers} marker peta`)
  if (berulang <= uniq.size + 2)
    ok(`API: ${ptsp.length} call (${uniq.size} unik) — tanpa loop`)
  if (!d.overflowX) ok("tidak ada overflow horizontal")
  else fail("layout melebar melebihi viewport")

  await page.close()
}

/* ══════════════════════════════════════════════════════════════════
 *  2. DETAIL REKLAME
 * ══════════════════════════════════════════════════════════════════ */
judul("2. DETAIL REKLAME — isi halaman")

detail: {
  const { page, errors, apiCalls } = await newPage()
  if (!SUDAH_LOGIN) { skip("butuh sesi"); await page.close(); break detail }
  await page.goto(`${BASE}/data-reklame/339`, { waitUntil: "networkidle2", timeout: 45000 })
  await wait(9000)

  const info = await page.evaluate(() => {
    const t = document.querySelector("main")?.innerText ?? ""
    return {
      tables: document.querySelectorAll("table").length,
      rows: document.querySelectorAll("tbody tr").length,
      text: t.slice(0, 1200),
    }
  })

  // Di mode dev, React StrictMode memasang efek dua kali sehingga setiap
  // request yang sah muncul maksimal 2×. Yang dicari adalah *loop* — yaitu
  // request berulang terus-menerus, bukan satu penggandaan.
  // Yang dicari adalah *loop* — request yang berulang terus-menerus.
  // Store memuat 380 titik dalam 4 halaman, jadi jumlah unik yang besar
  // itu normal; penggandaan satu kali juga normal (StrictMode di dev).
  const ptsp = apiCalls.filter((u) => !u.includes("/api/janaka"))
  const unik = new Set(ptsp)
  const berulang = ptsp.length - unik.size
  console.log(`  API call: ${ptsp.length} total, ${unik.size} unik`)
  if (berulang <= unik.size) ok("tidak ada request berulang")
  else fail(`request berulang: ${ptsp.length} call untuk ${unik.size} unik`)

  if (info.rows > 0) ok(`tabel riwayat SK: ${info.rows} baris`)
  else fail("tabel riwayat SK tidak berisi data")

  console.log(`\n  ── isi halaman ──`)
  console.log(info.text.split("\n").filter(Boolean).map((l) => "  " + l).join("\n"))
  if (errors.length) console.log(`  errors: ${errors.slice(0, 2).join(" | ")}`)
  await page.close()
}

/* ══════════════════════════════════════════════════════════════════
 *  3. INTERAKSI — filter status & pencarian
 * ══════════════════════════════════════════════════════════════════ */
judul("3. INTERAKSI — filter status & pencarian")

interaksi: {
  const { page, errors } = await newPage()
  if (!SUDAH_LOGIN) { skip("butuh sesi"); await page.close(); break interaksi }
  await page.goto(`${BASE}/data-reklame`, { waitUntil: "networkidle2", timeout: 45000 })
  await wait(9000)

  const before = await page.evaluate(() => document.querySelectorAll("tbody tr").length)

  const clicked = await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) =>
      b.textContent.trim().startsWith("Kadaluarsa"),
    )
    if (btn) {
      btn.click()
      return true
    }
    return false
  })
  if (clicked) await wait(1200)
  else fail("tombol filter Kadaluarsa tidak ditemukan")

  const afterFilter = await page.evaluate(() => ({
    rows: document.querySelectorAll("tbody tr").length,
    url: location.search,
    // `i` (case-insensitive) karena Badge memakai `uppercase` — `innerText`
    // mengembalikan teks yang sudah ditransformasi CSS.
    semua: [...document.querySelectorAll("tbody tr")].every((tr) => /kadaluarsa/i.test((tr as HTMLElement).innerText)),
  }))

  if (afterFilter.url.includes("status=Kadaluarsa")) ok(`URL tersinkron: ${afterFilter.url}`)
  else fail(`URL tidak tersinkron: ${afterFilter.url}`)
  if (afterFilter.semua) ok(`semua ${afterFilter.rows} baris berstatus Kadaluarsa`)
  else fail("filter tidak menyaring baris")
  if (afterFilter.rows < before) ok(`baris terfilter: ${before} → ${afterFilter.rows}`)

  await page.type('input[name="search"]', "Alfamart")
  await wait(1800)
  const afterSearch = await page.evaluate(() => ({
    rows: document.querySelectorAll("tbody tr").length,
    text: document.querySelector("tbody")?.innerText?.slice(0, 200) ?? "",
  }))
  if (afterSearch.text.toLowerCase().includes("alfamart") || afterSearch.rows === 0)
    ok(`pencarian "Alfamart" → ${afterSearch.rows} baris`)
  else fail(`pencarian tidak bekerja (${afterSearch.rows} baris)`)

  if (errors.length) fail(`console error saat interaksi: ${errors[0]?.slice(0, 120)}`)
  await page.close()
}

/* ══════════════════════════════════════════════════════════════════
 *  4. LAPORAN LAPANGAN
 * ══════════════════════════════════════════════════════════════════ */
judul("4. LAPORAN LAPANGAN — pilih titik & isi form")

laporan: {
  const { page, errors } = await newPage()
  if (!SUDAH_LOGIN) { skip("butuh sesi"); await page.close(); break laporan }
  await page.goto(`${BASE}/laporan`, { waitUntil: "networkidle2", timeout: 45000 })
  await wait(9000)

  await page.type('input[name="cariReklame"]', "Alfamart")
  await wait(1800)

  const found = await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")].filter((b) => /alfamart/i.test(b.innerText))
    if (btns.length > 0) btns[0].click()
    return btns.length
  })
  if (found > 0) ok(`pencarian menemukan ${found} titik, memilih yang pertama`)
  else fail("pencarian titik reklame tidak menemukan hasil")

  await wait(900)

  const selected = await page.evaluate(() => {
    const t = document.body.innerText
    return {
      hasBadge: /Aktif|Kadaluarsa/.test(t),
      hasGanti: /Ganti titik/.test(t),
      hasSimpan: /Simpan/.test(t),
    }
  })
  if (selected.hasBadge && selected.hasGanti) ok("detail titik terpilih tampil")
  else fail("detail titik tidak tampil")
  if (selected.hasSimpan) ok("ringkasan & tombol simpan tampil")
  else fail("ringkasan tidak tampil")

  // Form laporan hanya Foto Dokumentasi + Catatan Petugas.
  await page.type('textarea[name="catatan"]', "Reklame tidak memiliki SK, dilakukan penicillinaran.")
  await wait(500)

  const adaPetugas = await page.evaluate(() => !!document.querySelector('[name="petugas"]'))
  if (!adaPetugas) ok("field 'Petugas Penanggung Jawab' tidak ada (sesuai spesifikasi)")
  else fail("field petugas masih ada di form laporan")

  const pdfDisabled = await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) =>
      /Cetak Berita Acara/.test(b.textContent),
    )
    return btn ? btn.disabled : null
  })
  if (pdfDisabled === true) ok("tombol PDF nonaktif sebelum ada foto (validasi bekerja)")
  else fail(`tombol PDF seharusnya nonaktif (disabled=${pdfDisabled})`)

  const tabJanaka = await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) => /Tidak Berizin/.test(b.textContent))
    if (btn) btn.click()
    return !!btn
  })
  if (tabJanaka) {
    await wait(1200)
    ok("tab 'Tidak Berizin' tersedia")
  } else fail("tab 'Tidak Berizin' tidak ditemukan")

  const btnTambah = await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) =>
      /Tambah Titik Tidak Berizin/.test(b.textContent),
    )
    if (btn && !btn.disabled) btn.click()
    return !!btn && !btn.disabled
  })
  if (btnTambah) {
    await wait(1500)
    const modal = await page.evaluate(() => !!document.querySelector('[role="dialog"]'))
    if (modal) ok("modal tambah titik tidak berizin terbuka")
    else fail("modal tambah titik tidak terbuka")
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll("button")].find((b) => /Batal/.test(b.textContent))
      btn?.click()
    })
    await wait(800)
  } else {
    skip("tombol tambah titik tidak berizin tidak tersedia (izin/atau server belum siap)")
  }

  await page.goto(`${BASE}/data-reklame/339`, { waitUntil: "networkidle2" })
  await wait(8000)
  const hasBtn = await page.evaluate(() => /Buat Laporan Lapangan/.test(document.body.innerText))
  if (hasBtn) ok("tombol 'Buat Laporan Lapangan' ada di Detail Reklame")
  else fail("tombol buat laporan tidak ada")

  if (errors.length) fail(`console error: ${errors[0]?.slice(0, 120)}`)
  await page.close()
}

/* ══════════════════════════════════════════════════════════════════
 *  5. NAVIGASI SIDEBAR
 * ══════════════════════════════════════════════════════════════════ */
judul("5. NAVIGASI SIDEBAR & TOPBAR")

navigasi: {
  const { page, errors } = await newPage()
  if (!SUDAH_LOGIN) { skip("butuh sesi"); await page.close(); break navigasi }
  await page.goto(`${BASE}/`, { waitUntil: "networkidle2", timeout: 45000 })
  await wait(6000)

  const links = await page.evaluate(() =>
    [...new Set([...document.querySelectorAll('a[href^="/"]')].map((a) => a.getAttribute("href")))],
  )
  console.log(`  tautan sidebar: ${links.join(", ")}`)
  for (const wajib of ["/data-reklame", "/mapping", "/laporan", "/rekap", "/pengaturan"]) {
    if (!links.includes(wajib)) fail(`sidebar tidak memuat ${wajib}`)
  }
  ok("sidebar memuat menu utama + pengaturan")

  for (const href of ["/data-reklame", "/mapping", "/laporan", "/rekap", "/pengaturan", "/"]) {
    await page.goto(`${BASE}${href}`, { waitUntil: "networkidle2", timeout: 30000 })
    await wait(2500)
    const bad = await page.evaluate(() =>
      /Unexpected Application Error|Terjadi Kesalahan/.test(document.body.innerText),
    )
    if (bad) fail(`navigasi ke ${href} → error`)
    else ok(`navigasi ke ${href}`)
  }

  // Menu akun di Topbar.
  await page.goto(`${BASE}/`, { waitUntil: "networkidle2", timeout: 30000 })
  await wait(4000)
  const akun = await page.evaluate(() => {
    const btn = document.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')
    if (btn) btn.click()
    return !!btn
  })
  await wait(700)
  if (akun) {
    const isi = await page.evaluate(() => {
      const m = document.querySelector<HTMLElement>('[role="menu"]')
      return m ? m.innerText : ""
    })
    if (/Profil Saya/.test(isi) && /Keluar/.test(isi)) ok("menu akun berisi Profil, Keluar")
    else fail("isi menu akun tidak lengkap")
  } else fail("tombol menu akun tidak ditemukan di Topbar")

  if (errors.length) fail(`console error: ${errors[0]?.slice(0, 120)}`)
  await page.close()
}

/* ══════════════════════════════════════════════════════════════════
 *  Ringkasan
 * ══════════════════════════════════════════════════════════════════ */
bar()
if (failures === 0) {
  console.log(
    `  ✅ SEMUA UJI LULUS${skipped ? ` · ${skipped} dilewati` : ""} — tidak ada error, loop, atau data kosong`,
  )
} else {
  console.log(`  ❌ ${failures} MASALAH DITEMUKAN${skipped ? ` · ${skipped} dilewati` : ""}`)
}
bar()
console.log()

await browser.close()
process.exit(failures === 0 ? 0 : 1)