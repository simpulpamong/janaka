/**
 * Cek tata letak — menjaga konsistensi antar menu.
 *
 * ## Kenapa perlu
 * Persis pada 1 Oktober 2026 semua halaman sempat punya `padding-top` yang
 * sama (lewat `.poni-konten`), tapi terlihat **tidak** sama: sebagian halaman
 * punya `PageHeader` berisi baris aksi yang melayang di atas, sebagian tidak.
 * Card pertama di sebagian menu terdorong satu baris + satu gap lebih ke bawah — persis keluhan "jarak dengan topbar beda antar menu".
 *
 * TypeScript tidak bisa menangkap ini, dan `vite build` tetap hijau.
 *
 * Yang dijaga di sini:
 *  1. Tidak boleh ada `PageHeader` beraksionya di halaman daftar.
 *  2. Setiap halaman daftar harus mulai dengan elemen konten yang sama.
 *  3. Judul menu tidak boleh diduplikasi di badan halaman (sudah ada di topbar).
 */
import { readFileSync, existsSync } from "node:fs"
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

/**
 * Halaman daftar. `PageHeader` boleh dipakai HANYA di `DetailReklame`, karena
 * di sana isinya bukan nama menu melainkan identitas record (nama pemilik +
 * alamat) yang tidak ada di topbar.
 */
const HALAMAN: { file: string; bolehPageHeader: boolean; pengenal: string }[] = [
  { file: "src/pages/Dashboard.tsx", bolehPageHeader: false, pengenal: "Dashboard" },
  { file: "src/pages/Mapping.tsx", bolehPageHeader: false, pengenal: "Pemetaan Reklame" },
  { file: "src/pages/ReklameList.tsx", bolehPageHeader: false, pengenal: "Data Reklame" },
  { file: "src/pages/Execution.tsx", bolehPageHeader: false, pengenal: "Laporan Lapangan" },
  { file: "src/pages/Riwayat.tsx", bolehPageHeader: false, pengenal: "Rekap Penindakan" },
  { file: "src/pages/Pengaturan.tsx", bolehPageHeader: false, pengenal: "Pengaturan" },
  { file: "src/pages/ManajemenPengguna.tsx", bolehPageHeader: false, pengenal: "Manajemen Pengguna" },
  { file: "src/pages/DetailReklame.tsx", bolehPageHeader: true, pengenal: "Detail Reklame" },
]

console.log(`\n${tebal("BARIS AKSI MELAYANG")}`)

for (const h of HALAMAN) {
  if (!existsSync(join(root, h.file))) continue
  const isi = baca(h.file)

  const adaHeader = /<PageHeader[\s>]/.test(isi)

  if (!h.bolehPageHeader && adaHeader) {
    tidakOk(
      `${h.pengenal} memakai <PageHeader>.`,
      "Baris aksi harus menyatu dengan toolbar di dalam card, bukan melayang di atasnya.",
    )
    continue
  }

  if (h.bolehPageHeader && !adaHeader) {
    ok(`${h.pengenal} boleh punya header, dan memang tidak punya — silakan hapus dari daftar ini.`)
    continue
  }

  ok(`${h.pengenal} mulai langsung dari konten.`)
}

console.log(`\n${tebal("KONSISTENSI GUTTER")}`)

const css = baca("src/index.css")
const punyaPoni = css.includes(".poni-konten")
if (punyaPoni) {
  ok("Gutter halaman ditangani satu kelas (`.poni-konten`).")
} else {
  tidakOk("Kelas `.poni-konten` hilang dari `index.css`.", "Gutter akan melorot ke tiap halaman.")
}

