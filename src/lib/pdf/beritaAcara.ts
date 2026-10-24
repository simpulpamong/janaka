import { jsPDF } from "jspdf"
import type { LaporanPenindakan } from "@/types"
import { formatTanggalLengkap } from "@/utils/format"
import { formatNomorBA } from "@/lib/nomorBA"
import {
  type FormatDokumen,
  type LogoKop,
  DEFAULT_FORMAT_DOKUMEN,
  bacaFormatDokumenCache,
} from "@/lib/formatDokumen"

export interface BeritaAcaraInput {
  laporan: LaporanPenindakan
  nomorSurat?: string
  format?: FormatDokumen
}

/* ══════════════════════════════════════════════════════════════════
 *  Konstanta tata letak
 * ═══════════════════════════════════════════════════════════════════
 *
 *  Font: `helvetica` adalah padanan metrik Arial yang tersedia sebagai
 *  font standar PDF (salah satu dari 14 font inti). Ukurannya sama
 *  panjang per karakter dengan Arial, jadi hasilnya tidak menggeser
 *  tata letak. Memakai "arial" langsung akan gagal karena jsPDF hanya
 *  mengenal font inti kecuali font TTF disematkan sendiri.
 *
 *  Ukuran dasar 12 pt sesuai permintaan — ukuran surat resmi.
 * ══════════════════════════════════════════════════════════════════ */

const FONT_DASAR = "helvetica"
const UKURAN_DASAR = 12

/** Margin kertas A4 — dikunci di semua sisi supaya isi "masuk ke kertas". */
const MARGIN = 20
/** Lebar bidang isi. */
const LEBAR_ISI = 210 - MARGIN * 2

/** Warna teks utama — hitam pekat, bukan abu-abu. */
const HITAM: [number, number, number] = [0, 0, 0]

/** Ambil konfigurasi format; prioritas: parameter → cache → default. */
function ambilFormat(format?: FormatDokumen): FormatDokumen {
  if (format) return format
  return bacaFormatDokumenCache() ?? DEFAULT_FORMAT_DOKUMEN
}

/** Rasio asli gambar, dipakai supaya foto tidak gepeng. */
function rasioGambar(src: string): Promise<number> {
  return new Promise<number>((resolve) => {
    const img = new Image()
    img.onload = () => {
      const r = img.naturalHeight / (img.naturalWidth || 1)
      resolve(Number.isFinite(r) && r > 0 ? r : 0.75)
    }
    img.onerror = () => resolve(0.75)
    img.src = src
  })
}

/**
 * Muat foto bukti sebagai data URL + rasio aslinya.
 *
 * Foto disimpan sebagai URL Cloudinary, dan `doc.addImage` hanya menerima
 * data URL — URL jarak jauh membuat canvas "ternoda" dan diblokir browser.
 * Karena itu foto di-fetch lebih dulu, diubah ke data URL, lalu disisipkan.
 *
 * Foto yang gagal dimuat dilewati, tidak menggagalkan seluruh dokumen.
 */
async function muatFotoBukti(
  laporan: LaporanPenindakan,
): Promise<{ data: string; rasio: number }[]> {
  const hasil: { data: string; rasio: number }[] = []

  for (const foto of laporan.fotoBukti ?? []) {
    try {
      const resp = await fetch(foto.url)
      if (!resp.ok) continue
      const blob = await resp.blob()
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })
      hasil.push({ data: dataUrl, rasio: await rasioGambar(dataUrl) })
    } catch {
      /* foto dilewati */
    }
  }

  return hasil
}

