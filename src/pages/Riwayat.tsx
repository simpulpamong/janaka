import { useCallback, useMemo, useState } from "react"
import {
  Eye,
  FileText,
  MapPin,
  Pencil,
  Printer,
  Search,
  Trash2,
  X,
} from "lucide-react"
import { AppLayout } from "@/components/layout"
import { FirestoreBanner } from "@/components/common/FirestoreBanner"
import { DateRangePicker } from "@/components/common/DateRangePicker"
import { KerangkaRekap } from "@/components/common/Kerangka"
import { bukaPeta } from "@/components/common/PetaLihat"
import { FotoViewer, type FotoViewerItem } from "@/components/common/FotoViewer"
import { PdfPreviewModal } from "@/components/common/PdfPreviewModal"
import { EditLaporanModal } from "@/components/common/EditLaporanModal"
import {
  ActionButton,
  Card,
  DataTable,
  Field,
  InputWithIcon,
  Pagination,
  StatTile,
  type Column,
} from "@/components/ui/primitives"
import { Dropdown } from "@/components/ui/Dropdown"
import { ConfirmDialog, Modal } from "@/components/ui/Modal"
import { useDebounce } from "@/hooks/useDebounce"
import { useLaporan } from "@/hooks/useLaporan"
import { useToast } from "@/hooks/useToast"
import { useAuth } from "@/context/AuthContext"
import { filterLaporan } from "@/services/laporanService"
import {
  buildFileName,
  buildRekapFileName,
  createBeritaAcaraPdf,
  createRekapPdf,
} from "@/lib/pdf"
import { formatTanggalLengkap, formatTanggalSingkat } from "@/utils"
import type { LaporanPenindakan } from "@/types"

const PAGE_SIZE = 12

