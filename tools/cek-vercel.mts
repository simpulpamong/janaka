/**
 * Cek apakah deployment Vercel benar-benar menyalakan function API.
 *
 *   npm run cek:vercel -- janaka-xyz.vercel.app
 *
 * Menguji `/api/health`, `/api/reklame-items`, dan beberapa aset, lalu
 * membandingkan hasilnya dengan `/api/health` yang dijalankan di server
 * lokal. Tujuannya satu: membedakan empat penyebab yang gejalanya sama
 * persis — dashboard kosong, dan tidak ada satupun yang bisa ditebak dari
 * tampilan browser.
 *
 * | Hasil di domain        | Arti                                          |
 * |------------------------|-----------------------------------------------|
 * | JSON, `ok: true`       | Function hidup, PTSP terkirim                 |
 * | JSON, `apiKey.ada:false` | Function hidup, env var belum di-set         |
 * | `text/html` + 200      | Function TIDAK ada — dapat `index.html` SPA   |
 * | 404                    | Deployment tidak ada / build gagal           |
 */

const domainArg = process.argv[2]?.trim()
if (!domainArg) {
  console.error("Pakai: npm run cek:vercel -- <domain>")
  process.exit(1)
}

const domain = /^https?:\/\//.test(domainArg) ? domainArg : `https://${domainArg}`

const HEADER_MINA = [
  "x-vercel-id",
  "x-matched-path",
  "x-vercel-cache",
  "server",
  "x-frame-options",
  "cache-control",
]

/** Header yang menandai request benar-benar menyentuh serverless function. */
function HEADER_MUNCUL(response: Response): string[] {
  const hasil: string[] = []
  for (const nama of HEADER_MINA) {
    const nilai = response.headers.get(nama)
    if (nilai) hasil.push(`${nama}: ${nilai}`)
  }
  return hasil
}

async function probe(pathname: string): Promise<string> {
  const url = new URL(pathname, domain)
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(25_000),
      headers: { Accept: "application/json,text/html,*/*" },
    })
    const tipe = res.headers.get("content-type") ?? "(tanpa content-type)"
    const badan = await res.text()
    const cuplikan = badan.slice(0, 160).replace(/\s+/g, " ")

    console.log(`\n── ${pathname}`)
    console.log(`   status      : ${res.status} ${res.statusText}`)
    console.log(`   content-type: ${tipe}`)
    console.log(`   server      : ${res.headers.get("server") ?? "(tidak ada)"}`)
    const muncul = HEADER_MUNCUL(res)
    if (muncul.length) console.log(`   header      : ${muncul.join(" | ")}`)
    console.log(`   badan       : ${cuplikan}${badan.length > 160 ? "…" : ""}`)

    if (tipe.includes("json")) {
      try {
        const j = JSON.parse(badan) as {
          ok?: unknown
          ptsp?: unknown
          meta?: { total?: number }
          message?: string
        }
        if (j.ptsp) console.log(`   → ptsp      : ${JSON.stringify(j.ptsp)}`)
        if (j.meta?.total !== undefined) console.log(`   → total     : ${j.meta.total}`)
        if (typeof j.ok === "boolean") console.log(`   → ok        : ${j.ok}`)
      } catch {
        /* bukan JSON meski content-type JSON — abaikan */
      }
    }
    return tipe
  } catch (err) {
    console.log(`\n── ${pathname}`)
    console.log(`   GAGAL       : ${err instanceof Error ? err.message : String(err)}`)
    return "error"
  }
}

console.log(`MENGUJI: ${domain}`)

const tipeHealth = await probe("/api/health")
const tipePtsp = await probe("/api/reklame-items?page=1&per_page=1")
const tipeSw = await probe("/sw.js")
const tipeRoot = await probe("/dashboard")

console.log(`\n${"=".repeat(62)}`)
console.log("KESIMPULAN")
console.log("=".repeat(62))

/*
 * Dua kondisi yang harus dinilai BERBEDA:
 *
 *  • `/api/reklame-items` JSON  → data PTSP sampai ke browser. Itu yang
 *    paling penting, bagaimana pun mekanismenya (function atau jaring
 *    pengaman external rewrite).
 *  • `/api/health` JSON         → function juga hidup, jadi `/api/janaka/*`
 *    (manajemen akun) ikut berfungsi.
 */
const ptspJalan = tipePtsp.includes("json")
const functionHidup = tipeHealth.includes("json")

if (ptspJalan) {
  console.log("✅ DATA PTSP JALAN — /api/reklame-items mengembalikan JSON.")
} else if (tipePtsp.includes("html")) {
  console.log("❌ /api/reklame-items mengembalikan index.html → PTSP tidak terjangkau.")
  console.log("   Penyebab yang perlu dicek di dashboard Vercel:")
  console.log("   1. PTSP_API_KEY sudah diisi? Centang All Environments, lalu redeploy.")
  console.log("   2. Build terakhir GAGAL? Deployment lama masih hidup kalau iya.")
  console.log("   3. Project Settings → Root Directory = '' (root repo)?")
  console.log("   4. Deploy ulang dari root: npx vercel --prod --force")
} else if (tipePtsp === "error") {
  console.log("❌ Domain tidak bisa dihubungi. Cek URL-nya.")
} else {
  console.log("❌ /api/reklame-items 404 → deployment tidak ada, atau routes tidak jalan.")
}

if (functionHidup) {
  console.log("\n✅ Function API hidup → /api/janaka/* (manajemen akun) ikut berfungsi.")
} else if (ptspJalan) {
  console.log(
    "\n⚠️  /api/health belum JSON → function Vercel belum ter-deploy.\n" +
      "   Data PTSP aman (lewat jaring pengaman), tapi /api/janaka/* belum\n" +
      "   berfungsi. Cek log build di dashboard Vercel untuk melihat apa\n" +
      "   yang terjadi pada folder api/.",
  )
}

if (tipeSw.includes("javascript") && tipeRoot.includes("html")) {
  console.log("\n✅ Aset statis & shell SPA disajikan normal.")
} else {
  console.log("\n⚠️  Periksa juga aset statis di atas.")
}