/** Ambil thumbnail persegi foto pertama tiap laporan, dengan batas koneksi. */
async function muatThumbnailRekap(laporan: LaporanPenindakan[]): Promise<(string | null)[]> {
  const hasil: (string | null)[] = Array(laporan.length).fill(null)
  let cursor = 0

  const muatSatu = async (index: number) => {
    const foto = laporan[index]?.fotoBukti?.[0]
    if (!foto?.url) return
    try {
      const response = await fetch(foto.url, { mode: "cors" })
      if (!response.ok) return
      const blob = await response.blob()
      const bitmap = await createImageBitmap(blob)
      const ukuran = 96
      const canvas = document.createElement("canvas")
      canvas.width = ukuran
      canvas.height = ukuran
      const context = canvas.getContext("2d")
      if (!context) {
        bitmap.close()
        return
      }

      const skala = Math.max(ukuran / bitmap.width, ukuran / bitmap.height)
      const lebarSumber = ukuran / skala
      const tinggiSumber = ukuran / skala
      const xSumber = (bitmap.width - lebarSumber) / 2
      const ySumber = (bitmap.height - tinggiSumber) / 2
      const radius = 13
      context.beginPath()
      context.moveTo(radius, 0)
      context.lineTo(ukuran - radius, 0)
      context.arcTo(ukuran, 0, ukuran, radius, radius)
      context.lineTo(ukuran, ukuran - radius)
      context.arcTo(ukuran, ukuran, ukuran - radius, ukuran, radius)
      context.lineTo(radius, ukuran)
      context.arcTo(0, ukuran, 0, ukuran - radius, radius)
      context.lineTo(0, radius)
      context.arcTo(0, 0, radius, 0, radius)
      context.closePath()
      context.clip()
      context.drawImage(bitmap, xSumber, ySumber, lebarSumber, tinggiSumber, 0, 0, ukuran, ukuran)
      bitmap.close()
      hasil[index] = canvas.toDataURL("image/png")
    } catch {
      /* Thumbnail gagal dimuat: kolom tetap menampilkan jumlah fotonya. */
    }
  }

  const pekerja = async () => {
    while (cursor < laporan.length) {
      const index = cursor++
      await muatSatu(index)
    }
  }

  await Promise.all(Array.from({ length: Math.min(6, laporan.length) }, pekerja))
  return hasil
}

/**
 * Gambar KOP (kepala surat).
 *
 * Susunan: logo kiri di tepi kiri, logo kanan di tepi kanan, teks instansi
 * di tengah. Kedua slot logo boleh diisi salah satu saja atau keduanya.
 * Di bawahnya garis ganda hitam — ciri surat resmi.
 *
 * Kembalikan posisi `y` tempat isi surat boleh mulai.
 */
async function gambarKop(
  doc: jsPDF,
  pageWidth: number,
  kop: FormatDokumen["kop"],
): Promise<number> {
  const yAtas = MARGIN
  const tinggiKop = 24

  doc.setTextColor(...HITAM)

  /* ── Logo ── */
  await gambarLogoKop(doc, yAtas, tinggiKop, pageWidth, kop.logoKiri, "kiri")
  await gambarLogoKop(doc, yAtas, tinggiKop, pageWidth, kop.logoKanan, "kanan")

  /* ── Teks instansi ── */
  const tengah = pageWidth / 2
  let yTeks = yAtas + 8

  doc.setFont(FONT_DASAR, "bold")
  doc.setFontSize(13)
  doc.text(kop.instansiBaris1, tengah, yTeks, { align: "center" })
  yTeks += 6

  doc.setFontSize(13)
  doc.text(kop.instansiBaris2, tengah, yTeks, { align: "center" })
  yTeks += 5

  doc.setFont(FONT_DASAR, "italic")
  doc.setFontSize(9)
  doc.text(kop.alamat, tengah, yTeks, { align: "center" })
  yTeks += 4.5
  doc.text(`Telepon ${kop.telepon}`, tengah, yTeks, { align: "center" })

  /* ── Garis ganda ── */
  const yGaris = yAtas + tinggiKop + 4
  doc.setDrawColor(...HITAM)
  doc.setLineWidth(0.7)
  doc.line(MARGIN, yGaris, pageWidth - MARGIN, yGaris)
  doc.setLineWidth(0.25)
  doc.line(MARGIN, yGaris + 1.2, pageWidth - MARGIN, yGaris + 1.2)

  return yGaris + 8
}

