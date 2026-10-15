/**
 * Dead code — ekspor yang tidak pernah dipakai, dan berkas yang tidak pernah diimpor.
 *
 * `tsc` dengan `noUnusedLocals`/`noUnusedParameters` sudah menangkap variabel
 * tak terpakai **di dalam satu berkas**. Tapi dua hal tetap lolos:
 *
 *  1. `export` yang tidak dirujuk di mana pun — TypeScript menganggapnya
 *     bagian dari API publik modul, dan tidak ada build step yang mengeluh.
 *  2. **Berkas** yang tidak diimpor siapa pun. lebih berbahaya: di stale-
 *     development file bisa tertinggal hundreds baris berisi logika bisnis
 *     yang sudah tidak dipakai, dan masih lolos build.
 *
 * Yang dihitung di sini:
 *
 * - **Kelas B (dipakai 0x, bahkan di berkasnya sendiri)** — dead code sungguhan.
 *   Harus hilang.
 * - **Kelas A (dipakai hanya di berkasnya sendiri)** — bukan dead code, hanya
 *   `export` yang tidak perlu. Dilaporkan, tidak menggagalkan build.
 * - **Berkas yatim** — tidak diimpor berkas mana pun dan bukan titik masuk.
 *   Ini yang paling mahal kalau dibiarkan: bisa ratusan baris.
 *
 * ## Akar yang tetap dihitung sebagai pemakai
 *
 * Pemakaian yang tidak terlihat sebagai teks harus tetap dihitung, kalau tidak
 * pelakunya salah dihapus:
 *
 *  • Berkas masuk dari `src/main.tsx` (entry Vite).
 *  • Nilai yang dirujuk lewat **string**, bukan import: rute di
 *    `routes/index.tsx`, item menu di `Sidebar.tsx`, nama shortcut PWA.
 *  • Hook khusus uji di `tools/` — sengaja ada supaya skrip uji menjalankan
 *    kode produksi sungguhan. Tanpa menghitungnya, hook itu terbaca sebagai
 *    dead code dan "dibetulkan" dengan menghapus hal yang sedang diuji.
 *  • Nama yang muncul di `index.html`, `vite.config.ts`, plugin Vite, dan
 *    `server/` (dipakai saat runtime, bukan lewat import frontend).
 *
 * ## Batas yang diketahui
 *
 * Pemakaian lewat `Object.keys`, akses via `window`, dan dynamic `import()`
 * dengan variabel tidak terdeteksi. Hasilnya *safe*: perkiraan terlalu sedikit, bukan
 * terlalu banyak — tidak ada berkas hidup yang dilaporkan yatim.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs"
import { join, relative } from "node:path"

/**
 * Pengecualian yang disengaja.
 *
 * Tanpa ini, perkakas titik masuk (`server/index.ts`, `vite.config.ts`) akan
 * selalu dilaporkan sebagai berkas yatim — keduanya memang tidak diimpor,
 * cuma dijalankan. Daftar dipisah ke berkas sendiri supaya alasan tiap
 * pengecualian bisa dibaca saat review, dan supaya menambah pengecualian
 * selalu berarti keputusan sadar.
 */
/** Folder yang isinya bukan kode aplikasi yang boleh jadi titik masuk. */
const LEWATI_DIR = new Set(["node_modules", "dist", ".git", ".vite", ".vercel", "coverage"])

/** Akar repo. */
const root = process.cwd()

/** Berkas masuk — satu-satunya yang boleh tidak diimpor siapa pun. */
const ENTRY = new Set(["src/main.tsx"])

interface Allowlist {
  berkas: Record<string, string>
  ekspor: Record<string, string>
}

const ALLOW_PATH = join(root, "tools", "deadcode-allow.json")
const allow: Allowlist = existsSync(ALLOW_PATH)
  ? (JSON.parse(readFileSync(ALLOW_PATH, "utf8")) as Allowlist)
  : { berkas: {}, ekspor: {} }

/* ══════════════════════════════════════════════════════════════════
 *  1. Kumpulkan seluruh berkas sumber
 * ══════════════════════════════════════════════════════════════════ */

const semuaBerkas: string[] = []

;(function jalan(dir: string): void {
  for (const e of readdirSync(dir)) {
    if (LEWATI_DIR.has(e)) continue
    const p = join(dir, e)
    if (statSync(p).isDirectory()) jalan(p)
    else if (/\.tsx?$/.test(e)) semuaBerkas.push(p)
  }
})(root)

const sumber = new Map<string, string>(semuaBerkas.map((f) => [f, readFileSync(f, "utf8")]))

