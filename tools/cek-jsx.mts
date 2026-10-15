/**
 * Cek JSX — komentar yang bocor jadi teks di layar.
 *
 * ## Bug yang menambah alat ini
 * Di `Topbar.tsx` pernah ada dua komentar berturutan. Yang pertama memakai
 * bentuk braced (kita tulis di sini sebagai "buka-kurawal + penanda + tutup")
 * sehingga sudah menutup dirinya sendiri. Baris berikutnya memakai penanda
 * blok polos tanpa kurung kurawal — di dalam anak JSX itu BUKAN komentar,
 * melainkan teks biasa, jadi seluruh paragrafnya tampil di header aplikasi.
 *
 * TypeScript tidak mengeluh. Build hijau. Uji otomatis juga lolos, karena
 * yang dirender memang teks yang sah. Celahnya baru ketahuan setelah dibuka
 * di peramban.
 *
 * Yang dipindai: penanda blok polos yang berdiri sendiri di anak JSX, dan
 * baris lanjutan yang menggantung tanpa pembuka yang belum tertutup.
 */
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"

const root = process.cwd()
const LEWATI = new Set(["node_modules", "dist", ".git", ".vite", ".vercel", "coverage"])

let bocor = 0
const hijau = (s: string): string => `\x1b[32m${s}\x1b[0m`
const merah = (s: string): string => `\x1b[31m${s}\x1b[0m`

const berkas: string[] = []
;(function jalan(dir: string): void {
  for (const e of readdirSync(dir)) {
    if (LEWATI.has(e)) continue
    const p = join(dir, e)
    if (statSync(p).isDirectory()) jalan(p)
    else if (/\.tsx?$/.test(e)) berkas.push(p)
  }
})(root)

/**
 * Cari komentar yang bocor.
 *
 * Dua tanda tangan yang khas:
 *
 *  A. Baris penanda blok polos yang berdiri sendiri, sementara baris
 *     sebelumnya sudah menutup komentar JSX. Pola itu persis bug di atas.
 *
 *  B. Baris yang diawali bintang (lanjutan komentar gaya blok) tanpa
 *     pembuka yang belum tertutup di blok sebelumnya.
 */
function cariBocor(teks: string): { baris: number; isi: string; pola: string }[] {
  const lines = teks.split("\n")
  const hasil: { baris: number; isi: string; pola: string }[] = []

  // Status apakah kita inside a `{/* … */}` comment.
  let dalamKomentarJsx = false

  for (let i = 0; i < lines.length; i++) {
    const mentah = lines[i] ?? ""
    const l = mentah.trim()

    if (dalamKomentarJsx) {
      if (l.endsWith("*/}")) dalamKomentarJsx = false
      continue
    }

    // Pembuka komentar JSX yang sah: `{/*`
    if (/\{\/\*(?![\s\S]*\*\/\})/.test(l) && !l.includes("*/}")) {
      // Baris juga punya penutup di baris yang sama → selesai di sini.
      if (!/\/\*[\s\S]*\*\/\}/.test(l)) dalamKomentarJsx = true
      continue
    }

    // Pola A: `/*` telanjang tepat sesudah `*/}`.
    if (l === "/*") {
      const sebelum = (lines[i - 1] ?? "").trim()
      if (sebelum.endsWith("*/}")) {
        hasil.push({ baris: i + 1, isi: l, pola: "A" })
      }
      continue
    }

    // Pola B: baris lanjutan `* …` yang menggantung di anak JSX.
    if (/^\*\s+\S/.test(l)) {
      const sebelum = (lines[i - 1] ?? "").trim()
      // Baris sebelumnya menutup satu blok — berarti blok ini yatim.
      if (sebelum.endsWith("*/}")) {
        hasil.push({ baris: i + 1, isi: l, pola: "B" })
      }
    }
  }
  return hasil
}

console.log(`\n\x1b[1mKOMENTAR JSX YANG BOCOR KE LAYAR\x1b[0m`)

const total: string[] = []
for (const f of berkas) {
  const hasil = cariBocor(readFileSync(f, "utf8"))
  for (const h of hasil) {
    bocor++
    console.log(
      `  ${merah("X ")} ${relative(root, f)}:${h.baris}  pola ${h.pola}  "${h.isi.slice(0, 40)}"`,
    )
    console.log(`     Komentar di anak JSX wajib dibungkus kurung kurawal: {/* … */}`)
  }
  total.push(relative(root, f))
}

console.log(`\n\x1b[1mRINGKASAN\x1b[0m`)
console.log(`  Berkas .ts/.tsx diperiksa : ${total.length}`)
console.log(`  Komentar bocor           : ${bocor}`)

console.log("")
if (bocor === 0) {
  console.log(hijau(`Tidak ada komentar yang bocor di ${total.length} berkas.`))
  process.exit(0)
} else {
  console.log(merah(`${bocor} komentar bocor ke layar.`))
  process.exit(1)
}