/** Satu slot logo pada KOP. Diam kalau URL kosong atau gambar gagal dimuat. */
async function gambarLogoKop(
  doc: jsPDF,
  yAtas: number,
  tinggiKop: number,
  pageWidth: number,
  logo: LogoKop | undefined,
  sisi: "kiri" | "kanan",
): Promise<void> {
  if (!logo?.url) return

  const lebar = Math.max(5, Math.min(60, logo.lebarMm || 20))
  let tinggi = lebar

  try {
    const resp = await fetch(logo.url)
    if (!resp.ok) return
    const blob = await resp.blob()
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
    tinggi = lebar * (await rasioGambar(dataUrl))

    const x = sisi === "kiri" ? MARGIN : pageWidth - MARGIN - lebar
    /* Ratakan secara vertikal dengan blok teks instansi. */
    const yGambar = yAtas + (tinggiKop - tinggi) / 2
    doc.addImage(dataUrl, "PNG", x, yGambar, lebar, tinggi, undefined, "FAST")
  } catch {
    /* logo gagal dimuat — surat tetap dicetak tanpa logo itu */
  }
}

/**
 * Gambar baris `Label : Nilai` tanpa garis tabel.
 *
 * Dipakai untuk bagian identitas. Header tabel ("Uraian | Keterangan")
 * sudah tidak dipakai — label berdiri sendiri sudah cukup jelas dan
 * dokumen jadi jauh lebih bersih.
 */
function barisLabel(
  doc: jsPDF,
  y: number,
  label: string,
  nilai: string,
): number {
  const x = MARGIN

  doc.setFont(FONT_DASAR, "bold")
  doc.setFontSize(UKURAN_DASAR)
  doc.setTextColor(...HITAM)
  doc.text(label, x, y)

  const xNilai = x + 42
  doc.setFont(FONT_DASAR, "normal")
  doc.text(":", x + 36, y)
  const barisNilai = doc.splitTextToSize(nilai || "-", 210 - MARGIN - xNilai) as string[]
  doc.text(barisNilai, xNilai, y)

  return y + 6.5 * barisNilai.length
}

/** Ringkasan rekap dengan titik dua di kolom yang sama. */
function barisRingkasan(doc: jsPDF, y: number, label: string, nilai: string, pageWidth: number): void {
  const x = pageWidth / 2 - 50
  doc.setFont(FONT_DASAR, "normal")
  doc.setFontSize(UKURAN_DASAR)
  doc.text(label, x, y)
  doc.text(":", x + 39, y)
  doc.text(nilai, x + 45, y)
}

/**
 * Gambar blok tanda tangan — satu penandatangan, lurus, masuk kertas.
 *
 * Susunannya: tanggal & kota di kiri bawah, blok tanda tangan di kanan.
 * Garis putus-putus dan nama/NIP lurus di bawahnya. Tidak ada halaman
 * terpisah khusus tanda tangan — ikut mengalir setelah foto.
 */
