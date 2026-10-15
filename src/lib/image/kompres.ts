/**
 * Kompresi foto bukti lapangan.
 *
 * ## Kenapa perlu
 * Foto dari kamera HP modern bisa 5-12 MB. Mengunggah mentah-mentah itu
 * lambat, boros kuota, dan sering ditolak Cloudinary/PTSP. Yang dipakai di
 * sini: kompresi ke **JPEG maksimal 500 KB** dengan pencarian biner kualitas,
 * diturunkan dari `pages/Produktivitas.tsx` di proyek j4dum4n.
 *
 * ## Kenapa EXIF harus diteruskan
 * Foto lapangan adalah bukti. Tanggal, koordinat GPS, dan model kamera
 * menyatu di EXIF - membuangnya berarti bukti kehilangan nilai pembuktiannya.
 * Tapi `canvas.toDataURL()` **selalu** menghapus EXIF, jadi segmen APP1/Exif
 * milik file sumber disalin kembali (byte-per-byte) ke hasil akhir, dengan
 * hanya tag dimensi piksel yang disesuaikan.
 *
 * ## Orientasi
 * Browser otomatis memutar piksel saat decode sesuai tag `Orientation`.
 * Piksel dikembalikan ke orientasi mentah dulu, lalu tag-nya disetel `1`,
 * supaya tidak terjadi rotasi ganda di perangkat lain.
 */

import {
  bytesToDataUrl,
  dataUrlToBytes,
  findExifApp1,
  insertExifApp1,
  normalizeOrientation,
  patchExifDimensions,
  readOrientation,
  unorient,
} from "@/lib/exif"

/** Batas keras hasil kompresi: 500 KB. */
export const MAX_FOTO_BYTES = 500 * 1024

/** Sisi terpanjang hasil. 2048px masih tajam untuk foto bukti. */
export const MAX_SISI_PANJANG = 2048

/** Batas bawah dikecilkan piksel. Di bawah ini foto jadi tidak terbaca. */
const MIN_SISI = 640

export interface HasilKompres {
  blob: Blob
  /** Data URL hasil akhir (sudah ber-EXIF) - untuk preview & unduhan. */
  dataUrl: string
  namaFile: string
  ukuranBytes: number
  width: number
  height: number
  /** EXIF berhasil diteruskan? */
  adaExif: boolean
  /** True bila berkas asli sudah kecil dan dikirim apa adanya. */
  tanpaPerubahan: boolean
}

/**
 * Perkiraan ukuran byte dari data URL base64.
 *
 * Panjang base64 tidak persis 4/3 ukuran asli karena ada header
 * `data:image/jpeg;base64,` yang ikut terhitung — tanpa dikurangi, hasil
 * kompresi bisa undershoot ~25% dari batas.
 */
function bytesDariDataUrl(dataUrl: string): number {
  const koma = dataUrl.indexOf(",")
  if (koma < 0) return 0
  const b64 = dataUrl.length - koma - 1
  const padding = dataUrl.endsWith("==") ? 2 : dataUrl.endsWith("=") ? 1 : 0
  return Math.floor((b64 * 3) / 4) - padding
}

function bacaBytes(file: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer))
    reader.onerror = () => reject(new Error("Gagal membaca berkas foto."))
    reader.readAsArrayBuffer(file)
  })
}

function muatGambar(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new window.Image()
    img.onload = () => resolve(img)
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("Gagal membuka gambar - format mungkin tidak didukung."))
    }
    img.src = url
  })
}

/**
 * Perkecil ke sisi terpanjang `MAX_SISI_PANJANG`.
 *
 * Turun bertahap (maks 50% per langkah) alih-alih sekali resize:resco satu
 * kali besar-besaran membuat tepi bergerigi karena masing-masing piksel asli
 * jadi beberapa piksel baru tanpa difilter.
 */
