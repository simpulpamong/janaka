/**
 * Format Dokumen — Konfigurasi Berita Acara & Rekapitulasi
 *
 * Tersimpan di Firestore: `settings/documentFormat` (dokumen tunggal).
 * Hanya admin yang boleh mengubah. Di-cache di localStorage agar halaman
 * tidak perlu menunggu jaringan setiap kali dokumen dibuat.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  Kenapa cuma satu penandatangan?
 * ═══════════════════════════════════════════════════════════════════
 * Sebelumnya ada dua blok tanda tangan (Kasat + Petugas). Dua blok itu
 * membuat dokumen ramai dan bagian bawah kertas jadi penuh sebelum semua
 * foto bukti masuk. Sekarang cukup **satu** — jabatannya diatur di
 * Pengaturan, jadi bisa "Kasat Satpol PP" atau siapa pun yang berwenang
 * menandatangani.
 */

/**
 * Satu logo pada KOP.
 *
 * Dua logo berdiri sendiri (bukan array) supaya setiap slot punya URL,
 * posisi, dan lebar masing-masing. Kop surat resmi hampir selalu
 * memakai **dua** lambang — instansi induk dan instansi pelaksana —
 * dan keduanya harus bisa diatur sendiri.
 */
export interface LogoKop {
  /** URL logo. Kosong = slot ini tidak dipakai. */
  url: string
  /** Posisi logo: kiri atau kanan. */
  posisi: "kiri" | "kanan"
  /** Lebar logo dalam milimeter (kertas A4 lebar 210 mm). */
  lebarMm: number
}

/** Konfigurasi KOP (Kepala Surat). */
export interface KopKonfigurasi {
  /** Logo kiri. Kosong = tidak ada logo di kiri. */
  logoKiri: LogoKop
  /** Logo kanan. Kosong = tidak ada logo di kanan. */
  logoKanan: LogoKop
  /** Nama instansi baris 1. */
  instansiBaris1: string
  /** Nama instansi baris 2. */
  instansiBaris2: string
  /** Alamat instansi. */
  alamat: string
  /** Telepon. */
  telepon: string
}

/** Penandatangan dokumen. */
export interface Penandatangan {
  nama: string
  nip: string
  jabatan: string
}

/** Seluruh konfigurasi format dokumen. */
export interface FormatDokumen {
  kop: KopKonfigurasi
  penandatangan: Penandatangan
  /** Judul dokumen BA, mis. "BERITA ACARA PENINDAKAN LAPANGAN". */
  judulBA: string
  /** Judul dokumen rekap, mis. "REKAPITULASI RIWAYAT PENINDAKAN REKLAME". */
  judulRekap: string
  /** Kota tempat dokumen ditetapkan. */
  kota: string
  updatedAt: string
  updatedBy: string
}

/** Default konfigurasi format dokumen. */
export const DEFAULT_FORMAT_DOKUMEN: FormatDokumen = {
  kop: {
    logoKiri: { url: "", posisi: "kiri", lebarMm: 20 },
    logoKanan: { url: "", posisi: "kanan", lebarMm: 20 },
    instansiBaris1: "BADAN PENEGAK PERDA SATPOL PP",
    instansiBaris2: "KABUPATEN PONOROGO",
    alamat: "Jalan Daeng Sastrodirja, Ponorogo, Jawa Timur",
    telepon: "(0352) 421165",
  },
  penandatangan: {
    nama: "",
    nip: "",
    jabatan: "a.n. Kepala Satuan Polisi Pamong Praja Kabupaten Ponorogo Kepala Bidang Penegakan Peraturan Daerah",
  },
  judulBA: "BERITA ACARA PENINDAKAN LAPANGAN",
  judulRekap: "REKAPITULASI RIWAYAT PENINDAKAN REKLAME",
  kota: "Ponorogo",
  updatedAt: new Date().toISOString(),
  updatedBy: "system",
}

/** Key cache localStorage. */
const CACHE_KEY = "janaka:format-dokumen"

/** Baca cache lokal. */
export function bacaFormatDokumenCache(): FormatDokumen | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as FormatDokumen
    // Cache dari versi lama bisa tidak punya field baru — gabung dengan default.
    return gabungDenganDefault(data)
  } catch {
    return null
  }
}

/** Tulis cache lokal. */
export function tulisFormatDokumenCache(cfg: FormatDokumen): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cfg))
  } catch {
    /* abaikan quota exceeded */
  }
}

/** Logo kosong — dipakai bila data lama tidak punya slot ini. */
const LOGO_KOSONG: LogoKop = { url: "", posisi: "kiri", lebarMm: 20 }

/**
 * Gabungkan nilai tersimpan dengan default.
 *
 * Diperlukan karena konfigurasi bisa berasal dari versi aplikasi lama
 * (sebelum ada `logoKiri`/`logoKanan`/`penandatangan`). Tanpa penggabungan,
 * `cfg.kop.logoKiri` bisa `undefined` dan dokumen jadi tanpa logo tanpa
 * penjelasan.
 */