function gambarTandaTangan(
  doc: jsPDF,
  y: number,
  fmt: FormatDokumen,
  tanggal: string,
): number {
  const p = fmt.penandatangan
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()

  const xKanan = pageWidth - MARGIN
  const lebarBlok = 70
  const xBlok = xKanan - lebarBlok
  doc.setFont(FONT_DASAR, "normal")
  doc.setFontSize(UKURAN_DASAR)
  const barisJabatan = doc.splitTextToSize(p.jabatan || "Penandatangan", lebarBlok) as string[]

  /* Berpindah halaman kalau blok tanda tangan tidak muat. */
  const tinggiBlok = 40 + barisJabatan.length * 5
  if (y + tinggiBlok > pageHeight - MARGIN) {
    doc.addPage()
    y = MARGIN
  }

  y += 6

  /* Tanggal & kota — sejajar kiri blok jabatan. */
  doc.setFont(FONT_DASAR, "normal")
  doc.setFontSize(UKURAN_DASAR)
  doc.setTextColor(...HITAM)
  doc.text(`${fmt.kota}, ${formatTanggalLengkap(tanggal)}`, xBlok, y, { align: "left" })
  y += 7

  /* Jabatan */
  doc.text(barisJabatan, xBlok, y, { align: "left", lineHeightFactor: 1.15 })
  y += Math.max(26, barisJabatan.length * 5 + 12)

  /* Garis tanda tangan */
  doc.setDrawColor(...HITAM)
  doc.setLineWidth(0.3)
  doc.line(xBlok, y, xKanan, y)
  y += 5.5

  /* Nama */
  doc.setFont(FONT_DASAR, "bold")
  doc.text(p.nama || "(nama penandatangan)", xBlok, y, { align: "left" })
  y += 5.5

  /* NIP */
  doc.setFont(FONT_DASAR, "normal")
  doc.text(`NIP. ${p.nip || "................"}`, xBlok, y, { align: "left" })

  return y + 6
}