// Setiap halaman daftar harus memakai kelas itu, bukan padding sendiri.
for (const h of HALAMAN) {
  if (!existsSync(join(root, h.file))) continue
  const isi = baca(h.file)
  if (!/<AppLayout/.test(isi)) continue

  /*
   * Hanya elemen paling luar tepat di bawah `<AppLayout>` yang menentukan
   * gutter. Memindai seluruh berkas akan salah Increase: kartu di dalam
   * halaman memang ber-padding, dan itu memang benar.
   */
  /*
   * `<AppLayout ...>` punya atribut berisi arrow function (`onRefresh={() => …}`),
   * dan `=>` memuat `>`. Jadi `[^>]*` tidak bisa dipakai untuk mencari ujung tag.
   * Cukup ambil `className` PERTAMA sesudah `<AppLayout>` muncul.
   */
  const mulai = isi.indexOf("<AppLayout")
  const seteluh = mulai >= 0 ? isi.indexOf('className="', mulai) : -1
  const akhirKutip = seteluh >= 0 ? isi.indexOf('"', seteluh + 12) : -1
  const kelasAkar =
    seteluh >= 0 && akhirKutip > seteluh ? isi.slice(seteluh + 12, akhirKutip) : null
  const adaPaddingSendiri = kelasAkar ? /\b(p|px|py|pt|pb|pl|pr)-[0-9]/.test(kelasAkar) : false

  if (kelasAkar === null) {
    tidakOk(
      `${h.pengenal} tidak punya elemen akar di bawah <AppLayout>.`,
      "Strukturnya berubah — perbarui daftar HALAMAN di alat ini.",
    )
  } else if (adaPaddingSendiri && !h.bolehPageHeader) {
    tidakOk(
      `${h.pengenal} mengimposisi padding sendiri di elemen akarnya.`,
      `className="${kelasAkar}" — biarkan .poni-konten yang mengurus gutter.`,
    )
  } else {
    ok(`${h.pengenal} gutter-nya dari .poni-konten.`)
  }
}

console.log(`\n${tebal("KERANGKA & SIDEBAR")}`)

/* Preferensi ciut harus punya satu sumber dan dipakai oleh shell aplikasi. */
const SUMBER_LEBAR = "src/lib/sidebar.ts"
const PEMBACA = ["src/components/layout/AppLayout.tsx"]

if (!existsSync(join(root, SUMBER_LEBAR))) {
  tidakOk(
    `${SUMBER_LEBAR} tidak ada.`,
    "Lebar sidebar harus punya satu sumber kebenaran untuk shell & kerangka.",
  )
} else {
  ok("Lebar sidebar punya satu sumber (`src/lib/sidebar.ts`).")

  for (const f of PEMBACA) {
    if (!existsSync(join(root, f))) {
      tidakOk(`${f} tidak ditemukan.`)
      continue
    }
    const isi = baca(f)

    if (!/from "@\/lib\/sidebar"/.test(isi)) {
      tidakOk(
        `${f} tidak membaca preferensi dari "@/lib/sidebar".`,
        "Kerangka dan shell bisa berbeda lebar saat sidebar dibuka/diciutkan.",
      )
    } else {
      ok(`${f.split("/").pop()} memakai sumber lebar yang sama.`)
    }

    if (isi.includes('"janaka-sidebar-collapsed"')) {
      tidakOk(
        `${f} menulis kunci penyimpanan sendiri.`,
        'Hapus literal "janaka-sidebar-collapsed" — pakai fungsi di src/lib/sidebar.ts.',
      )
    }
  }

  /* Lebar sidebar harus tetap memiliki pasangan terbuka dan ciut. */
  const sidebar = baca("src/components/layout/Sidebar.tsx")
  const adaTerbuka = sidebar.includes("w-64")
  const adaCiut = sidebar.includes("w-[84px]")
  if (adaTerbuka && adaCiut) {
    ok("Sidebar punya lebar terbuka (w-64) dan ciut (w-[84px]).")
  } else {
    tidakOk(
      "Sidebar tidak punya pasangan lebar w-64 / w-[84px].",
      `terbuka=${adaTerbuka}, ciut=${adaCiut}.`,
    )
  }

  const routeGuards = baca("src/components/layout/RouteGuards.tsx")
  const skeletonRute = [
    "KerangkaDashboard",
    "KerangkaDataReklame",
    "KerangkaDetailReklame",
    "KerangkaLaporan",
    "KerangkaPetaArea",
    "KerangkaRekap",
    "KerangkaPengaturan",
  ]
  if (routeGuards.includes("<FullLoader label=") && routeGuards.includes("FullLoader")) {
    ok("Verifikasi sesi memakai spinner ringan yang mengikuti tema aktif.")
  } else {
    tidakOk("Verifikasi sesi tidak memakai spinner ringan yang mengikuti tema.")
  }
  const kerangkaRoutes = baca("src/components/common/Kerangka.tsx")
  if (skeletonRute.every((nama) => kerangkaRoutes.includes(`function ${nama}`))) {
    ok("Skeleton loading per menu tetap mengikuti bentuk halaman masing-masing.")
  } else {
    tidakOk("Skeleton loading per menu tidak lengkap atau tidak cocok dengan bentuk halaman.")
  }
}

console.log("")
if (gagal === 0) {
  console.log(hijau(`Tata letak konsisten di ${lulus} pemeriksaan.`))
  process.exit(0)
} else {
  console.log(merah(`${gagal} pemeriksaan tata letak gagal.`))
  process.exit(1)
}