function perkecil(source: CanvasImageSource, w: number, h: number): HTMLCanvasElement {
  const skala = Math.min(1, MAX_SISI_PANJANG / Math.max(w, h))
  if (skala >= 1) {
    const kanvas = document.createElement("canvas")
    kanvas.width = w
    kanvas.height = h
    const ctx = kanvas.getContext("2d")
    if (ctx) {
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = "high"
      ctx.drawImage(source, 0, 0, w, h)
    }
    return kanvas
  }

  const targetW = Math.max(1, Math.round(w * skala))
  const targetH = Math.max(1, Math.round(h * skala))

  // Turun bertahap (maks 50% per langkah) alih-alih sekali resize: resize
  // besar-besaran membuat tepi bergerigi karena tiap piksel asli jadi
  // beberapa piksel baru tanpa difilter.
  let cur: CanvasImageSource = source
  let curW = w
  let curH = h
  while (curW > targetW * 1.5 || curH > targetH * 1.5) {
    const nextW = Math.max(Math.round(curW * 0.5), targetW)
    const nextH = Math.max(Math.round(curH * 0.5), targetH)
    const langkah = document.createElement("canvas")
    langkah.width = nextW
    langkah.height = nextH
    const ctx = langkah.getContext("2d")
    if (ctx) {
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = "high"
      ctx.drawImage(cur, 0, 0, curW, curH, 0, 0, nextW, nextH)
    }
    cur = langkah
    curW = nextW
    curH = nextH
  }

  const akhir = document.createElement("canvas")
  akhir.width = targetW
  akhir.height = targetH
  const ctx = akhir.getContext("2d")
  if (ctx) {
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = "high"
    ctx.drawImage(cur, 0, 0, curW, curH, 0, 0, targetW, targetH)
  }
  return akhir
}

/** Buang karakter aneh dari nama file, ganti ekstensi jadi .jpg. */
function namaAman(nama: string): string {
  const dasar =
    nama
      .replace(/\.[^.]+$/, "")
      .replace(/[^\w.\-]+/g, "_")
      .slice(0, 80) || "foto"
  return `${dasar}.jpg`
}

export function blobKeDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error("Gagal membaca blob."))
    reader.readAsDataURL(blob)
  })
}

export function dataUrlKeBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(",")
  const mime = /:(.*?);/.exec(parts[0])?.[1] ?? "image/jpeg"
  const bin = atob(parts[1])
  const buf = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
  return new Blob([buf], { type: mime })
}

/** Bungkus blob hasil kompresi menjadi File siap unggah. */
export function blobKeFile(blob: Blob, nama: string): File {
  return new File([blob], nama, { type: blob.type || "image/jpeg", lastModified: Date.now() })
}

/**
 * Kompres satu foto ke <=500 KB dengan EXIF sumber tetap terbawa.
 *
 * Urutan strateginya: turunkan kualitas JPEG dulu (aman untuk ketajaman),
 * baru perkecil piksel hanya bila hasilnya masih di atas batas pada kualitas
 * terendah. Kalau pun masih sebesar itu, kirim apa adanya - lebih baik
 * sedikit di atas 500 KB daripada gagal total.
 */