/** Bangun dokumen Berita Acara Penindakan (PDF). */
export async function createBeritaAcaraPdf({
  laporan,
  nomorSurat,
  format,
}: BeritaAcaraInput): Promise<jsPDF> {
  const fmt = ambilFormat(format)
  const cfg = fmt

  const doc = new jsPDF({ unit: "mm", format: "a4" })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()

  doc.setFont(FONT_DASAR, "normal")
  doc.setTextColor(...HITAM)

  /* ── KOP ── */
  let y = await gambarKop(doc, pageWidth, cfg.kop)

  /* ── Judul ── */
  doc.setFont(FONT_DASAR, "bold")
  doc.setFontSize(13)
  doc.setTextColor(...HITAM)
  doc.text(cfg.judulBA.toUpperCase(), pageWidth / 2, y + 2, { align: "center" })

  y += 8

  doc.setFont(FONT_DASAR, "normal")
  doc.setFontSize(UKURAN_DASAR)
  doc.text(`Nomor: ${formatNomorBA(nomorSurat || laporan.nomorBA, laporan.tanggal)}`, pageWidth / 2, y + 2, {
    align: "center",
  })

  y += 12

  /* ── A. Identitas Titik Reklame ── */
  doc.setFont(FONT_DASAR, "bold")
  doc.setFontSize(UKURAN_DASAR)
  doc.text("A. IDENTITAS TITIK REKLAME", MARGIN, y)
  y += 8

  y = barisLabel(doc, y, "Nama Pemilik", laporan.reklameNama || "-")
  y = barisLabel(doc, y, "Alamat Lokasi", laporan.reklameAlamat || "-")
  y = barisLabel(
    doc,
    y,
    "Koordinat",
    `${Number(laporan.lat).toFixed(6)}, ${Number(laporan.lng).toFixed(6)}`,
  )
  /*
   * Label sumber sengaja "Temuan Lapangan", bukan "JANAKA". Yang dibaca
   * pejabat penandatangan adalah asal data: dari sistem perizinan PTSP
   * atau dari temuan petugas di lapangan. Nama aplikasi tidak menambah
   * apa pun di surat resmi.
   */
  y = barisLabel(
    doc,
    y,
    "Sumber Data",
    laporan.dariJANAKA ? "Temuan Lapangan" : "PTSP",
  )
  y = barisLabel(
    doc,
    y,
    "Tanggal",
    `${formatTanggalLengkap(laporan.tanggal)}${laporan.waktu ? `, ${laporan.waktu}` : ""}`,
  )

  y += 4

  /* ── B. Keterangan ── */
  doc.setFont(FONT_DASAR, "bold")
  doc.setFontSize(UKURAN_DASAR)
  doc.text("B. KETERANGAN", MARGIN, y)
  y += 8

  doc.setFont(FONT_DASAR, "normal")
  const isi = laporan.catatanPetugas?.trim()
  if (isi) {
    const baris = doc.splitTextToSize(isi, LEBAR_ISI) as string[]
    for (const b of baris) {
      if (y > pageHeight - MARGIN) {
        doc.addPage()
        y = MARGIN
      }
      doc.text(b, MARGIN, y)
      y += 6
    }
  } else {
    doc.text("-", MARGIN, y)
    y += 6
  }

  y += 4

  /* ── C. Dokumentasi Foto ──
   *
   *  Foto dimuat async lalu disisipkan sebagai gambar asli. Nama berkas
   *  tidak dicetak — hanya nomor urut. Nama berkas mentah seperti
   *  "Draf_Perbup_Final_Acc.jpg" tidak berarti apa-apa bagi pembaca
   *  dokumen, dan malah membuat dokumen terlihat seperti arsip kerja.
   */
  const jumlahFoto = laporan.fotoBukti?.length ?? 0
  if (jumlahFoto > 0) {
    if (y > pageHeight - 60) {
      doc.addPage()
      y = MARGIN
    }

    doc.setFont(FONT_DASAR, "bold")
    doc.setFontSize(UKURAN_DASAR)
    doc.text("C. DOKUMENTASI FOTO", MARGIN, y)
    y += 8

    const fotos = await muatFotoBukti(laporan)

    if (fotos.length === 0) {
      doc.setFont(FONT_DASAR, "italic")
      doc.setFontSize(10)
      doc.setTextColor(90, 90, 90)
      doc.text(
        "Foto bukti tidak dapat dimuat ke dalam dokumen. Silakan unggah ulang foto pada halaman Riwayat Penindakan.",
        MARGIN,
        y,
        { maxWidth: LEBAR_ISI },
      )
      doc.setTextColor(...HITAM)
      y += 8
    } else {
      /*
       * Dua kolom. Lebar dibagi rata dengan jarak antar foto, tinggi
       * mengikuti rasio asli supaya landscape maupun portrait sama-sama
       * wajar. Batas bawah disisakan untuk caption + footer.
       */
      const kolom = 2
      const jarak = 6
      const lebarFoto = (LEBAR_ISI - jarak * (kolom - 1)) / kolom
      const tinggiCaption = 6

      for (let i = 0; i < fotos.length; i++) {
        const foto = fotos[i]!
        const k = i % kolom
        const tinggiFoto = lebarFoto * foto.rasio

        if (k === 0 && y + tinggiFoto + tinggiCaption > pageHeight - MARGIN) {
          doc.addPage()
          y = MARGIN
        }

        const xFoto = MARGIN + k * (lebarFoto + jarak)

        doc.addImage(foto.data, "JPEG", xFoto, y, lebarFoto, tinggiFoto, undefined, "FAST")

        /* Bingkai tipis hitam — memisahkan foto dari latar putih. */
        doc.setDrawColor(...HITAM)
        doc.setLineWidth(0.2)
        doc.rect(xFoto, y, lebarFoto, tinggiFoto)

        /* Caption: hanya nomor urut, tanpa nama berkas. */
        doc.setFont(FONT_DASAR, "normal")
        doc.setFontSize(9)
        doc.setTextColor(...HITAM)
        doc.text(`Foto ${i + 1}`, xFoto + lebarFoto / 2, y + tinggiFoto + 4, {
          align: "center",
        })

        if (k === kolom - 1 || i === fotos.length - 1) {
          y += tinggiFoto + tinggiCaption + jarak
        }
      }

      y += 2
    }
  }

  /* ── Tanda tangan ── */
  y = gambarTandaTangan(doc, y, fmt, laporan.tanggal)

  return doc
}

/* ══════════════════════════════════════════════════════════════════
 *  REKAPITULASI RIWAYAT PENINDAKAN
 * ══════════════════════════════════════════════════════════════════ */

export interface RekapInput {
  laporan: LaporanPenindakan[]
  judul: string
  periode: string
  format?: FormatDokumen
}

