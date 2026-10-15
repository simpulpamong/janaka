/**
 * Cek skala lapisan (`z-index`).
 *
 * ## Bug yang menambah alat ini
 * Dropdown, kalender tanggal, dan menu melayang semuanya di-portal ke
 * `document.body`. Berarti `z-index` mereka bersaing **langsung** dengan
 * overlay modal — bukan dengan elemen induknya.
 *
 * Dulu urutannya terbalik:
 *
 *   dropdown      9 980   ← di bawah
 *   menuLayang    9 990   ← di bawah
 *   modal         10 000
 *
 * Akibatnya setiap dropdown yang dibuka **di dalam modal** muncul di belakang
 * panel gelap — termasuk "Jenis Reklame" pada formulir tambah titik. Bukan
 * bug kecil: kontrol yang praktis tidak terlihat, dan tidak ada apa pun di
 * layar yang memberi tahu kenapa.
 *
 * Yang dijaga di sini: overlay harus selalu lebih tinggi dari modal, dan
 * toast lebih tinggi dari keduanya. Angka yang sama untuk dua peran berbeda membuat
 * urutan render tidak bisa diprediksi.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs"
import { join, relative } from "node:path"

const root = process.cwd()
const zf = "\x1b[0m"
const hijau = (s: string): string => `\x1b[32m${s}${zf}`
const merah = (s: string): string => `\x1b[31m${s}${zf}`
const tebal = (s: string): string => `\x1b[1m${s}${zf}`

let gagal = 0
const catatan: string[] = []

/* ── Skala yang harus berlaku ── */
const MODAL = 10_000
const OVERLAY = 11_000
const TOAST = 12_000

/** Berkas yang menetapkan lapisan, dan peran yang dimainkannya. */
const LAPISAN: { file: string; peran: "modal" | "overlay" | "toast"; wajib: number }[] = [
  { file: "src/components/ui/Modal.tsx", peran: "modal", wajib: MODAL },
  { file: "src/components/ui/Dropdown.tsx", peran: "overlay", wajib: OVERLAY },
  { file: "src/components/ui/DatePicker.tsx", peran: "overlay", wajib: OVERLAY },
  { file: "src/components/ui/menuLayang.ts", peran: "overlay", wajib: OVERLAY },
  { file: "src/components/ui/Toast.tsx", peran: "toast", wajib: TOAST },
]

console.log(`\n${tebal("SKALA LAPISAN")}`)
console.log(`  modal   ${String(MODAL).padStart(6)}`)
console.log(`  overlay ${String(OVERLAY).padStart(6)}   (dropdown, kalender, menu — WAJAB > modal)`)
console.log(`  toast   ${String(TOAST).padStart(6)}`)

/** Semua angka z-index besar yang dipakai di seluruh aplikasi. */
const semuaBerkas: string[] = []
;(function jalan(dir: string): void {
  for (const e of readdirSync(dir)) {
    if (["node_modules", "dist", "public", ".git", ".vite", ".vercel"].includes(e)) continue
    const p = join(dir, e)
    if (!existsSync(p)) continue
    if (statSync(p).isDirectory()) jalan(p)
    else if (/\.tsx?$/.test(e)) semuaBerkas.push(p)
  }
})(root)

console.log(`\n${tebal("CEK PER BERKAS")}`)

for (const lapis of LAPISAN) {
  if (!existsSync(join(root, lapis.file))) {
    gagal++
    console.log(`  ${merah("X ")} ${lapis.file} tidak ada.`)
    continue
  }
  const isi = readFileSync(join(root, lapis.file), "utf8")
  // Hanya nilai dalam konteks kelas (`z-[11000]`), bukan angka lain.
  const dipakai = [...isi.matchAll(/z-\[(\d{4,6})\]/g)].map((m) => Number(m[1]))
  const ada = new Set(dipakai)

  if (ada.size === 0) {
    gagal++
    console.log(`  ${merah("X ")} ${lapis.file} tidak punya z-index bertingkat tinggi.`)
    continue
  }

  const angkatan = [...ada].sort((a, b) => a - b)
  if (lapis.peran === "modal" && angkatan[0]! > OVERLAY) {
    gagal++
    console.log(
      `  ${merah("X ")} ${lapis.file} memakai ${angkatan[0]} — modal tidak boleh di atas overlay.`,
    )
    continue
  }

  if (lapis.peran === "overlay" && angkatan.some((z) => z <= MODAL)) {
    gagal++
    console.log(
      `  ${merah("X ")} ${lapis.file} memakai ${angkatan.join(", ")} — overlay di dalam modal harus > ${MODAL}, kalau tidak ia muncul di belakang panel.`,
    )
    continue
  }

  if (lapis.peran === "toast" && angkatan.some((z) => z < OVERLAY)) {
    gagal++
    console.log(`  ${merah("X ")} ${lapis.file} memakai ${angkatan.join(", ")} — toast harus paling atas.`)
    continue
  }

  console.log(`  ${hijau("OK")} ${lapis.file.padEnd(38)} ${angkatan.join(", ")}`)
}

/* ── Cegah angka yang sama dipakai dua lapisan berbeda ── */
console.log(`\n${tebal("TABRAKAN ANGKA")}`)

const pakaiAngka = new Map<number, string[]>()
for (const lapis of LAPISAN) {
  const p = join(root, lapis.file)
  if (!existsSync(p)) continue
  const isi = readFileSync(p, "utf8")
  for (const m of isi.matchAll(/z-\[(\d{4,6})\]/g)) {
    const z = Number(m[1])
    pakaiAngka.set(z, [...(pakaiAngka.get(z) ?? []), lapis.peran])
  }
}
for (const [z, peran] of [...pakaiAngka].sort((a, b) => a[0] - b[0])) {
  const unik = new Set(peran)
  if (unik.size > 1) {
    catatan.push(`z-[${z}] dipakai ${peran.length} peran: ${[...unik].join(", ")}`)
  }
}
if (catatan.length === 0) {
  console.log(`  ${hijau("OK")} Tidak ada angka yang dipakai dua lapisan berbeda.`)
} else {
  for (const c of catatan) console.log(`  ${merah("X ")} ${c}`)
}

/* ── Lapisan besar yang belum terdaftar ── */
console.log(`\n${tebal("LAPISAN BESAR LAINNYA")}`)
const dikenal = new Set(LAPISAN.map((l) => l.file))
const lain: string[] = []
for (const abs of semuaBerkas) {
  const isi = readFileSync(abs, "utf8")
  // Hanya nilai >= 1000 yang diperiksa; angka kecil masih aman untuk isi halaman.
  for (const m of isi.matchAll(/z-\[(\d{4,6})\]/g)) {
    if (Number(m[1]) >= 1000) {
      lain.push(`${relative(root, abs)}  z-[${m[1]}]`)
      break
    }
  }
}
const belum = [...new Set(lain)].filter((x) => !dikenal.has(x.split(/\s+/)[0]!))
if (belum.length === 0) {
  console.log(`  ${hijau("OK")} Semua lapisan besar sudah terdaftar.`)
} else {
  for (const b of belum) {
    console.log(`  ${hijau("- ")} ${b}`)
  }
  console.log(`  ${hijau("  (di atas 1000 tapi masih di bawah modal — aman, belum jadi prioritas)")}`)
}

console.log("")
if (gagal === 0) {
  console.log(hijau("Skala lapisan berurutan."))
  process.exit(0)
} else {
  console.log(merah(`${gagal} masalah skala lapisan.`))
  process.exit(1)
}