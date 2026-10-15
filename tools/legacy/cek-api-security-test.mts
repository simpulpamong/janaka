/**
 * Uji keamanan API manajemen akun JANAKA (`/api/janaka/*`).
 *
 * Yang diperiksa:
 *  • Method selain POST ditolak
 *  • Aksi tak dikenal ditolak
 *  • Permintaan tanpa token ditolak 401
 *  • Token JWT palsu ditolak
 *  • Probe status tidak membocorkan kredensial
 *  • Endpoint PTSP (/api/reklame-items) TIDAK tertangkap middleware JANAKA
 *
 * Jalankan saat dev server aktif:
 *   npm run test:api
 */
const BASE = process.env.BASE_URL || "http://localhost:5173"

let failures = 0
const fail = (m: unknown) => { failures++; console.log(`  ❌ ${m}`) }
const ok = (m: unknown) => console.log(`  ✅ ${m}`)
const judul = (t: string) => {
  console.log("")
  console.log("═".repeat(70))
  console.log(`  ${t}`)
  console.log("═".repeat(70))
}

async function post(
  path: string,
  { token, body }: { token?: string; body?: unknown } = {},
): Promise<{ status: number; json: any }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body ?? {}),
  })
  let json: any = null
  try {
    json = await res.json()
  } catch {
    /* biarkan null */
  }
  return { status: res.status, json }
}

judul("1. VALIDASI METHOD & RUTE")

{
  const res = await fetch(`${BASE}/api/janaka/akun:daftar`)
  if (res.status === 405) ok("GET ditolak (405)")
  else fail(`GET seharusnya 405, dapat ${res.status}`)
  await res.text()
}

{
  const res = await fetch(`${BASE}/api/janaka/akun:daftar`, { method: "OPTIONS" })
  if (res.status === 204) ok("OPTIONS dibalas 204")
  else fail(`OPTIONS seharusnya 204, dapat ${res.status}`)
}

{
  const { status, json } = await post("/api/janaka/aksi:yang:tidak:ada")
  if (status === 404 && json?.ok === false) ok(`aksi tak dikenal ditolak: "${json.pesan}"`)
  else fail(`aksi tak dikenal: status ${status}`)
}

judul("2. AUTENTIKASI")

{
  const { status, json } = await post("/api/janaka/akun:daftar")
  if (status === 401) ok("tanpa token ditolak 401")
  else fail(`tanpa token: status ${status}`)
  if (typeof json?.pesan === "string" && json.pesan.length > 0) ok(`pesan: "${json.pesan}"`)
}

{
  const palsu =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOiJ4IiwiZXhwIjo5OTk5OTk5OTk5fQ.palsu"
  const { status } = await post("/api/janaka/akun:daftar", { token: palsu })
  if (status === 401 || status === 503) {
    ok(`token palsu ditolak (${status}${status === 503 ? " — Admin SDK belum dikonfigurasi" : ""})`)
  } else {
    fail(`token palsu seharusnya 401/503, dapat ${status}`)
  }
}

{
  // Header dengan skema aneh harus tetap ditolak.
  const res = await fetch(`${BASE}/api/janaka/akun:daftar`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Basic abc123" },
    body: "{}",
  })
  await res.text()
  if (res.status === 401 || res.status === 503) ok(`header Authorization tak lazim ditolak (${res.status})`)
  else fail(`Authorization "Basic" seharusnya ditolak, dapat ${res.status}`)
}

judul("3. ISI PESAN TIDAK BOCOR")

{
  const { json } = await post("/api/janaka/server:status")
  const teks = JSON.stringify(json ?? {})
  if (/private_key|BEGIN PRIVATE|AIza|apiKey/i.test(teks)) fail("pesan server membocorkan kredensial")
  else ok("pesan status tidak membocorkan kredensial")
  if (json && typeof json.siap === "boolean") ok(`status server terbaca (siap=${json.siap})`)
}

judul("4. PROXY PTSP TIDAK TERSENTUH")

{
  const res = await fetch(`${BASE}/api/reklame-items?page=1&per_page=1`)
  const json = await res.json().catch(() => null)
  if (res.status === 200 && json?.meta?.total > 0) {
    ok(`proxy PTSP tetap jalan (total ${json.meta.total} titik)`)
  } else {
    fail(`proxy PTSP terganggu: status ${res.status}`)
  }
}

judul("5. RUTE LAIN TIDAK DIINTERVENSI")

{
  let status = 0
  try {
    const res = await fetch(`${BASE}/pengaturan`)
    status = res.status
    await res.text()
  } catch {
    status = 0
  }
  if (status === 200) ok("halaman statis /pengaturan dilayani (bukan oleh API)")
  else fail(`halaman statis gagal: status ${status}`)
}

console.log("")
console.log("═".repeat(70))
console.log(failures === 0 ? "  ✅ KEAMANAN API — SEMUA UJI LULUS" : `  ❌ ${failures} MASALAH`)
console.log("═".repeat(70))
console.log("")

process.exit(failures === 0 ? 0 : 1)