/** Rekapitulasi riwayat penindakan — landscape, satu tabel. */
export async function createRekapPdf({
  laporan,
  judul,
  periode,
  format,
}: RekapInput): Promise<jsPDF> {
  const thumbnails = await muatThumbnailRekap(laporan)
  const fmt = ambilFormat(format)
  const cfg = fmt

  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()

  doc.setFont(FONT_DASAR, "normal")
  doc.setTextColor(...HITAM)

  /* ── KOP ── */
  let y = gambarKopSync(doc, pageWidth, cfg.kop)

  /* ── Judul ── */
  doc.setFont(FONT_DASAR, "bold")
  doc.setFontSize(13)
  doc.text((judul || cfg.judulRekap).toUpperCase(), pageWidth / 2, y + 2, { align: "center" })
  y += 8

  doc.setFont(FONT_DASAR, "normal")
  doc.setFontSize(UKURAN_DASAR)
  barisRingkasan(doc, y, "Periode", periode, pageWidth)
  y += 6
  barisRingkasan(doc, y, "Jumlah Laporan", String(laporan.length), pageWidth)
  y += 10

  /* ── Tabel ──
   *  Kolom mengikuti tabel halaman Riwayat: nomor, tanggal, titik reklame,
   *  koordinat, keterangan, sumber, foto. Garis hitam penuh, header
   *  abu terang — kertas putih polos bergaya surat resmi.
   */
  const baris = laporan.map((l, i) => [
    String(i + 1),
    formatNomorBA(l.nomorBA, l.tanggal),
    formatTanggalLengkap(l.tanggal),
    l.reklameNama || "-",
    `${Number(l.lat).toFixed(5)}, ${Number(l.lng).toFixed(5)}`,
    (l.catatanPetugas || "-").replace(/\s+/g, " "),
    l.dariJANAKA ? "Temuan Lapangan" : "PTSP",
    String(l.fotoBukti?.length ?? 0),
  ])

  const lebarTotal = pageWidth - MARGIN * 2
  const lebarKolom = [8, 45, 30, 46, 34, 62, 24, 12]
  const skala = lebarTotal / lebarKolom.reduce((a, b) => a + b, 0)

  let yTabel = y

  const header = ["No", "Nomor BA", "Tanggal", "Titik Reklame", "Koordinat", "Keterangan", "Sumber", "Foto"]
  const gambarHeaderTabel = (top: number) => {
    doc.setFillColor(240, 240, 240)
    doc.rect(MARGIN, top, lebarTotal, 9, "F")
    doc.setDrawColor(...HITAM)
    doc.setLineWidth(0.3)
    doc.rect(MARGIN, top, lebarTotal, 9)
    doc.setFont(FONT_DASAR, "bold")
    doc.setFontSize(9)
    let xKolom = MARGIN
    header.forEach((h, i) => {
      const w = lebarKolom[i]! * skala
      doc.text(h, xKolom + w / 2, top + 6, { align: "center" })
      if (i > 0) {
        doc.setLineWidth(0.2)
        doc.line(xKolom, top, xKolom, top + 9)
      }
      xKolom += w
    })
  }
  gambarHeaderTabel(yTabel)

  yTabel += 9

  /* Isi */
  doc.setFont(FONT_DASAR, "normal")
  doc.setFontSize(9)

  for (let r = 0; r < baris.length; r++) {
    const data = baris[r]!
    doc.setFont(FONT_DASAR, "normal")
    doc.setFontSize(9)
    const selTeks = data.slice(0, -1).map((nilai, c) => {
      const lebar = lebarKolom[c]! * skala - 4
      return doc.splitTextToSize(String(nilai ?? ""), lebar) as string[]
    })
    const jumlahBarisTeks = Math.max(1, ...selTeks.map((barisSel) => barisSel.length))
    let awalBarisTeks = 0
    let bagianPertama = true

    while (awalBarisTeks < jumlahBarisTeks) {
      let batasBawah = pageHeight - MARGIN - 40
      if (yTabel + 16 > batasBawah) {
        doc.addPage()
        yTabel = MARGIN
        gambarHeaderTabel(yTabel)
        yTabel += 9
        batasBawah = pageHeight - MARGIN - 12
      }

      const ruang = batasBawah - yTabel
      const kapasitasBaris = Math.max(1, Math.floor((ruang - 6) / 4))
      const banyakBaris = Math.min(jumlahBarisTeks - awalBarisTeks, kapasitasBaris)
      const tinggiBaris = Math.max(16, 6 + banyakBaris * 4)

      if (r % 2 === 1) {
        doc.setFillColor(250, 250, 250)
        doc.rect(MARGIN, yTabel, lebarTotal, tinggiBaris, "F")
      }
      doc.setDrawColor(...HITAM)
      doc.setLineWidth(0.2)
      doc.rect(MARGIN, yTabel, lebarTotal, tinggiBaris)

      let x = MARGIN
      for (let c = 0; c < data.length; c++) {
        const w = lebarKolom[c]! * skala
        if (c > 0) doc.line(x, yTabel, x, yTabel + tinggiBaris)

        if (c === data.length - 1) {
          if (bagianPertama) {
            const thumbnail = thumbnails[r]
            const jumlahFoto = Number(data[c]) || 0
            const alas = 10
            const ukuranThumb = 8.6
            const xAlas = x + (w - alas) / 2
            const yAlas = yTabel + (tinggiBaris - alas) / 2
            doc.setFillColor(255, 255, 255)
            doc.setDrawColor(148, 163, 184)
            doc.setLineWidth(0.35)
            doc.roundedRect(xAlas, yAlas, alas, alas, 1.2, 1.2, "FD")
            if (thumbnail) {
              const inset = (alas - ukuranThumb) / 2
              doc.addImage(thumbnail, "PNG", xAlas + inset, yAlas + inset, ukuranThumb, ukuranThumb, undefined, "FAST")
              doc.setDrawColor(100, 116, 139)
              doc.setLineWidth(0.25)
              doc.roundedRect(xAlas + inset, yAlas + inset, ukuranThumb, ukuranThumb, 1, 1, "S")
            } else if (jumlahFoto === 0) {
              doc.setFont(FONT_DASAR, "normal")
              doc.setFontSize(8)
              doc.setTextColor(120, 120, 120)
              doc.text("—", x + w / 2, yTabel + tinggiBaris / 2 + 1, { align: "center" })
            }
            if (jumlahFoto > 1) {
              const badgeW = 5.5
              const badgeH = 4.5
              doc.setFillColor(15, 23, 42)
              doc.roundedRect(x + w - badgeW - 0.4, yTabel + 0.4, badgeW, badgeH, 1.2, 1.2, "F")
              doc.setFont(FONT_DASAR, "bold")
              doc.setFontSize(6.5)
              doc.setTextColor(255, 255, 255)
              doc.text(String(jumlahFoto), x + w - badgeW / 2 - 0.4, yTabel + 3.5, { align: "center" })
            }
            doc.setTextColor(...HITAM)
          }
          x += w
          continue
        }

        const barisSel = selTeks[c] ?? []
        const bagian = barisSel.slice(awalBarisTeks, awalBarisTeks + banyakBaris)
        if (bagian.length > 0) {
          const rata = c === 0 ? "center" : "left"
          const xTeks = rata === "center" ? x + w / 2 : x + 2
          const yTeks = yTabel + Math.max(4, (tinggiBaris - (bagian.length - 1) * 4) / 2 + 2)
          doc.setFont(FONT_DASAR, "normal")
          doc.setFontSize(9)
          doc.text(bagian, xTeks, yTeks, { align: rata, lineHeightFactor: 1.1 })
        }
        x += w
      }

      awalBarisTeks += banyakBaris
      bagianPertama = false
      yTabel += tinggiBaris
    }
  }

  /* ── Tanda tangan ── */
  yTabel += 10
  if (yTabel + 45 > pageHeight - MARGIN) {
    doc.addPage()
    yTabel = MARGIN
  }
  gambarTandaTangan(doc, yTabel, fmt, new Date().toISOString().slice(0, 10))

  return doc
}