export default function Riwayat() {
  const { showToast } = useToast()

  const { laporan, loading, error, reload, hapus } = useLaporan()
  const { can } = useAuth()

  const bolehHapus = can("aksiHapusLaporan")
  const bolehCetakRekap = can("aksiCetakRekap")

  const [search, setSearch] = useState("")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [sumber, setSumber] = useState<"SEMUA" | "PTSP" | "JANAKA">("SEMUA")
  const [page, setPage] = useState(1)

  /* ── Modal ── */
  const [detail, setDetail] = useState<LaporanPenindakan | null>(null)
  const [konfirmasiHapus, setKonfirmasiHapus] = useState<LaporanPenindakan | null>(null)
  const [editTarget, setEditTarget] = useState<LaporanPenindakan | null>(null)

  /* ── Pratinjau PDF ── */
  const [previewBA, setPreviewBA] = useState<LaporanPenindakan | null>(null)
  const [previewRekap, setPreviewRekap] = useState(false)

  /* ── Galeri foto ── */
  const [galeriFotos, setGaleriFotos] = useState<FotoViewerItem[]>([])
  const [galeriIndex, setGaleriIndex] = useState<number | null>(null)

  const galeriIndexChange = useCallback(
    (i: number) => {
      if (galeriFotos.length === 0) return
      setGaleriIndex(((i % galeriFotos.length) + galeriFotos.length) % galeriFotos.length)
    },
    [galeriFotos.length],
  )

  const tutupGaleri = useCallback(() => setGaleriIndex(null), [])

  /** Buka galeri dari baris tabel — foto tersimpan, tidak perlu buka detail. */
  const bukaGaleri = useCallback((l: LaporanPenindakan, index = 0) => {
    const fotos: FotoViewerItem[] = (l.fotoBukti ?? []).map((f) => ({
      namaFile: f.namaFile,
      src: f.url,
      width: f.width,
      height: f.height,
      ukuranBytes: f.ukuranBytes,
    }))
    setGaleriFotos(fotos)
    setGaleriIndex(index)
  }, [])

  const debouncedSearch = useDebounce(search, 300)

  const filtered = useMemo(
    () =>
      filterLaporan(laporan, {
        search: debouncedSearch,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        sumber,
      }),
    [laporan, debouncedSearch, startDate, endDate, sumber],
  )

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageData = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const hasFilter =
    search !== "" || startDate !== "" || endDate !== "" || sumber !== "SEMUA"

  const resetFilters = () => {
    setSearch("")
    setStartDate("")
    setEndDate("")
    setSumber("SEMUA")
    setPage(1)
  }

  /* ── Periode rekap ── */
  const periodeRekap =
    startDate && endDate
      ? `${formatTanggalSingkat(startDate)} s.d. ${formatTanggalSingkat(endDate)}`
      : startDate
        ? `Mulai ${formatTanggalSingkat(startDate)}`
        : "Seluruh Periode"

  const fileSlugRekap = startDate && endDate ? `${startDate}_sd_${endDate}` : "semua-periode"

  /*
   * Pembangun PDF dibuat stabil (useCallback) karena masuk ke dependensi
   * `useEffect` di `PdfPreviewModal`. Kalau dibuat inline, identitasnya
   * berubah tiap render dan dokumen di-fetch ulang terus-menerus.
   */
  const buatPdfRekap = useCallback(
    () =>
      Promise.resolve(
        createRekapPdf({
          laporan: filtered,
          judul: "Rekapitulasi Riwayat Penindakan Reklame",
          periode: periodeRekap,
        }),
      ),
    [filtered, periodeRekap],
  )

  const buatPdfBA = useCallback(
    (l: LaporanPenindakan | null) => () => {
      if (!l) return Promise.reject(new Error("Laporan tidak dipilih."))
      return createBeritaAcaraPdf({ laporan: l })
    },
    [],
  )

  const namaFileBA = useCallback(
    (l: LaporanPenindakan | null) => (l ? buildFileName(l) : "berita-acara.pdf"),
    [],
  )

  const handleHapus = async () => {
    if (!konfirmasiHapus) return
    if (!bolehHapus) {
      showToast("Anda tidak memiliki izin menghapus laporan.", "error")
      return
    }
    try {
      await hapus(konfirmasiHapus.id)
      setKonfirmasiHapus(null)
      setDetail(null)
      showToast("Laporan dihapus", "info")
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal menghapus laporan", "error")
    }
  }

  const bulanIni = new Date().toISOString().slice(0, 7)

  /*
   * Kolom tabel.
   *
   * "Tindakan" sudah tidak dipakai sebagai kategori — semua penindakan di
   * lapangan adalah pembongkaran, kategorinya jadi bias. Kolom itu diganti
   * "Keterangan" yang isinya catatan petugas: di situ informasi yang benar
   * - benar membedakan satu laporan dari yang lain.
   */
  const kolomLaporan: Column<LaporanPenindakan>[] = [
    {
      /*
       * Nomor urut, sama seperti di Data Reklame.
       *
       * Penomoran ikut pindah halaman, supaya "laporan nomor 13" tetap punya
       * arti yang sama walau yang dibuka halaman kedua. Tanpa itu setiap
       * halaman dimulai dari 1, dan nomor yang disebut di lapangan jadi
       * ambigu.
       */
      key: "no",
      header: "No.",
      render: (_l, idx) => (
        <span className="block text-right font-mono text-[13px] font-semibold text-slate-900 dark:text-slate-200">
          {(safePage - 1) * PAGE_SIZE + (idx ?? 0) + 1}
        </span>
      ),
      className: "w-12 text-center",
    },
    {
      key: "tanggal",
      header: "Tanggal",
      render: (l) => (
        <span className="whitespace-nowrap font-mono text-[13px]">
          {formatTanggalLengkap(l.tanggal)}
          <span className="block text-slate-700 dark:text-slate-300">{l.waktu}</span>
        </span>
      ),
    },
    {
      key: "titik",
      header: "Titik Reklame",
      mobileTitle: true,
      render: (l) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-950 dark:text-slate-100">
            {l.reklameNama}
          </p>
          <p className="truncate text-xs text-slate-700 dark:text-slate-300">
            {l.reklameAlamat}
          </p>
        </div>
      ),
      className: "max-w-[190px]",
    },
    {
      key: "koordinat",
      header: "Koordinat",
      render: (l) => (
        <button
          type="button"
          onClick={() => bukaPeta(Number(l.lat), Number(l.lng), l.reklameNama)}
          className="group flex items-center gap-1 font-mono text-[13px] text-blue-600 transition-colors hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
          title="Buka di peta"
        >
          <MapPin className="h-3 w-3 shrink-0 opacity-60 group-hover:opacity-100" />
          <span className="truncate">
            {Number(l.lat).toFixed(5)}, {Number(l.lng).toFixed(5)}
          </span>
        </button>
      ),
      className: "max-w-[150px]",
    },
    {
      key: "keterangan",
      header: "Keterangan",
      render: (l) => (
        <p className="max-w-[220px] truncate text-[13px] text-slate-900 dark:text-slate-200" title={l.catatanPetugas}>
          {l.catatanPetugas || "-"}
        </p>
      ),
      className: "max-w-[220px]",
    },
    {
      key: "sumber",
      header: "Sumber",
      /*
       * Teks polos, bukan badge berwarna.
       *
       * Dulu satu kotak warna penuh per baris — seluruh tabel jadi
       * berwarna-warni padahal yang penting cuma dibaca. Teks kecil biasa
       * lebih tenang dan sama jelasnya.
       */
      render: (l) => (
        <span className="block text-[13px] leading-snug text-slate-900 dark:text-slate-200">
          {l.dariJANAKA ? "Temuan Lapangan" : "PTSP"}
        </span>
      ),
      className: "w-[104px]",
    },
    {
      key: "foto",
      header: "Foto",
      render: (l) => {
        const jumlah = l.fotoBukti?.length ?? 0
        if (jumlah === 0) {
          return <span className="text-[13px] italic text-slate-400 dark:text-slate-500">—</span>
        }
        return (
          <ActionButton
            size="sm"
            variant="secondary"
            onClick={() => bukaGaleri(l, 0)}
            icon={<Eye className="h-3.5 w-3.5" />}
            title={`Lihat ${jumlah} foto dokumentasi`}
          >
            {jumlah}
          </ActionButton>
        )
      },
      className: "w-[76px]",
    },
    {
      key: "aksi",
      header: "Aksi",
      render: (l) => (
        <div className="inline-flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white p-1 shadow-xs dark:border-slate-700 dark:bg-slate-800/70">
          <ActionButton
            size="sm"
            variant="ghost"
            className="!px-2 !py-1.5"
            onClick={() => setDetail(l)}
            icon={<Eye className="h-3.5 w-3.5" />}
            title="Detail laporan"
          />
          <ActionButton
            size="sm"
            variant="ghost"
            className="!px-2 !py-1.5"
            onClick={() => setPreviewBA(l)}
            icon={<Printer className="h-3.5 w-3.5" />}
            title="Pratinjau & cetak Berita Acara"
          />
          <ActionButton
            size="sm"
            variant="ghost"
            className="!px-2 !py-1.5"
            onClick={() => setEditTarget(l)}
            icon={<Pencil className="h-3.5 w-3.5" />}
            title="Ubah laporan"
          />
          {bolehHapus ? (
            <ActionButton
              size="sm"
              variant="ghost"
              className="!px-2 !py-1.5 text-rose-600 hover:text-rose-700 dark:text-rose-400"
              onClick={() => setKonfirmasiHapus(l)}
              icon={<Trash2 className="h-3.5 w-3.5" />}
              title="Hapus laporan"
            />
          ) : null}
        </div>
      ),
      className: "w-[148px]",
    },
  ]

  return (
    <AppLayout onRefresh={reload} refreshing={loading}>
      <div className="space-y-5">
        {loading && laporan.length === 0 ? <KerangkaRekap /> : null}

        <FirestoreBanner error={error} count={laporan.length} onRetry={reload} />

        {/* Statistik */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Total Laporan" value={laporan.length} tone="slate" />
          <StatTile
            label="Bulan Ini"
            value={laporan.filter((l) => l.tanggal?.startsWith(bulanIni)).length}
            tone="slate"
          />
          <StatTile
            label="Dari PTSP"
            value={laporan.filter((l) => !l.dariJANAKA).length}
            tone="slate"
          />
          <StatTile
            label="Input JANAKA"
            value={laporan.filter((l) => l.dariJANAKA).length}
            tone="slate"
          />
        </div>

        {/*
          Filter & tabel dalam satu kartu.

          Filter dulu menempati kartu sendiri, jadi halaman ini jadi tiga
          kartu bertumpuk (statistik, filter, tabel) dan tabel terdorong
          jauh ke bawah. Sekarang satu kartu: filter di atas, pemisah
          tipis, tabel di bawah — sama susunannya dengan Data Reklame.

          Tiga kontrol filter memakai lebar yang sama persis (`1fr`),
          tombol cetak menempel di kanan sebagai `auto`. Baris filter
          dan baris filter di Data Reklama karena itu kelihatan sama
          meski isinya berbeda: lebar kolom, tinggi kontrol (42px), dan
          perataan dasar semuanya identik.
        */}
        <Card>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end">
            <Field label="Pencarian" htmlFor="search" className="col-span-2 lg:col-span-1">
              <InputWithIcon
                id="search"
                name="search"
                type="search"
                placeholder="Nama, alamat, keterangan, nomor BA…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
                icon={<Search className="h-4 h-4" />}
              />
            </Field>

            <Field label="Rentang Tanggal" htmlFor="filterTanggal">
              <DateRangePicker
                id="filterTanggal"
                startDate={startDate}
                endDate={endDate}
                onChange={(start, end) => {
                  setStartDate(start)
                  setEndDate(end)
                  setPage(1)
                }}
              />
            </Field>

            <Field label="Sumber Data" htmlFor="filterSumber">
              <Dropdown
                id="filterSumber"
                value={sumber}
                onChange={(v) => {
                  setSumber(v as "SEMUA" | "PTSP" | "JANAKA")
                  setPage(1)
                }}
                tipis
                aria-label="Sumber Data"
                placeholder="Semua sumber"
                opsi={[
                  { value: "SEMUA", label: "Semua sumber" },
                  { value: "PTSP", label: "Data PTSP" },
                  { value: "JANAKA", label: "Input JANAKA" },
                ]}
              />
            </Field>

            {/* Cetak duduk sejajar baris input, bukan melayang di atas. */}
            {bolehCetakRekap ? (
              <div className="col-span-2 flex lg:col-span-1 lg:justify-end">
                <ActionButton
                  onClick={() => setPreviewRekap(true)}
                  disabled={filtered.length === 0}
                  className="w-full sm:w-auto"
                  icon={<Printer className="h-4 w-4" />}
                >
                  Cetak Rekap
                </ActionButton>
              </div>
            ) : null}
          </div>

          {/*
            Baris ini cuma memuat tombol Reset, dan hanya muncul kalau ada
            filter aktif — kalau tidak, tidak ada yang perlu ditampilkan.

            Dulu di sini ada dua hal lagi: rekap per kategori tindakan
            (satu baris yang selalu berisi "Teguran Tertulis" karena semua
            penindakan adalah pembongkaran) dan teks "N dari M laporan".
            Keduanya dibuang — tidak ada informasi yang hilang.
          */}
          {hasFilter ? (
            <div className="mt-4 flex items-center border-t border-slate-100 pt-4 dark:border-slate-700/60">
              <ActionButton
                variant="ghost"
                size="sm"
                onClick={resetFilters}
                className="ml-auto"
                icon={<X className="h-3.5 h-3.5" />}
              >
                Reset
              </ActionButton>
            </div>
          ) : null}

          <div className="mt-4">
            <DataTable
              columns={kolomLaporan}
              rows={pageData}
              keyOf={(l) => l.id}
              loading={loading && laporan.length === 0}
              skeletonRows={6}
              bordered
              emptyMessage={
                laporan.length === 0
                  ? "Riwayat akan terisi setelah petugas membuat laporan penindakan lapangan."
                  : "Tidak ada laporan yang cocok dengan filter."
              }
            />
          </div>

          <Pagination
            page={safePage}
            totalPages={totalPages}
            onChange={setPage}
            className="mt-4"
          />
        </Card>
      </div>

      {/* ── Modal detail ──
          Tombol hapus tidak ada di sini: hapus dilakukan dari baris tabel,
          jadi modal detail murni untuk membaca — bukan tempat bertindak. */}
      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title="Detail Laporan Penindakan"
        icon={<FileText className="w-4 h-4 text-blue-500" />}
        size="lg"
        footer={
          <div className="flex items-center justify-end gap-3 w-full">
            <ActionButton variant="secondary" onClick={() => setDetail(null)}>
              Tutup
            </ActionButton>
            <ActionButton
              onClick={() => {
                setPreviewBA(detail)
                setDetail(null)
              }}
              icon={<Printer className="h-4 w-4" />}
            >
              Pratinjau &amp; Cetak BA
            </ActionButton>
          </div>
        }
      >
        {detail ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <KV
                label="Nomor Berita Acara"
                value={detail.nomorBA || "-"}
              />
              <KV
                label="Tanggal"
                value={`${formatTanggalLengkap(detail.tanggal)} ${detail.waktu ?? ""}`}
              />
              <KV
                label="Sumber Data"
                value={detail.dariJANAKA ? "Temuan Lapangan" : "PTSP"}
              />
              {/*
                Baris "Petugas" dihapus.

                Field `petugas` memang ada di data, tapi tidak pernah diisi:
                `Execution` dan `Mapping` menyimpan "-" dan modal ubah pun
                tidak pernah menuliskannya. Yang tampil di sini cuma tanda
                hubung — membingungkan dan tidak informatif. Identitas
                petugas sebenarnya sudah diketahui sistem lewat akun yang
                sedang masuk.
              */}
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Lokasi
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
                {detail.reklameNama}
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400">{detail.reklameAlamat}</p>
              <button
                type="button"
                onClick={() => bukaPeta(Number(detail.lat), Number(detail.lng), detail.reklameNama)}
                className="mt-1.5 inline-flex items-center gap-1.5 font-mono text-xs text-blue-600 transition-colors hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                title="Buka koordinat di peta"
              >
                <MapPin className="h-3 w-3" />
                {Number(detail.lat).toFixed(6)}, {Number(detail.lng).toFixed(6)}
              </button>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Keterangan
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">
                {detail.catatanPetugas || "-"}
              </p>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Foto Dokumentasi ({detail.fotoBukti?.length ?? 0})
                </p>
                {(detail.fotoBukti?.length ?? 0) > 0 ? (
                  <ActionButton
                    size="sm"
                    variant="secondary"
                    onClick={() => bukaGaleri(detail, 0)}
                    icon={<Eye className="h-3.5 w-3.5" />}
                  >
                    Lihat Galeri
                  </ActionButton>
                ) : null}
              </div>
              {detail.fotoBukti?.length ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {detail.fotoBukti.map((f, i) => (
                    <button
                      key={f.publicId}
                      type="button"
                      onClick={() => bukaGaleri(detail, i)}
                      className="group relative block w-full overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700/60"
                    >
                      <img
                        src={f.url}
                        alt={f.namaFile}
                        className="aspect-[4/3] w-full object-cover transition-transform group-hover:scale-105"
                        loading="lazy"
                      />
                      <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-950/0 transition-colors group-hover:bg-slate-950/45">
                        <span className="rounded-full bg-black/60 p-2 text-white opacity-0 transition-opacity group-hover:opacity-100">
                          <Eye className="h-4 w-4" />
                        </span>
                      </span>
                      <span className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-2 py-1 text-[10px] text-white">
                        {f.namaFile}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-400 dark:text-slate-500">
                  Tidak ada foto terlampir.
                </p>
              )}
            </div>
          </div>
        ) : null}
      </Modal>

      {/* ── Pratinjau PDF: Berita Acara ── */}
      <PdfPreviewModal
        open={!!previewBA}
        onClose={() => setPreviewBA(null)}
        buatPdf={buatPdfBA(previewBA)}
        namaFile={namaFileBA(previewBA)}
        judul={previewBA ? `Berita Acara — ${previewBA.reklameNama}` : "Berita Acara"}
      />

      {/* ── Pratinjau PDF: Rekap ── */}
      <PdfPreviewModal
        open={previewRekap}
        onClose={() => setPreviewRekap(false)}
        buatPdf={buatPdfRekap}
        namaFile={buildRekapFileName(fileSlugRekap)}
        judul="Rekapitulasi Riwayat Penindakan"
      />

      {/* ── Ubah laporan ── */}
      <EditLaporanModal
        open={!!editTarget}
        laporan={editTarget}
        onClose={() => setEditTarget(null)}
        onTersimpan={reload}
      />

      {/* ── Konfirmasi hapus — dari baris tabel, bukan dari modal detail ── */}
      <ConfirmDialog
        open={!!konfirmasiHapus}
        tone="danger"
        title="Hapus Laporan?"
        message={
          <>
            Laporan untuk{" "}
            <span className="font-semibold text-slate-700 dark:text-slate-200">
              {konfirmasiHapus?.reklameNama}
            </span>{" "}
            tanggal {formatTanggalLengkap(konfirmasiHapus?.tanggal)} akan dihapus permanen dan
            tidak dapat dikembalikan.
          </>
        }
        confirmLabel="Ya, Hapus"
        cancelLabel="Batal"
        onConfirm={() => void handleHapus()}
        onCancel={() => setKonfirmasiHapus(null)}
      />

      {/* Foto bukti dibuka di dalam aplikasi, bukan tab baru. */}
      <FotoViewer
        open={galeriIndex !== null && galeriFotos.length > 0}
        fotos={galeriFotos}
        index={galeriIndex}
        onIndexChange={galeriIndexChange}
        onClose={tutupGaleri}
      />
    </AppLayout>
  )
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 dark:bg-slate-700/30 px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-semibold text-slate-800 dark:text-slate-100">
        {value || "-"}
      </p>
    </div>
  )
}
