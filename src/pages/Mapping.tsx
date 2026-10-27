import { useEffect, useMemo, useState, Suspense } from "react"
import { lazy } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import {
  FileText,
  MapPin,
  MapPinned,
  Plus,
  Search,
} from "lucide-react"

import { AppLayout } from "@/components/layout"
import { KerangkaPetaArea } from "@/components/common/Kerangka"
import { bukaPeta } from "@/components/common/PetaLihat"
import { FirestoreBanner } from "@/components/common/FirestoreBanner"
import {
  ActionButton,
  Badge,
  Card,
  EmptyState,
  InputWithIcon,
} from "@/components/ui/primitives"
import { Dropdown } from "@/components/ui/Dropdown"
import { Modal } from "@/components/ui/Modal"
import { FieldFindingModal, type FieldFinding } from "@/components/common/FieldFindingModal"
import { useDebounce } from "@/hooks/useDebounce"
import { useGeolocation } from "@/hooks/useGeolocation"
import { useLaporan, useTitikJanaka } from "@/hooks/useLaporan"
import { useReklamaStore } from "@/hooks/useReklamaStore"
import { useToast } from "@/hooks/useToast"
import { useAuth } from "@/context/AuthContext"

import type { StatusSK } from "@/utils/format"
import type { TitikPeta } from "@/types"



/**
 * Tinggi peta.
 *
 * Dulu tetap `680px`. Di layar 1080p itu berarti peta mulai ~1/4 dari bawah
 * viewport dan seluruh halaman harus digulir panjang hanya untuk melihat peta —
 * padahal peta adalah isi utama halaman ini.
 *
 * Sekarang peta mengisi sisa tinggi viewport: dikurangi topbar 56px, gutter
 * halaman (28px atas + 28px bawah di `lg`), jarak antar-bagian 20px, dan
 * toolbar filter ~58px — jadis sekitar `100dvh - 12rem`.
 *
 * ⚠️ Nilai ini dipakai sebagai **inline style** (`style={{ height }}`), bukan
 * sebagai kelas Tailwind. Karena itu bentuknya harus nilai CSS murni:
 * `min-h-[380px]` di sini tidak akan bekerja sama sekali.
 * `min()` juga membatasi peta agar tidak raksasa di monitor 4K.
 */
const TINGGI_PETA = "min(calc(100dvh - 12rem), 760px)"

type FilterStatus = StatusSK | "Tidak Berizin" | "SEMUA" | "Sudah Ditindak"