/**
 * Versi sinkron `gambarLogoKop` untuk rekap.
 *
 * Rekap dibuat sinkron (tidak perlu menunggu foto), jadi logo hanya bisa
 * disisipkan kalau sudah berupa data URL. Kalau URL Cloudinary, rekap
 * tetap jadi — hanya tanpa logo. BA yang async tetap menampilkannya.
 */
function gambarLogoKopSync(
  doc: jsPDF,
  yAtas: number,
  tinggiKop: number,
  pageWidth: number,
  logo: LogoKop | undefined,
  sisi: "kiri" | "kanan",
): void {
  if (!logo?.url || !logo.url.startsWith("data:")) return

  const lebar = Math.max(5, Math.min(60, logo.lebarMm || 20))
  const tinggi = lebar
  const x = sisi === "kiri" ? MARGIN : pageWidth - MARGIN - lebar
  const yGambar = yAtas + (tinggiKop - tinggi) / 2

  try {
    doc.addImage(logo.url, "PNG", x, yGambar, lebar, tinggi, undefined, "FAST")
  } catch {
    /* logo tidak valid — dilewati */
  }
}

/**
 * Versi sinkron `gambarKop` untuk rekap.
 *
 * Rekap dibuat sinkron (tidak perlu menunggu foto), jadi logo dimuat
 * lebih dulu sekali di awal lalu disisipkan. Kalau logo kosong atau gagal
 * dimuat, rekap tetap jadi — hanya tanpa logo.
 */
