/**
 * Tipe data laporan penindakan & titik JANAKA.
 */



/** Bukti foto dalam laporan. */
export interface FotoBukti {
  publicId: string
  namaFile: string
  url: string
  width: number
  height: number
  ukuranBytes: number
  diunggahPada: string
}

/** Laporan penindakan lapangan. */
export interface LaporanPenindakan {
  /** ID dokumen Firestore. */
  id: string
  /** Nomor berita acara. */
  nomorBA: string
  /** ID reklame (PTSP/JANAKA). */
  reklameId: string
  /** Nama pemilik reklame. */
  reklameNama: string
  /** Alamat reklame. */
  reklameAlamat: string
  /** Sumber data: true = input JANAKA, false = PTSP. */
  dariJANAKA: boolean
  /** Koordinat. */
  lat: number
  lng: number
  /** Jenis tindakan yang diambil. */
  tindakan: string
  /** Catatan petugas. */
  catatanPetugas: string
  /** Foto bukti. */
  fotoBukti: FotoBukti[]
  /** Nama petugas. */
  petugas: string
  /** Tanggal laporan (YYYY-MM-DD). */
  tanggal: string
  /** Waktu laporan (HH:mm). */
  waktu: string
  /** Timestamp buat. */
  createdAt: string
  /** Timestamp update. */
  updatedAt: string
}

/** Titik reklame tanpa izin (input JANAKA). */
export interface TitikJanaka {
  /** ID dokumen Firestore. */
  id: string
  /** Nama / nama usaha. */
  nama: string
  /** Alamat. */
  alamat: string
  /** Koordinat. */
  lat: number
  lng: number
  /** Keterangan temuan. */
  keterangan: string
  /** Jenis reklame. */
  jenisReklame: string
  /** Panjang (cm). */
  panjang: number
  /** Lebar (cm). */
  lebar: number
  /** Nama petugas yang menemukan. */
  petugas: string
  /** Sudah ditindak. */
  sudahDieksekusi: boolean
  /** ID laporan yang menindak titik ini. */
  laporanIds: string[]
  /** Timestamp buat. */
  createdAt: string
  /** Timestamp update. */
  updatedAt: string
}

/** Item peta gabungan (PTSP + JANAKA). */
export interface TitikPeta {
  id: string
  sumber: "PTSP" | "JANAKA"
  nama: string
  alamat: string
  lat: number
  lng: number
  status: string
  statusDetail?: string
  noSK?: string
  jenisReklame?: string
  dimensi?: string
  sudahDieksekusi: boolean
  jumlahLaporan: number
}

/** Jenis tindakan yang bisa dipilih di form laporan. */
export type JenisTindakan =
  | "Teguran Tertulis"
  | "Penurunan Paksa"
  | "Penyegelan"
  | "Pengelasan"
  | "Penataan Ulang"
  | "Penghapusan"
  | "Lainnya"