/**
 * Teks dari luar `src/` yang juga memanggil kode aplikasi.
 *
 * Ini yang mencegah pelakunya salah dihapus. Tanpa daftar ini, misal
 * `ApiHandler` yang hanya dipakai `server/index.ts` akan dilaporkan dead.
 */
const pemakaiLuar: { dari: string; teks: string }[] = []

const berkasLuar = [
  "index.html",
  "vite.config.ts",
  "vite-plugin-janaka-api.ts",
  "vite-plugin-pwa-janaka.ts",
  "tailwind.config.js",
  "server/index.ts",
  "server/janakaAdminApi.ts",
]
for (const f of berkasLuar) {
  const p = join(root, f)
  if (existsSync(p)) pemakaiLuar.push({ dari: f, teks: readFileSync(p, "utf8") })
}

// Skrip uji di `tools/` memanggil hook khusus uji -> hitung sebagai pemakai.
const dirTools = join(root, "tools")
if (existsSync(dirTools)) {
  for (const f of readdirSync(dirTools)) {
    if (!/\.m?tsx?$/.test(f)) continue
    pemakaiLuar.push({ dari: `tools/${f}`, teks: readFileSync(join(dirTools, f), "utf8") })
  }
}

const teksLuar = pemakaiLuar.map((p) => p.teks).join("\n")

/* ══════════════════════════════════════════════════════════════════
 *  2. Ekspor bernama yang tidak terpakai
 * ══════════════════════════════════════════════════════════════════ */

/** Baris yang menjadi deklarasi, supaya tidak terhitung sebagai "pemakaian". */
function hitungPemakaian(teks: string, nama: string, tanpaNamaIni: RegExp): number {
  const disamarkan = teks.replace(tanpaNamaIni, nama)
  return (disamarkan.match(new RegExp(`\\b${nama}\\b`, "g")) ?? []).length
}

const kelasA: string[] = []
const kelasB: string[] = []
let totalEkspor = 0