export default function Mapping() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const activeReklameId = searchParams.get("reklameId")

  const {
    reklameList,
    loading,
    error: apiError,
    stale,
    lastLoadedAt,
    loadReklamaList,
    refreshReklamaList,
  } = useReklamaStore()
  const { executedIds, laporanCount, error: laporanError, reload: reloadLaporan } = useLaporan()
  const { titik, tambah, error: titikError, reload: reloadTitik } = useTitikJanaka()
  const { coords } = useGeolocation()
  const { showToast } = useToast()
  const { can } = useAuth()
  const bolehTambahTitik = can("aksiTambahTitik")

  const [search, setSearch] = useState("")
  const [status, setStatus] = useState<FilterStatus>("SEMUA")
  const [sumberFilter, setSumberFilter] = useState<"SEMUA" | "PTSP" | "JANAKA">("SEMUA")
  const [selectedDetail, setSelectedDetail] = useState<TitikPeta | null>(null)
  const [mapFocusId] = useState<string | null>(activeReklameId)

  // State modal titik baru
  const [modalTitikBaru, setModalTitikBaru] = useState(false)
  const [formTitik, setFormTitik] = useState({
    nama: "",
    alamat: "",
    jenisReklame: "Papan Nama Tiang",
    panjang: "",
    lebar: "",
    keterangan: "",
  })
  const [coordsTitik, setCoordsTitik] = useState<{ lat: number; lng: number } | null>(null)
  const [menyimpanTitik, setMenyimpanTitik] = useState(false)

  const debouncedSearch = useDebounce(search, 300)

  // Isi koordinat awal saat GPS selesai mengambil jika koordinat form masih kosong
  useEffect(() => {
    if (coords && modalTitikBaru && !coordsTitik) {
      setCoordsTitik(coords)
    }
  }, [coords, modalTitikBaru, coordsTitik])

  const handleSimpanTitik = async () => {
    if (!formTitik.nama.trim()) {
      showToast("Isi nama / nama usaha reklame", "error")
      return
    }
    const finalCoords = coordsTitik ?? (coords ? { lat: coords.lat, lng: coords.lng } : null)
    if (!finalCoords) {
      showToast("Tentukan koordinat lokasi lewat peta atau GPS", "error")
      return
    }

    setMenyimpanTitik(true)
    try {
      await tambah({
        nama: formTitik.nama.trim(),
        alamat: formTitik.alamat.trim(),
        lat: finalCoords.lat,
        lng: finalCoords.lng,
        keterangan: formTitik.keterangan.trim(),
        jenisReklame: formTitik.jenisReklame,
        panjang: Number(formTitik.panjang) || 0,
        lebar: Number(formTitik.lebar) || 0,
        petugas: "-",
      })
      await reloadTitik()
      setModalTitikBaru(false)
      setFormTitik({
        nama: "",
        alamat: "",
        jenisReklame: "Papan Nama Tiang",
        panjang: "",
        lebar: "",
        keterangan: "",
      })
      setCoordsTitik(null)
      showToast("Titik tidak berizin berhasil ditambahkan ke peta", "success")
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal menyimpan titik", "error")
    } finally {
      setMenyimpanTitik(false)
    }
  }

  useEffect(() => {
    if (reklameList.length === 0 && lastLoadedAt === null && !loading && !apiError) {
      void loadReklamaList()
    }
  }, [reklameList.length, lastLoadedAt, loading, apiError, loadReklamaList])

  /* ── Gabungkan PTSP + JANAKA menjadi satu sumber peta ── */
  const semuaTitik: TitikPeta[] = useMemo(() => {
    const ptsp: TitikPeta[] = reklameList
      .filter((r) => r.hasCoordinate)
      .map((r) => ({
        id: r.id,
        sumber: "PTSP" as const,
        nama: r.namaPemilik,
        alamat: r.alamat,
        lat: r.lat,
        lng: r.lng,
        status: r.statusSK,
        statusDetail: r.statusDetail,
        noSK: r.noSK,
        jenisReklame: r.jenisReklame,
        dimensi: r.dimensi,
        sudahDieksekusi: executedIds.has(r.id),
        jumlahLaporan: laporanCount.get(r.id) ?? 0,
      }))

    const janaka: TitikPeta[] = titik
      .filter((t) => t.lat && t.lng)
      .map((t) => ({
        id: t.id,
        sumber: "JANAKA" as const,
        nama: t.nama,
        alamat: t.alamat,
        lat: t.lat,
        lng: t.lng,
        status: "Tidak Berizin" as const,
        statusDetail: t.keterangan || "Ditemukan saat patroli lapangan",
        noSK: "-",
        jenisReklame: t.jenisReklame,
        dimensi:
          t.panjang && t.lebar ? `${t.panjang} × ${t.lebar} cm` : "-",
        sudahDieksekusi: executedIds.has(t.id),
        jumlahLaporan: laporanCount.get(t.id) ?? t.laporanIds?.length ?? 0,
      }))

    return [...ptsp, ...janaka]
  }, [reklameList, titik, executedIds, laporanCount])

  /* ── Filter ── */
  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    return semuaTitik.filter((t) => {
      if (sumberFilter !== "SEMUA" && t.sumber !== sumberFilter) return false
      if (status !== "SEMUA") {
        if (status === "Sudah Ditindak") {
          if (!t.sudahDieksekusi) return false
        } else if (t.status !== status) {
          return false
        }
      }
      if (!q) return true
      return (
        t.nama.toLowerCase().includes(q) ||
        t.alamat.toLowerCase().includes(q) ||
        (t.noSK ?? "").toLowerCase().includes(q)
      )
    })
  }, [semuaTitik, debouncedSearch, status, sumberFilter])

  /* ── Handler simpan/hapus gambar ── */
  const handleSaveDrawings = async (geojson: any) => {
    try {
      const res = await fetch("/api/janaka/gambar:simpan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ geojson }),
      })
      if (!res.ok) throw new Error("Gagal menyimpan gambar")
    } catch (err) {
      console.error("Simpan gambar gagal:", err)
    }
  }

  const handleClearDrawings = async () => {
    try {
      await fetch("/api/janaka/gambar:hapus", { method: "POST" })
    } catch (err) {
      console.error("Hapus gambar gagal:", err)
    }
  }

  return (
    <AppLayout onRefresh={() => void refreshReklamaList()} refreshing={loading}>
      <div className="space-y-3">
        <FirestoreBanner
          error={laporanError ?? titikError}
          count={titik.length}
          onRetry={() => {
            reloadLaporan()
            reloadTitik()
          }}
        />

        {/* Filter Toolbar (1 Baris Tipis) */}
        <Card padded={false} className="p-2 sm:p-2.5 shadow-sm">
          <div className="grid grid-cols-2 items-center gap-2 md:flex">
            <div className="col-span-2 min-w-0 md:flex-1">
              <InputWithIcon
                name="searchMap"
                type="search"
                placeholder="Cari nama, alamat, atau nomor SK…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                icon={<Search className="w-4 h-4" />}
              />
            </div>
            <div className="min-w-0 shrink-0 md:w-44">
              <Dropdown
                id="sumberFilter"
                aria-label="Sumber Data"
                value={sumberFilter}
                onChange={(v: string) => setSumberFilter(v as "SEMUA" | "PTSP" | "JANAKA")}
                opsi={[
                  { value: "SEMUA", label: "Semua sumber", hint: "PTSP + temuan JANAKA" },
                  { value: "PTSP", label: "Data PTSP", hint: "Reklame terdaftar resmi" },
                  { value: "JANAKA", label: "Input JANAKA", hint: "Temuan patroli lapangan" },
                ]}
              />
            </div>
            <div className="min-w-0 shrink-0 md:w-48">
              <Dropdown
                id="statusFilter"
                aria-label="Status Reklame"
                value={status}
                onChange={(v: string) => setStatus(v as FilterStatus)}
                opsi={[
                  { value: "SEMUA", label: "Semua Status" },
                  { value: "Aktif", label: "Status: Aktif" },
                  { value: "Akan Habis", label: "Status: Akan Habis" },
                  { value: "Kadaluarsa", label: "Status: Kadaluarsa" },
                  { value: "Tidak Berizin", label: "Status: Tidak Berizin" },
                  { value: "Sudah Ditindak", label: "Status: Sudah Ditindak" },
                ]}
              />
            </div>
            <div className="col-span-2 shrink-0 md:col-span-1">
              <ActionButton
                variant="primary"
                size="md"
                className="w-full md:w-auto"
                onClick={() => setModalTitikBaru(true)}
                disabled={!bolehTambahTitik}
                title={!bolehTambahTitik ? "Anda tidak memiliki izin menambah titik" : undefined}
                icon={<Plus className="h-4 w-4" />}
              >
                Tambah Titik
              </ActionButton>
            </div>
          </div>

          {apiError ? (
            <p className="px-2 pt-1.5 text-xs text-amber-600 dark:text-amber-400">
              {apiError}
              {stale ? ` (menampilkan cache, ${reklameList.length} titik)` : ""}
            </p>
          ) : null}
        </Card>

        {/* Peta dengan fitur gambar (Bezel tipis, ukuran lebih besar) */}
        <Card padded={false} className="overflow-hidden p-1 sm:p-1.5 shadow-sm">
          {loading && reklameList.length === 0 ? (
            /*
             * Gunakan tinggi yang **sama persis** dengan peta asli.
             *
             * Semula di sini `h-[680px]` — angka mati yang tidak sama
             * dengan `TINGGI_PETA` (`min(calc(100dvh - 12rem), 760px)`).
             * Di layar pendek (jendela browser kecil, atau HP dengan
             * address bar terbuka) 680px jauh lebih tinggi dari peta yang
             * sebenarnya, jadi begitu data tiba seluruh halaman melompat.
             *
             * `KerangkaPetaArea` memakai `rounded-xl` dan tinggi yang sama
             * dengan peta asli, jadi kotak kerangka duduk persis di tempat
             * peta akan muncul.
             */
            <KerangkaPetaArea tinggi={TINGGI_PETA} />
          ) : filtered.length === 0 ? (
            <EmptyState
              message="Tidak ada titik untuk dipetakan"
              hint={
                semuaTitik.length === 0
                  ? "Data reklame belum termuat dari API PTSP. Muat ulang untuk mencoba kembali."
                  : "Tidak ada titik pada filter ini. Ubah filter atau tambahkan titik baru."
              }
              icon={<MapPinned className="w-6 h-6" />}
              action={
                <ActionButton
                  onClick={() => setModalTitikBaru(true)}
                  disabled={!bolehTambahTitik}
                  icon={<Plus className="w-4 h-4" />}
                >
                  Tambah Titik
                </ActionButton>
              }
            />
          ) : (
            <Suspense fallback={<KerangkaPetaArea tinggi={TINGGI_PETA} />}>
              <MapWithDraw
                items={filtered}
                totalTitik={filtered.length}
                height={TINGGI_PETA}
                onSaveDrawings={handleSaveDrawings}
                onClearDrawings={handleClearDrawings}
                onDetailClick={(item) => setSelectedDetail(item as TitikPeta)}
                onLokasiClick={(item) => bukaPeta(item.lat, item.lng, item.nama)}
                focusId={mapFocusId}
                // Fokus tetap dipertahankan agar popup tidak menutup sendiri saat
                // data PTSP/temuan selesai sinkron dan marker dirender ulang.
                onFocusHandled={() => undefined}
              />
            </Suspense>
          )}
        </Card>

        {/* Modal Detail Titik Reklame */}
        {selectedDetail && (
          <Modal
            open={!!selectedDetail}
            onClose={() => setSelectedDetail(null)}
            title="Detail Titik Reklame"
            icon={<MapPinned className="w-5 h-5 text-blue-600" />}
            size="md"
            footer={
              <div className="flex flex-wrap items-center justify-between gap-2 w-full">
                <button
                  type="button"
                  onClick={() =>
                    bukaPeta(selectedDetail.lat, selectedDetail.lng, selectedDetail.nama)
                  }
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <MapPin className="h-3.5 w-3.5 text-blue-500" />
                  Lihat Lokasi
                </button>
                <div className="flex items-center gap-2">
                  <ActionButton variant="secondary" onClick={() => setSelectedDetail(null)}>
                    Tutup
                  </ActionButton>
                  {selectedDetail.sumber === "PTSP" ? (
                    <ActionButton
                      onClick={() => {
                        const id = selectedDetail.id
                        setSelectedDetail(null)
                        navigate(`/data-reklame/${id}`)
                      }}
                      icon={<FileText className="w-3.5 h-3.5" />}
                    >
                      Detail Lengkap
                    </ActionButton>
                  ) : (
                    <ActionButton
                      onClick={() => {
                        setSelectedDetail(null)
                        navigate("/laporan")
                      }}
                      icon={<Plus className="w-3.5 h-3.5" />}
                    >
                      Input Tindakan
                    </ActionButton>
                  )}
                </div>
              </div>
            }
          >
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={selectedDetail.sumber === "JANAKA" ? "violet" : "blue"}>
                  {selectedDetail.sumber === "JANAKA" ? "Input JANAKA" : "Data PTSP"}
                </Badge>
                <Badge
                  tone={
                    selectedDetail.status === "Aktif"
                      ? "emerald"
                      : selectedDetail.status === "Akan Habis"
                        ? "amber"
                        : selectedDetail.status === "Kadaluarsa"
                          ? "rose"
                          : "violet"
                  }
                >
                  {selectedDetail.status}
                </Badge>
                {selectedDetail.sudahDieksekusi ? (
                  <Badge tone="emerald">✓ Sudah Ditindak</Badge>
                ) : null}
              </div>

              <div>
                <h4 className="text-base font-bold text-slate-800 dark:text-slate-100">
                  {selectedDetail.nama}
                </h4>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                  📍 {selectedDetail.alamat}
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-3.5 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Jenis Reklame</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {selectedDetail.jenisReklame || "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Dimensi</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {selectedDetail.dimensi || "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Nomor SK</span>
                  <span className="font-mono text-slate-800 dark:text-slate-200">
                    {selectedDetail.noSK || "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Koordinat</span>
                  <span className="font-mono text-slate-800 dark:text-slate-200">
                    {selectedDetail.lat.toFixed(6)}, {selectedDetail.lng.toFixed(6)}
                  </span>
                </div>
                {selectedDetail.statusDetail ? (
                  <div className="pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
                    <span className="text-slate-500 dark:text-slate-400 block mb-0.5">Keterangan:</span>
                    <span className="text-slate-700 dark:text-slate-300">
                      {selectedDetail.statusDetail}
                    </span>
                  </div>
                ) : null}
                {selectedDetail.jumlahLaporan > 0 ? (
                  <div className="pt-1 border-t border-slate-200/60 dark:border-slate-700/60 text-emerald-600 dark:text-emerald-400 font-semibold">
                    ⚡ Sudah tercatat {selectedDetail.jumlahLaporan} kali tindakan lapangan.
                  </div>
                ) : null}
              </div>
            </div>
          </Modal>
        )}

        <FieldFindingModal open={modalTitikBaru} onClose={() => setModalTitikBaru(false)} title="Tambah Titik Reklame Tanpa Izin" saving={menyimpanTitik} onSubmit={(value: FieldFinding) => {
          setFormTitik({ nama: value.nama, alamat: value.alamat, jenisReklame: value.jenisReklame, panjang: value.panjang, lebar: value.lebar, keterangan: value.keterangan })
          setCoordsTitik(value.lat && value.lng ? { lat: Number(value.lat), lng: Number(value.lng) } : null)
          void handleSimpanTitik()
        }} />

      </div>
    </AppLayout>
  )
}

const MapWithDraw = lazy(() => import("@/components/peta/MappingWithDraw").then(m => ({ default: m.MappingWithDraw })))