function gambarKopSync(
  doc: jsPDF,
  pageWidth: number,
  kop: FormatDokumen["kop"],
): number {
  const yAtas = MARGIN
  const tinggiKop = 24

  doc.setTextColor(...HITAM)

  /* Logo hanya disisipkan kalau sudah berupa data URL (fetch butuh async). */
  gambarLogoKopSync(doc, yAtas, tinggiKop, pageWidth, kop.logoKiri, "kiri")
  gambarLogoKopSync(doc, yAtas, tinggiKop, pageWidth, kop.logoKanan, "kanan")

  const tengah = pageWidth / 2
  let yTeks = yAtas + 8

  doc.setFont(FONT_DASAR, "bold")
  doc.setFontSize(13)
  doc.text(kop.instansiBaris1, tengah, yTeks, { align: "center" })
  yTeks += 6
  doc.text(kop.instansiBaris2, tengah, yTeks, { align: "center" })
  yTeks += 5

  doc.setFont(FONT_DASAR, "italic")
  doc.setFontSize(9)
  doc.text(kop.alamat, tengah, yTeks, { align: "center" })
  yTeks += 4.5
  doc.text(`Telepon ${kop.telepon}`, tengah, yTeks, { align: "center" })

  const yGaris = yAtas + tinggiKop + 4
  doc.setDrawColor(...HITAM)
  doc.setLineWidth(0.7)
  doc.line(MARGIN, yGaris, pageWidth - MARGIN, yGaris)
  doc.setLineWidth(0.25)
  doc.line(MARGIN, yGaris + 1.2, pageWidth - MARGIN, yGaris + 1.2)

  return yGaris + 8
}

/* ── Utilitas ── */

/** Nama file unduhan yang aman. */
export function buildFileName(laporan: LaporanPenindakan): string {
  const slug = (laporan.reklameNama || "penindakan")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return `BA-${slug}-${(laporan.tanggal || "").slice(0, 10)}.pdf`
}

/** Nama file rekap. */
export function buildRekapFileName(periode: string): string {
  const slug = periode.replace(/[^a-z0-9]+/gi, "-").toLowerCase()
  return `rekap-penindakan-${slug}.pdf`
}