for (const [f, teks] of sumber) {
  const pola = /^export\s+(?:default\s+)?(?:async\s+)?(function|const|let|var|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/gm

  for (const m of teks.matchAll(pola)) {
    const jenis = m[1]
    const nama = m[2]
    if (!jenis || !nama) continue
    totalEkspor++

    /*
     * Buang blok deklarasi supaya penyebutan di dalam definisi sendiri
     * (tipe balik, parameter bertipe, rekursi) tidak dihitung sebagai pemakaian.
     */
    const polaBlok = new RegExp(
      `^export\\s+(?:default\\s+)?(?:async\\s+)?${jenis}\\s+${nama}\\b[\\s\\S]*?(?=\\n(?:export|import|const|let|var|function|class|interface|type|enum)\\b|\\n\\}|\\n$)`,
      "m",
    )
    const tanpa = teks.replace(polaBlok, "")

    const diSendiri = hitungPemakaian(tanpa, nama, polaBlok)

    let diLuar = 0
    for (const [g, t] of sumber) {
      if (g === f) continue
      diLuar += (t.match(new RegExp(`\\b${nama}\\b`, "g")) ?? []).length
    }
    diLuar += (teksLuar.match(new RegExp(`\\b${nama}\\b`, "g")) ?? []).length

    if (allow.ekspor[`${jenis} ${nama}`]) continue

    const baris = `${relative(root, f)}  ${jenis} ${nama}`
    if (diLuar === 0) {
      if (diSendiri === 0) kelasB.push(`${baris}  — 0 pemakaian total`)
      else kelasA.push(`${baris}  — dipakai ${diSendiri}x hanya di berkas sendiri`)
    }
  }
}

/* ══════════════════════════════════════════════════════════════════
 *  3. Berkas yatim — tidak diimpor siapa pun
 * ══════════════════════════════════════════════════════════════════ */

/**
 * Semua string specifier import yang muncul di mana saja dalam repo.
 *
 * Ditambah dengan bentuk nama berkas telanjang (`./primitives`) supaya
 * `from "@/components/ui/primitives"` tetap cocok.
 */
function kumpulkanSpecifier(): Set<string> {
  const set = new Set<string>()
  const pola = /(?:from|import)\s*\(?\s*["']([^"']+)["']/g

  const semuaTeks = [
    ...[...sumber.values()],
    ...pemakaiLuar.map((p) => p.teks),
    // Skrip/berkas lain di luar `src/` juga boleh mengimpor (mis. seed).
    ...(() => {
      const out: string[] = []
      for (const f of readdirSync(root)) {
        if (f.endsWith(".ts") && !f.startsWith("vite.config")) {
          const p = join(root, f)
          if (statSync(p).isFile()) out.push(readFileSync(p, "utf8"))
        }
      }
      return out
    })(),
  ]

  for (const t of semuaTeks) {
    for (const m of t.matchAll(pola)) {
      const spec = m[1]
      if (spec) set.add(spec)
    }
  }
  return set
}

const specifier = kumpulkanSpecifier()

/** True kalau ada import yang boleh menyelesaikan ke `target`. */
function adaYangMengimpor(target: string): string | null {
  const nama = target.split("/").pop()!.replace(/\.tsx?$/, "")
  const relatif = `./${nama}`

  for (const spec of specifier) {
    // Specifier berawalan `.` → cocokkan path relatif/absolute langsung.
    if (spec.startsWith(".")) {
      const specAbs = join(root, spec)
      if (
        specAbs === target ||
        specAbs.startsWith(`${target}/`) ||
        resolveRel(specAbs) === resolveRel(target)
      ) {
        return spec
      }
      // Import tanpa ekstensi: `./foo` -> `./foo.ts(x)`
      for (const ext of [".ts", ".tsx"]) {
        if (`${specAbs}${ext}` === target) return spec
        if (existsSync(`${specAbs}${ext}`) && resolveRel(`${specAbs}${ext}`) === resolveRel(target)) {
          return spec
        }
      }
    }

    // Specifier alias `@/…` → petakan ke `src/`.
    if (spec.startsWith("@/")) {
      const pAbs = join(root, "src", spec.slice(2))
      for (const ext of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
        if (`${pAbs}${ext}` === target) return spec
      }
    }

    // Specifier ke `src/` dari root (`./src/...`) atau telanjang (`components/...`).
    if (!spec.startsWith(".") && !spec.startsWith("@")) {
      const pAbs = join(root, "src", spec)
      for (const ext of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
        if (`${pAbs}${ext}` === target) return spec
      }
      // Import relatif biasa: `./components/ui/x` -> `src/components/ui/x`
      if (relatif && spec.endsWith(nama)) return spec
    }
  }
  return null
}

function resolveRel(p: string): string {
  return join(root, p)
}

const yatim: string[] = []
for (const f of sumber.keys()) {
  const rel = relative(root, f)
  if (ENTRY.has(rel)) continue
  if (allow.berkas[rel]) continue

  // `vite-env.d.ts` & deklarasi ambient bukan kode runtime.
  if (rel.endsWith("vite-env.d.ts")) continue

  if (adaYangMengimpor(f)) continue

  // Baris basename sebagai cadangan — menangkap import yang ditulis tanpa alias.
  const base = f.split("/").pop()!.replace(/\.tsx?$/, "")
  const disebut = [...sumber.keys()].filter((g) => g !== f).some((g) => {
    const t = sumber.get(g)!
    return new RegExp(`["'][^"']*${base}["']`).test(t)
  })
  if (disebut) continue

  yatim.push(rel)
}

/* ══════════════════════════════════════════════════════════════════
 *  4. Laporan
 * ══════════════════════════════════════════════════════════════════ */

console.log(`Berkas sumber : ${sumber.size}`)
console.log(`Ekspor bernama : ${totalEkspor}`)
console.log(`Pemakai luar  : ${pemakaiLuar.length} berkas`)
console.log(
  `Pengecualian   : ${Object.keys(allow.berkas).length} berkas, ${Object.keys(allow.ekspor).length} ekspor\n`,
)

console.log(`── BERKAS YATIM (${yatim.length}) ──`)
if (yatim.length === 0) {
  console.log("  (tidak ada)")
} else {
  for (const y of yatim) console.log(`  ${y}`)
}

console.log(`\n── KELAS B: DEAD CODE SUNGGUHAN (${kelasB.length}) ──`)
if (kelasB.length === 0) {
  console.log("  (tidak ada)")
} else {
  for (const x of kelasB) console.log(`  ${x}`)
}

console.log(`\n── KELAS A: "export" tidak perlu (${kelasA.length}) ──`)
if (kelasA.length === 0) {
  console.log("  (tidak ada)")
} else {
  for (const x of kelasA) console.log(`  ${x}`)
}

const gagal = yatim.length + kelasB.length
console.log("")
if (gagal === 0) {
  console.log("✅ SEMUA LULUS — tidak ada berkas yatim, tidak ada dead code.")
  process.exit(0)
} else {
  console.log(`❌ ${gagal} masalah: ${yatim.length} berkas yatim, ${kelasB.length} dead code.`)
  console.log("   Perbaiki, atau tandai sengaja dengan baris `// deadcode: nama`.")
  process.exit(1)
}