export function gabungDenganDefault(data: Partial<FormatDokumen>): FormatDokumen {
  /* Migrasi dari satu logo → dua slot: yang lama dulu jadi logo kiri. */
  const kopLama = (data.kop ?? {}) as Partial<KopKonfigurasi> & {
    logoUrl?: string
    lebarLogoMm?: number
  }

  const logoKiri = kopLama.logoKiri
    ?? (kopLama.logoUrl
      ? {
          url: kopLama.logoUrl,
          posisi: (kopLama as { posisiLogo?: "kiri" | "kanan" | "tanpa" }).posisiLogo === "kanan"
            ? ("kanan" as const)
            : ("kiri" as const),
          lebarMm: kopLama.lebarLogoMm ?? 20,
        }
      : LOGO_KOSONG)

  const logoKanan = kopLama.logoKanan
    ?? (kopLama.logoUrl && logoKiri.url !== kopLama.logoUrl
      ? { url: kopLama.logoUrl, posisi: "kanan" as const, lebarMm: kopLama.lebarLogoMm ?? 20 }
      : LOGO_KOSONG)

  const jabatanTersimpan = data.penandatangan?.jabatan
  const jabatanDefaultLama = "Kasat Satpol PP"

  return {
    kop: {
      ...DEFAULT_FORMAT_DOKUMEN.kop,
      ...kopLama,
      logoKiri,
      logoKanan,
    },
    penandatangan: {
      ...DEFAULT_FORMAT_DOKUMEN.penandatangan,
      ...(data.penandatangan ?? {}),
      ...(jabatanTersimpan === jabatanDefaultLama
        ? { jabatan: DEFAULT_FORMAT_DOKUMEN.penandatangan.jabatan }
        : {}),
    },
    judulBA: data.judulBA || DEFAULT_FORMAT_DOKUMEN.judulBA,
    judulRekap: data.judulRekap || DEFAULT_FORMAT_DOKUMEN.judulRekap,
    kota: data.kota || DEFAULT_FORMAT_DOKUMEN.kota,
    updatedAt: data.updatedAt || DEFAULT_FORMAT_DOKUMEN.updatedAt,
    updatedBy: data.updatedBy || DEFAULT_FORMAT_DOKUMEN.updatedBy,
  }
}

/** Nama koleksi Firestore untuk pengaturan. */
// deadcode: SETTINGS_COLLECTION
export const SETTINGS_COLLECTION = "settings"
// deadcode: DOCUMENT_FORMAT_DOC_ID
export const DOCUMENT_FORMAT_DOC_ID = "documentFormat"

/** Tipe data dokumen settings di Firestore (dengan Timestamp). */
export interface FormatDokumenFirestore {
  kop: KopKonfigurasi
  penandatangan: Penandatangan
  judulBA: string
  judulRekap: string
  kota: string
  updatedAt: unknown
  updatedBy: string
}

/**
 * Validasi konfigurasi tanpa mengubahnya.
 * Dipakai halaman Pengaturan sebelum menyimpan.
 */
export function validasiFormatDokumen(cfg: Partial<FormatDokumen>): string[] {
  const errors: string[] = []

  const label = (nama: string) => `${nama} maksimal 80 karakter.`

  if (cfg.kop?.instansiBaris1 && cfg.kop.instansiBaris1.length > 80) {
    errors.push(label("Instansi baris 1"))
  }
  if (cfg.kop?.instansiBaris2 && cfg.kop.instansiBaris2.length > 80) {
    errors.push(label("Instansi baris 2"))
  }
  if (cfg.kop?.alamat && cfg.kop.alamat.length > 130) {
    errors.push("Alamat instansi maksimal 130 karakter.")
  }
  if (cfg.kop?.telepon && cfg.kop.telepon.length > 30) {
    errors.push("Telepon maksimal 30 karakter.")
  }
  for (const [nama, logo] of [["logo kiri", cfg.kop?.logoKiri], ["logo kanan", cfg.kop?.logoKanan]] as const) {
    if (!logo) continue
    if (!Number.isFinite(logo.lebarMm) || logo.lebarMm < 5 || logo.lebarMm > 60) {
      errors.push(`Lebar ${nama} harus antara 5 dan 60 mm.`)
    }
    if (logo.posisi !== "kiri" && logo.posisi !== "kanan") {
      errors.push(`Posisi ${nama} harus kiri atau kanan.`)
    }
  }

  if (cfg.penandatangan?.nama && cfg.penandatangan.nama.length > 60) {
    errors.push("Nama penandatangan maksimal 60 karakter.")
  }
  if (cfg.penandatangan?.nip && cfg.penandatangan.nip.length > 24) {
    errors.push("NIP maksimal 24 karakter.")
  }
  if (cfg.penandatangan?.jabatan && cfg.penandatangan.jabatan.length > 120) {
    errors.push("Jabatan maksimal 120 karakter.")
  }

  if (cfg.judulBA && cfg.judulBA.length > 90) errors.push("Judul BA maksimal 90 karakter.")
  if (cfg.judulRekap && cfg.judulRekap.length > 90) errors.push("Judul rekap maksimal 90 karakter.")
  if (cfg.kota && cfg.kota.length > 40) errors.push("Kota maksimal 40 karakter.")

  return errors
}
