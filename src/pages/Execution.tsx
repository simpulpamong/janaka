import { useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "react-router-dom"
import {
  Building2,
  Camera,
  ClipboardCheck,
  Download,
  Eye,
  Navigation,
  MapPin,
  Plus,
  Search,
  ShieldAlert,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react"
import { AppLayout } from "@/components/layout"
import { DataStatusBanner } from "@/components/common/DataStatusBanner"
import { FirestoreBanner } from "@/components/common/FirestoreBanner"
import { FotoViewer } from "@/components/common/FotoViewer"
import { KameraWeb, perangkatPunyaKameraNative } from "@/components/common/KameraWeb"
import { KerangkaLaporan } from "@/components/common/Kerangka"
import {
  ActionButton,
  Badge,
  Card,
  Field,
  InputWithIcon,
  Textarea,
} from "@/components/ui/primitives"
import { Modal } from "@/components/ui/Modal"
import DatePicker from "@/components/ui/DatePicker"
import { MapPickerModal } from "@/components/peta/MapPickerModal"
import {
  TitikMassal,
  barisTitikKosong,
  type BarisTitik,
} from "@/components/peta/TitikMassal"
import { useDebounce } from "@/hooks/useDebounce"
import { useGeolocation } from "@/hooks/useGeolocation"
import { useLaporan, useTitikJanaka } from "@/hooks/useLaporan"
import { useReklamaStore } from "@/hooks/useReklamaStore"
import { useToast } from "@/hooks/useToast"
import { useAuth } from "@/context/AuthContext"
import {
  FOLDER_UPLOAD,
  uploadToCloudinary,
  validateImageFile,
  type CloudinaryUploadResult,
} from "@/lib/cloudinary"
import { buildNomorBASelanjutnya } from "@/lib/nomorBA"
import { blobKeFile, kompresFoto } from "@/lib/image/kompres"
import { bukaPeta } from "@/components/common/PetaLihat"
import { formatBytes, formatTanggalLengkap } from "@/utils"

const STORAGE_KEY = "janaka-laporan"

/**
 * Berapa banyak baris yang ditampilkan per bagian di modal "Pilih Titik".
 *
 * Daftar PTSP bisa ratusan baris. Semuanya dipangkas supaya area gulirnya
 * tetap enak dibaca; sisanya dicari lewat kotak pencarian di atas.
 */
const BATAS_HASIL_MODAL = 8



interface PendingFoto extends CloudinaryUploadResult {
  namaFile: string
  ukuranBytes: number
  /**
   * Data URL hasil kompresi (sudah ber-EXIF). Dipakai untukpratinjau, layar
   * penuh, dan unduhan — jadi yang dilihat petugas persis yang diunggah.
   */
  previewUrl: string
  /** EXIF sumber berhasil diteruskan ke hasil kompresi? */
  adaExif: boolean
  /** Ukuran berkas asli sebelum dikompresi. */
  ukuranAsli: number
}

/** Sumber titik yang dipilih pada form laporan. */
type SumberTerpilih = "PTSP" | "JANAKA"

export default function Execution() {
  const [searchParams] = useSearchParams()
  const initialReklameId = searchParams.get("reklameId") ?? ""
  const initialIsJanaka = initialReklameId.startsWith("janaka-")
  const { showToast } = useToast()

  const { coords } = useGeolocation()
  const {
    reklameList,
    loading,
    progress,
    error: apiError,
    stale,
    lastLoadedAt,
    loadReklamaList,
    refreshReklamaList,
  } = useReklamaStore()
  const { laporan, executedIds, simpan, error: laporanError, reload: reloadLaporan } = useLaporan()
  const { titik, tambah, error: titikError, reload: reloadTitik } = useTitikJanaka()
  const { can } = useAuth()

  const bolehTambahTitik = can("aksiTambahTitik")

  const fileRef = useRef<HTMLInputElement>(null)
  /** Input tersembunyi untuk kamera native di ponsel. */
  const kameraRef = useRef<HTMLInputElement>(null)
  /** Kamera web (PC). Di ponsel lewat kamera native, jadi tidak dipakai. */
  const [kameraWebOpen, setKameraWebOpen] = useState(false)

  /* ── Form state ── */
  const [sumber, setSumber] = useState<SumberTerpilih>(initialIsJanaka ? "JANAKA" : "PTSP")
  const [search, setSearch] = useState("")
  const [selectedPtsp, setSelectedPtsp] = useState(initialIsJanaka ? "" : initialReklameId)
  const [selectedJanaka, setSelectedJanaka] = useState(initialIsJanaka ? initialReklameId.replace(/^janaka-/, "") : "")
  const [pilihTitikTerbuka, setPilihTitikTerbuka] = useState(false)
  const [tanggal, setTanggal] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const [catatan, setCatatan] = useState("")
  const [fotos, setFotos] = useState<PendingFoto[]>([])
  const [uploading, setUploading] = useState(false)
  const [modalTitikBaru, setModalTitikBaru] = useState(false)
  const [mapPickerOpen, setMapPickerOpen] = useState(false)
  /** Indeks foto yang sedang dibuka di layar penuh. */
  const [lihatFoto, setLihatFoto] = useState<number | null>(null)

  /* ── Form titik baru (tidak berizin) ── */
  /*
   * Satu koordinat bisa punya beberapa reklame (papan nama, baliho, spanduk)
   * di lokasi yang sama. Alamat & koordinat disimpan sekali; yang berulang
   * hanya nama, jenis, ukuran, dan keterangan.
   */
  const [barisTitik, setBarisTitik] = useState<BarisTitik[]>([barisTitikKosong()])
  const [alamatTitik, setAlamatTitik] = useState("")
  const [coordsTitik, setCoordsTitik] = useState<{ lat: number; lng: number } | null>(null)
  const [menyimpanTitik, setMenyimpanTitik] = useState(false)

  const debouncedSearch = useDebounce(search, 300)

  // Tautan dari Data Reklame dapat berubah saat halaman laporan masih hidup.
  // Terapkan ulang titik dari URL supaya petugas tidak perlu memilihnya lagi.
  useEffect(() => {
    if (!initialReklameId) return
    const janaka = initialReklameId.startsWith("janaka-")
    setSumber(janaka ? "JANAKA" : "PTSP")
    setSelectedPtsp(janaka ? "" : initialReklameId)
    setSelectedJanaka(janaka ? initialReklameId.replace(/^janaka-/, "") : "")
    setPilihTitikTerbuka(false)
    setSearch("")
  }, [initialReklameId])

  useEffect(() => {
    if (reklameList.length === 0 && lastLoadedAt === null && !loading && !apiError) {
      void loadReklamaList()
    }
  }, [reklameList.length, lastLoadedAt, loading, apiError, loadReklamaList])

  // Isi koordinat form titik baru dari GPS bila tersedia
  useEffect(() => {
    if (coords && modalTitikBaru) setCoordsTitik(coords)
  }, [coords, modalTitikBaru])

  // Revoke object URL saat foto dilepas maupun saat halaman ditutup.
  const fotosRef = useRef<PendingFoto[]>([])
  useEffect(() => {
    fotosRef.current = fotos
  }, [fotos])

  useEffect(() => {
    return () => {
      fotosRef.current.forEach((f) => URL.revokeObjectURL(f.previewUrl))
    }
  }, [])

  /* ── Hasil pencarian PTSP ── */
  /*
   * Tanpa kueri, daftar **tidak** dikosongkan.
   *
   * Dulu bagian ini menampilkan kalimat "Ketik nama pemilik, lokasi, atau
   * nomor SK untuk mencari data PTSP" sampai petugas mengetik sesuatu — jadi
   * begitu modal dibuka, separuh isinya cuma satu kalimat petunjuk. Padahal
   * daftarnya sudah ada di memori (`reklameList` dari cache lokal) dan bisa
   * langsung dipilih. Sekarang daftarnya tampil apa adanya; pencarian tetap
   * tersedia sebagai penyaring saat daftarnya panjang.
   */
  const hasilPtsp = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    if (!q) return reklameList.slice(0, BATAS_HASIL_MODAL)
    return reklameList
      .filter(
        (r) =>
          r.namaPemilik.toLowerCase().includes(q) ||
          r.naskahReklame.toLowerCase().includes(q) ||
          r.alamat.toLowerCase().includes(q) ||
          r.noSK.toLowerCase().includes(q),
      )
      .slice(0, BATAS_HASIL_MODAL)
  }, [reklameList, debouncedSearch])

  /* ── Titik JANAKA (belum dieksekusi) ── */
  const titikJanakaTersedia = useMemo(
    () => titik.filter((t) => !t.sudahDieksekusi),
    [titik],
  )

  const hasilJanaka = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    if (!q) return titikJanakaTersedia.slice(0, BATAS_HASIL_MODAL)
    return titikJanakaTersedia.filter((t) =>
      [t.nama, t.alamat, t.jenisReklame, t.keterangan]
        .some((nilai) => nilai?.toLowerCase().includes(q)),
    ).slice(0, BATAS_HASIL_MODAL)
  }, [titikJanakaTersedia, debouncedSearch])

  /* ── Jumlah total yang cocok (untuk label "menampilkan X dari Y") ── */
  const jumlahCocokPtsp = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    if (!q) return reklameList.length
    return reklameList.filter((r) =>
      [r.namaPemilik, r.naskahReklame, r.alamat, r.noSK].some((nilai) =>
        nilai.toLowerCase().includes(q),
      ),
    ).length
  }, [reklameList, debouncedSearch])

  const jumlahCocokJanaka = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    if (!q) return titikJanakaTersedia.length
    return titikJanakaTersedia.filter((t) =>
      [t.nama, t.alamat, t.jenisReklame, t.keterangan]
        .some((nilai) => nilai?.toLowerCase().includes(q)),
    ).length
  }, [titikJanakaTersedia, debouncedSearch])

  /* ── Titik terpilih ── */
  const terpilihPtsp = useMemo(
    () => reklameList.find((r) => r.id === selectedPtsp) ?? null,
    [reklameList, selectedPtsp],
  )
  const terpilihJanaka = useMemo(
    () => titik.find((t) => t.id === selectedJanaka) ?? null,
    [titik, selectedJanaka],
  )

  const terpilih =
    sumber === "PTSP"
      ? terpilihPtsp
        ? {
            id: terpilihPtsp.id,
            nama: terpilihPtsp.namaPemilik,
            alamat: terpilihPtsp.alamat,
            lat: terpilihPtsp.lat,
            lng: terpilihPtsp.lng,
            detail: terpilihPtsp.statusDetail,
            status: terpilihPtsp.statusSK as string,
          }
        : null
      : terpilihJanaka
        ? {
            id: terpilihJanaka.id,
            nama: terpilihJanaka.nama,
            alamat: terpilihJanaka.alamat,
            lat: terpilihJanaka.lat,
            lng: terpilihJanaka.lng,
            detail: terpilihJanaka.keterangan || "Ditemukan saat patroli lapangan",
            status: "Tidak Berizin",
          }
        : null

  /**
   * Buka kamera sesuai perangkat.
   *
   * Ponsel/tablet -> kamera native (cepat, hemat baterai, flash ikut
   * ditangani kamera HP). PC -> kamera web dengan kontrol penuh.
   */
  const bukaKamera = () => {
    if (perangkatPunyaKameraNative()) kameraRef.current?.click()
    else setKameraWebOpen(true)
  }

  /** Terima hasil jepretan dari KameraWeb, perlakukan sama dengan file galeri. */
  const terimaBlobKamera = (blob: Blob) => {
    const nama = `kamera-${new Date().toISOString().replace(/[:.]/g, "-")}.jpg`
    void prosesFoto([new File([blob], nama, { type: "image/jpeg" })])
  }

  /* ── Kompres & upload foto ──
   *
   * Alurnya: kompres di perangkat dulu (EXIF tetap terbawa) → unggah hasil
   * kompresi itu. Foto asli tidak pernah menyentuh jaringan, jadi unggahan
   * tetap ringan walau kamera menghasilkan 10 MB per bidikan.
   */
  const prosesFoto = async (list: File[]) => {
    if (list.length === 0) return

    const valid = list.filter((f) => {
      const err = validateImageFile(f)
      if (err) {
        showToast(err, "error")
        return false
      }
      return true
    })
    if (valid.length === 0) return

    setUploading(true)
    let success = 0
    for (const file of valid) {
      try {
        const hasil = await kompresFoto(file)
        const fileFinal = blobKeFile(hasil.blob, hasil.namaFile)
        const result = await uploadToCloudinary(fileFinal, FOLDER_UPLOAD)

        setFotos((prev) => [
          ...prev,
          {
            ...result,
            namaFile: hasil.namaFile,
            ukuranBytes: hasil.ukuranBytes,
            previewUrl: hasil.dataUrl,
            adaExif: hasil.adaExif,
            ukuranAsli: file.size,
          },
        ])
        success += 1
      } catch (err) {
        showToast(err instanceof Error ? err.message : `Gagal mengunggah ${file.name}`, "error")
      }
    }
    setUploading(false)
    if (success > 0) showToast(`${success} foto berhasil diunggah`, "success")
  }

  /** Punjabat dari input galeri (FileList) maupun kamera native. */
  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    await prosesFoto(Array.from(files))
    // Kosongkan input supaya memilih berkas yang sama dua kali tetap memicu
    // event `change`.
    if (fileRef.current) fileRef.current.value = ""
    if (kameraRef.current) kameraRef.current.value = ""
  }

  /* Pratinjau kini berupa data URL hasil kompresi (bukan object URL), jadi
     tidak ada yang perlu di-revoke. */
  const removeFoto = (publicId: string) => {
    setFotos((prev) => prev.filter((f) => f.publicId !== publicId))
  }

  const clearAllFotos = () => {
    setFotos([])
    setLihatFoto(null)
  }

  const unduhFoto = (foto: PendingFoto) => {
    const a = document.createElement("a")
    a.href = foto.previewUrl
    a.download = foto.namaFile
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  /* ── Simpan titik baru (tidak berizin) ──
   *
   * Satu baris = satu titik. Kalau petugas mengisi lima reklame di satu
   * koordinat, hasilnya **lima titik** — bukan satu titik dengan lima nama.
   * Titik adalah satuan yang dipakai peta dan laporan, jadi menggabungkan
   * akan membuat satu PTR di peta berisi lima reklame berbeda.
   */
  const handleSimpanTitik = async () => {
    const c = coordsTitik ?? coords
    if (!c) {
      showToast("Pilih koordinat lokasi terlebih dahulu", "error")
      return
    }
    const kosong = barisTitik.filter((b) => !b.nama.trim())
    if (kosong.length > 0) {
      showToast(
        kosong.length === barisTitik.length
          ? "Isi nama / nama usaha reklame"
          : `${kosong.length} baris belum diisi nama`,
        "error",
      )
      return
    }

    setMenyimpanTitik(true)
    try {
      // Disimpan berurutan: `tambah` menutup dokumen Firestore-nya sendiri,
      // jadi tidak aman dipanggil sekaligus untuk hitungan yang banyak.
      const tersimpan: string[] = []
      for (const b of barisTitik) {
        const id = await tambah({
          nama: b.nama.trim(),
          alamat: alamatTitik.trim(),
          lat: c.lat,
          lng: c.lng,
          keterangan: b.keterangan,
          jenisReklame: b.jenisReklame,
          panjang: Number(b.panjang) || 0,
          lebar: Number(b.lebar) || 0,
          petugas: "-",
        })
        tersimpan.push(id)
      }
      const id = tersimpan[tersimpan.length - 1]!

      setModalTitikBaru(false)
      setBarisTitik([barisTitikKosong()])
      setAlamatTitik("")
      setCoordsTitik(null)

      // Langsung pindah ke mode JANAKA & pilih titik baru
      setSumber("JANAKA")
      setSelectedJanaka(id)

      showToast(
        tersimpan.length > 1
          ? `${tersimpan.length} titik tersimpan. Lengkapi laporan lalu simpan.`
          : "Titik tersimpan. Lengkapi laporan lalu simpan.",
        "success",
      )
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal menyimpan titik", "error")
    } finally {
      setMenyimpanTitik(false)
    }
  }

  /* ── Validasi & aksi laporan ── */
  const validate = (): boolean => {
    if (!terpilih?.id) {
      showToast("Pilih titik reklame terlebih dahulu", "error")
      return false
    }
    if (fotos.length === 0) {
      showToast("Lampirkan minimal satu foto dokumentasi", "error")
      return false
    }
    return true
  }

  const buildInput = () => ({
    nomorBA: buildNomorBASelanjutnya(laporan, tanggal),
    reklameId: terpilih!.id,
    reklameNama: terpilih!.nama,
    reklameAlamat: terpilih!.alamat,
    dariJANAKA: sumber === "JANAKA",
    lat: coords?.lat ?? terpilih!.lat,
    lng: coords?.lng ?? terpilih!.lng,
    tindakan: "Teguran Tertulis",
    catatanPetugas: catatan.trim(),
    fotoBukti: fotos.map((f) => ({
      url: f.url,
      publicId: f.publicId,
      namaFile: f.namaFile,
      ukuranBytes: f.ukuranBytes,
      width: f.width,
      height: f.height,
      diunggahPada: new Date().toISOString(),
    })),
    petugas: "-",
    tanggal: tanggal || new Date().toISOString().slice(0, 10),
    waktu: new Date().toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
    }),
  })

  const handleSimpan = async () => {
    if (!validate()) return
    try {
      const input = buildInput()
      await simpan(input)

      // Backup lokal (offline-friendly)
      try {
        const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]")
        const next = Array.isArray(existing) ? [...existing, input] : [input]
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        /* abaikan */
      }

      showToast("Laporan tersimpan ke rekap penindakan", "success")

      // Reset form, pertahankan sumber & titik agar petugas bisa buat laporan berikutnya
      setCatatan("")
      clearAllFotos()

      setSelectedJanaka("")
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal menyimpan laporan", "error")
    }
  }

  return (
    <AppLayout onRefresh={() => void refreshReklamaList()} refreshing={loading}>
      <div className="space-y-5">
        {/* Muat pertama: belum ada titik untuk dipilih, jadi formnya kosong
            dan tidak ada gunanya. Kerangka menahan tempat form yang sebenarnya. */}
        {loading && reklameList.length === 0 && titik.length === 0 ? (
          <KerangkaLaporan />
        ) : null}

        <FirestoreBanner
          error={laporanError ?? titikError}
          count={titik.length}
          onRetry={() => {
            reloadLaporan()
            reloadTitik()
          }}
        />

        <DataStatusBanner
          loading={loading}
          progress={progress}
          error={apiError}
          stale={stale}
          count={reklameList.length}
          onRetry={() => void refreshReklamaList()}
        />

        <Card>
          <div className="space-y-6 divide-y divide-slate-100 dark:divide-slate-800">
              {/* ── 1. PILIH TITIK REKLAME ── */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    1. Titik Reklame Target *
                  </span>
                  {terpilih ? (
                    <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                      ✓ Titik telah dipilih
                    </span>
                  ) : null}
                </div>

                {!terpilih ? (
                  <div className="space-y-2">
                    <ActionButton
                      block
                      variant="secondary"
                      onClick={() => setPilihTitikTerbuka(true)}
                      icon={<MapPin className="h-4 w-4" />}
                    >
                      Pilih Titik Reklame
                    </ActionButton>
                    <p className="text-center text-xs text-slate-400 dark:text-slate-500">
                      Pilih dari Data PTSP atau temuan lapangan.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-3.5 text-xs space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-slate-800 dark:text-slate-100 truncate">
                          {terpilih.nama}
                        </p>
                        <p className="text-slate-500 dark:text-slate-400 truncate">
                          {terpilih.alamat}
                        </p>
                      </div>
                      <Badge
                        tone={
                          terpilih.status === "Aktif"
                            ? "emerald"
                            : terpilih.status === "Tidak Berizin"
                              ? "rose"
                              : "amber"
                        }
                      >
                        {terpilih.status}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
                      {terpilih.lat && terpilih.lng ? (
                        <button
                          type="button"
                          onClick={() => bukaPeta(Number(terpilih.lat), Number(terpilih.lng), terpilih.nama)}
                          className="inline-flex items-center gap-1 font-semibold text-blue-600 transition-colors hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                        >
                          <Navigation className="h-3 w-3" />
                          Lihat Lokasi
                        </button>
                      ) : <span />}
                      <ActionButton
                        size="sm"
                        variant="ghost"
                        onClick={() => setPilihTitikTerbuka(true)}
                        className="!h-7 !px-2.5 !text-xs text-rose-500 hover:text-rose-600"
                      >
                        Ganti Titik Reklame
                      </ActionButton>
                    </div>
                  </div>
                )}
              </div>

              <Modal
                open={pilihTitikTerbuka}
                onClose={() => setPilihTitikTerbuka(false)}
                title="Pilih Titik Reklame"
                icon={<MapPin className="h-4 w-4 text-blue-500" />}
                size="lg"
                footer={
                  <div className="flex w-full justify-end">
                    <ActionButton variant="secondary" onClick={() => setPilihTitikTerbuka(false)}>
                      Tutup
                    </ActionButton>
                  </div>
                }
              >
                <div className="space-y-4">
                  <InputWithIcon
                    name="cariReklame"
                    type="search"
                    placeholder="Cari nama, lokasi, nomor SK, atau jenis reklame…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    icon={<Search className="h-4 w-4" />}
                  />
                  <div className="max-h-[min(55vh,420px)] space-y-4 overflow-y-auto pr-1 custom-scrollbar">
                    <section className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          <Building2 className="h-4 w-4" /> Data PTSP
                        </h3>
                        <span className="shrink-0 text-[11px] font-semibold text-slate-400 dark:text-slate-500">
                          {jumlahCocokPtsp > hasilPtsp.length
                            ? `Menampilkan ${hasilPtsp.length} dari ${jumlahCocokPtsp}`
                            : `${jumlahCocokPtsp.toLocaleString("id-ID")} titik`}
                        </span>
                      </div>
                      {hasilPtsp.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-slate-300 px-3 py-2.5 text-xs text-slate-400 dark:border-slate-700 dark:text-slate-500">
                          {debouncedSearch.trim()
                            ? `Tidak ada data PTSP yang cocok dengan "${debouncedSearch.trim()}".`
                            : "Data PTSP belum termuat. Muat ulang lewat tombol refresh di topbar."}
                        </p>
                      ) : hasilPtsp.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => {
                            setSumber("PTSP")
                            setSelectedPtsp(r.id)
                            setSelectedJanaka("")
                            setPilihTitikTerbuka(false)
                          }}
                          className="w-full rounded-xl border border-slate-200 p-2.5 text-left transition-colors hover:bg-slate-50 dark:border-slate-700/60 dark:hover:bg-slate-700/50"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                              {r.namaPemilik}
                            </p>
                            {executedIds.has(r.id) ? <Badge tone="emerald" className="shrink-0">Ditindak</Badge> : null}
                          </div>
                          <p className="truncate text-xs text-slate-500 dark:text-slate-400">{r.alamat}</p>
                          <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">{r.statusSK} · {r.noSK}</p>
                        </button>
                      ))}
                    </section>

                    <section className="space-y-2 border-t border-slate-100 pt-3 dark:border-slate-700">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          <ShieldAlert className="h-4 w-4" /> Temuan Lapangan
                        </h3>
                        <span className="shrink-0 text-[11px] font-semibold text-slate-400 dark:text-slate-500">
                          {jumlahCocokJanaka > hasilJanaka.length
                            ? `Menampilkan ${hasilJanaka.length} dari ${jumlahCocokJanaka}`
                            : `${jumlahCocokJanaka.toLocaleString("id-ID")} tersimpan`}
                        </span>
                      </div>
                      {hasilJanaka.length === 0 ? (
                        titikJanakaTersedia.length === 0 ? (
                          /*
                           * Kosong != buntu. Dulu di sini hanya kalimat
                           * "Belum ada temuan lapangan yang tersimpan" —
                           * yang tidak memberi jalan keluar. Sekarang
                           * kotaknya menjelaskan singkat, dan tombol tambah
                           * selalu ada tepat di bawah daftar, di luar area
                           * gulir sehingga tidak pernah ikut terpotong.
                           */
                          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-3 py-4 text-center dark:border-slate-700 dark:bg-slate-900/30">
                            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                              Belum ada temuan lapangan
                            </p>
                            <p className="mx-auto mt-1 max-w-sm text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
                              {bolehTambahTitik
                                ? "Reklame liar yang Anda temui saat patroli belum dicatat. Gunakan tombol di bawah untuk menambahnya."
                                : "Reklame liar yang Anda temui dapat dicatat petugas lain, lalu ditindak dari sini."}
                            </p>
                          </div>
                        ) : (
                          <p className="rounded-xl border border-dashed border-slate-300 px-3 py-2.5 text-xs text-slate-400 dark:border-slate-700 dark:text-slate-500">
                            {`Tidak ada temuan yang cocok dengan "${debouncedSearch.trim()}".`}
                          </p>
                        )
                      ) : hasilJanaka.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            setSumber("JANAKA")
                            setSelectedJanaka(t.id)
                            setSelectedPtsp("")
                            setPilihTitikTerbuka(false)
                          }}
                          className="w-full rounded-xl border border-slate-200 p-2.5 text-left transition-colors hover:bg-slate-50 dark:border-slate-700/60 dark:hover:bg-slate-700/50"
                        >
                          <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{t.nama}</p>
                          <p className="truncate text-xs text-slate-500 dark:text-slate-400">{t.alamat}</p>
                          <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
                            {t.jenisReklame} · {formatTanggalLengkap(t.createdAt)}
                          </p>
                        </button>
                      ))}
                    </section>
                  </div>
                  {/*
                   * Tombol tambah **selalu** ada, termasuk saat daftar
                   * temuan kosong. Letaknya di luar area gulir, jadi tetap
                   * terlihat walau daftarnya panjang — dan itulah jalannya
                   * keluar dari kotak kosong di atas.
                   */}
                  <ActionButton
                    block
                    variant="secondary"
                    onClick={() => {
                      setPilihTitikTerbuka(false)
                      setModalTitikBaru(true)
                    }}
                    disabled={!bolehTambahTitik}
                    title={bolehTambahTitik ? undefined : "Anda tidak memiliki izin menambah titik"}
                    icon={<Plus className="h-4 w-4" />}
                  >
                    Tambah Temuan Lapangan
                  </ActionButton>
                </div>
              </Modal>

              {/* ── 2. TANGGAL PENINDAKAN ── */}
              <div className="pt-5">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                    2. Tanggal Penindakan *
                  </label>
                  <DatePicker
                    value={tanggal}
                    onChange={setTanggal}
                    aria-label="Tanggal Penindakan"
                  />
                </div>
              </div>

              {/* ── 3. KETERANGAN PENINDAKAN ── */}
              <div className="space-y-2 pt-5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                  3. Keterangan Penindakan
                </label>
                <Field htmlFor="catatan">
                  <Textarea
                    id="catatan"
                    name="catatan"
                    placeholder="Uraikan kondisi reklame di lokasi, teguran kepada pemilik/pengelola, hasil patroli lapangan, atau catatan tindakan…"
                    value={catatan}
                    onChange={(e) => setCatatan(e.target.value)}
                    rows={4}
                  />
                </Field>
              </div>

              {/* ── 4. FOTO DOKUMENTASI ── */}
              <div className="space-y-3 pt-5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                  4. Foto Dokumentasi *
                </label>

                {/* Galeri — pemilih berkas biasa, tanpa paksa kamera. */}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => void handleFiles(e.target.files)}
                />

                {/* Kamera native — hanya dipakai di ponsel/tablet. Di PC
                    atribut `capture` diabaikan, jadi yang dipakai KameraWeb. */}
                <input
                  ref={kameraRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => void handleFiles(e.target.files)}
                />

                {fotos.length === 0 ? (
                  /* Kotak kosong: tombolnya di DALAM kotak, bukan di baris
                     terpisah di atas. Satu tempat untuk "ambilkan foto". */
                  <div className="rounded-2xl border-2 border-dashed border-slate-200 px-6 py-8 text-center dark:border-slate-700">
                    <Camera className="mx-auto h-7 w-7 text-slate-400" />
                    <p className="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                      Belum ada foto dokumentasi
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                      Sertakan minimal satu foto bukti lapangan
                    </p>

                    <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                      <ActionButton
                        type="button"
                        size="sm"
                        onClick={bukaKamera}
                        disabled={uploading}
                        icon={<Camera className="h-4 w-4" />}
                      >
                        Kamera
                      </ActionButton>
                      <ActionButton
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => fileRef.current?.click()}
                        disabled={uploading}
                        icon={<UploadCloud className="h-4 w-4" />}
                      >
                        {uploading ? "Mengunggah…" : "Galeri"}
                      </ActionButton>
                    </div>
                  </div>
                ) : (
                  /* Kisi foto dibungkus kotak, tombolnya ikut di dalam —
                     sejajar dengan jumlah foto supaya tidak perlu menggulir
                     ke bawah hanya untuk menambah satu foto lagi. */
                  <div className="rounded-2xl border border-slate-200 p-3 dark:border-slate-700/60">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                        {fotos.length} foto terlampir
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        <ActionButton
                          type="button"
                          size="sm"
                          onClick={bukaKamera}
                          disabled={uploading}
                          icon={<Camera className="h-4 w-4" />}
                        >
                          Kamera
                        </ActionButton>
                        <ActionButton
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => fileRef.current?.click()}
                          disabled={uploading}
                          icon={<UploadCloud className="h-4 w-4" />}
                        >
                          {uploading ? "Mengunggah…" : "Galeri"}
                        </ActionButton>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                      {fotos.map((f, index) => (
                        <figure
                          key={f.publicId}
                          className="group relative overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700/60"
                        >
                          {/* Ketuk gambar untuk mengeceknya ukuran penuh. */}
                          <button
                            type="button"
                            onClick={() => setLihatFoto(index)}
                            className="block w-full"
                            aria-label={`Perbesar ${f.namaFile}`}
                          >
                            <img
                              src={f.previewUrl}
                              alt={f.namaFile}
                              className="aspect-[4/3] w-full object-cover transition-transform duration-200 group-hover:scale-105"
                              loading="lazy"
                            />
                            <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-950/0 transition-colors group-hover:bg-slate-950/45">
                              <span className="rounded-full bg-black/60 p-2 text-white opacity-0 transition-opacity group-hover:opacity-100">
                                <Eye className="h-4 w-4" />
                              </span>
                            </span>
                          </button>

                          <div className="absolute right-1.5 top-1.5 flex gap-1">
                            <button
                              type="button"
                              onClick={() => unduhFoto(f)}
                              className="rounded-md bg-black/65 p-1 text-white transition-colors hover:bg-black/85 focus-visible:opacity-100"
                              aria-label={`Unduh ${f.namaFile}`}
                              title="Unduh foto"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeFoto(f.publicId)}
                              className="rounded-md bg-black/65 p-1 text-white transition-colors hover:bg-rose-600 focus-visible:opacity-100"
                              aria-label={`Hapus ${f.namaFile}`}
                              title="Hapus foto"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>

                          <figcaption className="space-y-0.5 bg-white dark:bg-slate-800/60 px-2 py-1.5">
                            <p className="truncate text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                              {f.namaFile}
                            </p>
                            <p className="text-[10px] text-slate-400 dark:text-slate-500">
                              {f.width}×{f.height} · {formatBytes(f.ukuranBytes)}
                            </p>
                          </figcaption>
                        </figure>
                      ))}
                    </div>

                    {fotos.length > 0 ? (
                      <div className="mt-3 flex justify-center">
                        <ActionButton
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={clearAllFotos}
                          icon={<Trash2 className="h-3.5 w-3.5" />}
                        >
                          Hapus Semua Foto ({fotos.length})
                        </ActionButton>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>

              {/* ── 6. AKSI SIMPAN ── */}
              <div className="pt-6 flex flex-wrap items-center justify-end gap-3">
                <ActionButton
                  type="button"
                  onClick={() => void handleSimpan()}
                  disabled={uploading}
                  icon={<ClipboardCheck className="h-4 w-4" />}
                  className="!px-6 !py-2.5 text-sm"
                >
                  Simpan Laporan Penindakan
                </ActionButton>
              </div>
            </div>
          </Card>
        </div>

      {/* Modal tambah titik tidak berizin */}
      <Modal
        open={modalTitikBaru}
        onClose={() => setModalTitikBaru(false)}
        title="Tambah Titik Reklame Tanpa Izin"
        icon={<Plus className="w-4 h-4 text-amber-500" />}
        size="lg"
        footer={
          <div className="flex items-center justify-end gap-3 w-full">
            <ActionButton variant="secondary" onClick={() => setModalTitikBaru(false)}>
              Batal
            </ActionButton>
            <ActionButton
              onClick={() => void handleSimpanTitik()}
              disabled={menyimpanTitik}
              icon={<Plus className="h-4 w-4" />}
            >
              {menyimpanTitik
                ? "Menyimpan…"
                : barisTitik.length > 1
                  ? `Simpan ${barisTitik.length} Titik & Lanjut Laporan`
                  : "Simpan & Lanjut Laporan"}
            </ActionButton>
          </div>
        }
      >
        <TitikMassal
          alamat={alamatTitik}
          onAlamatUbah={setAlamatTitik}
          coords={coordsTitik ?? coords}
          onCoordsUbah={setCoordsTitik}
          baris={barisTitik}
          onBarisUbah={setBarisTitik}
        />
      </Modal>

      {/* Modal Pemilih Koordinat Peta */}
      <MapPickerModal
        open={mapPickerOpen}
        onClose={() => setMapPickerOpen(false)}
        initialLat={coordsTitik?.lat ?? coords?.lat}
        initialLng={coordsTitik?.lng ?? coords?.lng}
        onSelect={(pos) => setCoordsTitik(pos)}
      />

      {/* Kamera web — hanya di PC; ponsel lewat kamera native. */}
      <KameraWeb
        open={kameraWebOpen}
        onClose={() => setKameraWebOpen(false)}
        onCapture={terimaBlobKamera}
      />

      {/* Penampil foto bukti — cek dulu sebelum laporan disimpan */}
      <FotoViewer
        open={lihatFoto !== null}
        fotos={fotos.map((f) => ({
          namaFile: f.namaFile,
          src: f.previewUrl,
          width: f.width,
          height: f.height,
          ukuranBytes: f.ukuranBytes,
        }))}
        index={lihatFoto}
        onIndexChange={setLihatFoto}
        onClose={() => setLihatFoto(null)}
      />
    </AppLayout>
  )
}