export async function kompresFoto(file: File): Promise<HasilKompres> {
  if (!file.type.startsWith("image/")) {
    throw new Error(`Format berkas tidak didukung: ${file.type || "tidak dikenal"}.`)
  }

  // Jalur pintas: JPEG yang sudah kecil &mdash; EXIF-nya ikut apa adanya.
  if (file.size <= MAX_FOTO_BYTES && file.type === "image/jpeg") {
    return {
      blob: file,
      dataUrl: await blobKeDataUrl(file),
      namaFile: namaAman(file.name),
      ukuranBytes: file.size,
      width: 0,
      height: 0,
      adaExif: findExifApp1(await bacaBytes(file)) !== null,
      tanpaPerubahan: true,
    }
  }

  const bytes = await bacaBytes(file)
  const exifSegment = findExifApp1(bytes)
  const orientation = exifSegment ? readOrientation(exifSegment) : 1

  const img = await muatGambar(file)
  const srcW = img.naturalWidth || img.width
  const srcH = img.naturalHeight || img.height
  if (!srcW || !srcH) throw new Error("Gagal membaca dimensi gambar.")

  // Kembalikan piksel ke orientasi mentah sesuai tag Orientation.
  let kanvas: HTMLCanvasElement
  try {
    kanvas = unorient(img, orientation)
  } catch {
    kanvas = document.createElement("canvas")
    kanvas.width = srcW
    kanvas.height = srcH
    const ctx = kanvas.getContext("2d")
    if (ctx) {
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = "high"
      ctx.drawImage(img, 0, 0, srcW, srcH)
    }
  }

  kanvas = perkecil(kanvas, kanvas.width, kanvas.height)

  const exif = exifSegment ? exifSegment.slice() : null
  if (exif) {
    normalizeOrientation(exif)
    patchExifDimensions(exif, kanvas.width, kanvas.height)
  }

  /** Encode JPEG pada kualitas tertentu, lalu sisipkan EXIF bila ada. */
  const build = (src: HTMLCanvasElement, quality: number): string => {
    const dataUrl = src.toDataURL("image/jpeg", quality)
    if (dataUrl.length < 100) return ""
    if (!exif) return dataUrl
    try {
      return bytesToDataUrl(insertExifApp1(dataUrlToBytes(dataUrl), exif), "image/jpeg")
    } catch {
      // Struktur EXIF rusak - lebih baik kirim tanpa EXIF daripada gagal total.
      return dataUrl
    }
  }

  /** Cari kualitas tertinggi yang masih muat di bawah batas. Kosong = belum muat. */
  const cariKualitasTerbaik = (src: HTMLCanvasElement): string => {
    const tertinggi = build(src, 0.82)
    if (!tertinggi) return ""
    if (bytesDariDataUrl(tertinggi) <= MAX_FOTO_BYTES) return tertinggi

    let atas = 0.82
    let bawah = 0.3
    let terbaik = ""
    for (let i = 0; i < 8; i++) {
      const tengah = Math.round(((atas + bawah) / 2) * 100) / 100
      const percobaan = build(src, tengah)
      if (!percobaan) break
      if (bytesDariDataUrl(percobaan) <= MAX_FOTO_BYTES) {
        terbaik = percobaan
        bawah = tengah
      } else {
        atas = tengah
      }
    }
    return terbaik
  }

  let target = kanvas
  let best = cariKualitasTerbaik(target)

  // Masih di atas batas pada kualitas terendah - perkecil piksel lalu ulangi.
  let guard = 0
  while (!best && guard < 4) {
    const sisi = Math.max(target.width, target.height)
    if (sisi <= MIN_SISI) break
    const faktor = sisi > 2000 ? 0.7 : sisi > 1200 ? 0.8 : 0.85
    const baru = document.createElement("canvas")
    baru.width = Math.max(MIN_SISI, Math.round(target.width * faktor))
    baru.height = Math.max(MIN_SISI, Math.round(target.height * faktor))
    const ctx = baru.getContext("2d")
    if (ctx) {
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = "high"
      ctx.drawImage(target, 0, 0, target.width, target.height, 0, 0, baru.width, baru.height)
    }
    target = baru
    if (exif) patchExifDimensions(exif, baru.width, baru.height)
    best = cariKualitasTerbaik(target)
    guard += 1
  }

  // Jalur terakhir: JPEG kualitas minimal, apa pun hasilnya.
  if (!best) best = build(target, 0.25) || build(target, 0.1)
  if (!best) throw new Error("Gagal memproses foto (gambar terlalu besar untuk perangkat ini).")

  const blob = dataUrlKeBlob(best)
  return {
    blob,
    dataUrl: best,
    namaFile: namaAman(file.name),
    ukuranBytes: blob.size,
    width: target.width,
    height: target.height,
    adaExif: !!exif,
    tanpaPerubahan: false,
  }
}