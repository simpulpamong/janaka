import { useEffect, useMemo, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { CheckCircle2, Download, MapPin, Pencil, Plus, RotateCcw, Search, Trash2 } from "lucide-react"
import * as XLSX from "xlsx"
import { AppLayout } from "@/components/layout"
import { DataStatusBanner } from "@/components/common/DataStatusBanner"
import { KerangkaDataReklame } from "@/components/common/Kerangka"
import {
  ActionButton,
  Badge,
  Card,
  DataTable,
  Field,
  InputWithIcon,
  Pagination,
  type Column,
} from "@/components/ui/primitives"
import { Dropdown } from "@/components/ui/Dropdown"
import { ConfirmDialog, Modal } from "@/components/ui/Modal"
import { FieldFindingModal, type FieldFinding } from "@/components/common/FieldFindingModal"
import { OPSI_JENIS_REKLAME } from "@/lib/access"
import { useDebounce } from "@/hooks/useDebounce"
import { useToast } from "@/hooks/useToast"
import { useLaporan, useTitikJanaka } from "@/hooks/useLaporan"
import { useReklamaStore } from "@/hooks/useReklamaStore"
import { formatTanggalSingkat, hitungStatistik } from "@/utils"
import { titikJanakaKeReklameList } from "@/utils/titikJanaka"
import type { ReklameItem } from "@/utils/reklame"
import type { StatusSK } from "@/utils/format"
import type { TitikJanaka } from "@/types"
import type { TitikJanakaInput } from "@/services/laporanService"

const PAGE_SIZE = 10

/**
 * Opsi filter status.
 *
 * "Tanpa SK" ikut jadi salah satu opsi status, bukan tombol terpisah. Ia
 * sebenarnya penyaringan yang sama — titik tanpa SK — dan menaruhnya di
 * dropdown status membuat baris filter cukup satu baris, bukan dua.
 */
type FilterStatus = StatusSK | "TANPA_SK" | "SEMUA"

/** Kategori sumber data — memisahkan PTSP dari input JANAKA di satu tabel. */
type FilterSumber = "SEMUA" | "PTSP" | "JANAKA"

type DraftTemuan = FieldFinding

export default function ReklameList() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { showToast } = useToast()
  const {
    reklameList: daftarPtsp,
    loading,
    progress,
    error,
    stale,
    lastLoadedAt,
    loadReklamaList,
    refreshReklamaList,
  } = useReklamaStore()
  const { executedIds, laporanCount } = useLaporan()
  const { titik: titikJanaka, ubah: ubahTitik, hapus: hapusTitik } = useTitikJanaka()
  const [temuanHapus, setTemuanHapus] = useState<ReklameItem | null>(null)
  const [menghapus, setMenghapus] = useState(false)
  const [temuanEdit, setTemuanEdit] = useState<TitikJanaka | null>(null)
  const [draftEdit, setDraftEdit] = useState<DraftTemuan | null>(null)
  const [menyimpanEdit, setMenyimpanEdit] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [exportSource, setExportSource] = useState<FilterSumber>("SEMUA")
  const [exportStatus, setExportStatus] = useState<FilterStatus>("SEMUA")
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState(0)
  const [tambahOpen, setTambahOpen] = useState(false)
  const [tambahSaving, setTambahSaving] = useState(false)
  const [tambahForm, setTambahForm] = useState({ nama: "", alamat: "", jenisReklame: OPSI_JENIS_REKLAME[0]?.value ?? "Papan Nama Tiang", lat: "", lng: "", keterangan: "", panjang: "", lebar: "" })

  const [search, setSearch] = useState(searchParams.get("search") ?? "")
  const [status, setStatus] = useState<FilterStatus>(
    (searchParams.get("status") as FilterStatus | null) ?? "SEMUA",
  )
  const [sumber, setSumber] = useState<FilterSumber>(
    (searchParams.get("sumber") as FilterSumber | null) ?? "SEMUA",
  )
  const [page, setPage] = useState(1)

  const debouncedSearch = useDebounce(search, 300)

  useEffect(() => {
    if (daftarPtsp.length === 0 && lastLoadedAt === null && !loading && !error) {
      void loadReklamaList({ per_page: 200 })
    }
  }, [daftarPtsp.length, lastLoadedAt, loading, error, loadReklamaList])

  /*
   * Gabung PTSP + JANAKA menjadi satu daftar.
   *
   * Titik JANAKA dinormalkan lebih dulu supaya bentuknya sama dengan item
   * PTSP — satu tabel, satu kolom, tanpa percabangan di tempat lain.
   */
  const reklameList = useMemo<ReklameItem[]>(
    () => [...titikJanakaKeReklameList(titikJanaka), ...daftarPtsp],
    [titikJanaka, daftarPtsp],
  )

  /* URL ikut berubah agar filter bisa dibagikan & tombol "kembali" bekerja. */
  useEffect(() => {
    const next = new URLSearchParams()
    if (debouncedSearch) next.set("search", debouncedSearch)
    if (status !== "SEMUA") next.set("status", status)
    if (sumber !== "SEMUA") next.set("sumber", sumber)
    setSearchParams(next, { replace: true })
  }, [debouncedSearch, status, sumber, setSearchParams])

  const stats = useMemo(() => hitungStatistik(reklameList), [reklameList])

  /* Jumlah tiap sumber, dihitung dari daftar yang sama dengan tabel.
     Bukan dari `meta.total` PTSP: itu jumlah seluruh data di server,
     sementara tabel hanya memuat satu halaman muat. Menampilkan angka
     yang tidak cocok dengan baris yang terlihat lebih membingungkan
     daripada memberi batas nyata. */
  const jumlahSumber = useMemo(
    () => ({
      ptsp: reklameList.filter((r) => !r.dariJANAKA).length,
      janaka: reklameList.filter((r) => r.dariJANAKA).length,
      tanpaSK: reklameList.filter((r) => !r.adaSK).length,
    }),
    [reklameList],
  )

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase()
    return reklameList.filter((r) => {
      if (status === "TANPA_SK" && r.adaSK) return false
      else if (status !== "SEMUA" && status !== "TANPA_SK" && r.statusSK !== status) return false
      if (sumber === "PTSP" && r.dariJANAKA) return false
      if (sumber === "JANAKA" && !r.dariJANAKA) return false
      if (q === "") return true
      return (
        r.namaPemilik.toLowerCase().includes(q) ||
        r.naskahReklame.toLowerCase().includes(q) ||
        r.alamat.toLowerCase().includes(q) ||
        r.jenisReklame.toLowerCase().includes(q) ||
        r.noSK.toLowerCase().includes(q) ||
        r.kecamatan.toLowerCase().includes(q) ||
        r.desa.toLowerCase().includes(q)
      )
    })
  }, [reklameList, debouncedSearch, status, sumber])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageData = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const hasFilter = search !== "" || status !== "SEMUA" || sumber !== "SEMUA"

  const resetFilters = () => {
    setSearch("")
    setStatus("SEMUA")
    setSumber("SEMUA")
    setPage(1)
  }

  const handleExport = async () => {
    setExporting(true)
    setExportProgress(10)
    await new Promise((resolve) => setTimeout(resolve, 80))
    const rows = reklameList.filter((r) => {
      if (exportSource === "PTSP" && r.dariJANAKA) return false
      if (exportSource === "JANAKA" && !r.dariJANAKA) return false
      if (exportStatus === "TANPA_SK") return !r.adaSK
      if (exportStatus !== "SEMUA" && r.statusSK !== exportStatus) return false
      return true
    })
    setExportProgress(45)
    const data = rows.map((r, i) => ({
      "No": i + 1, "Sumber": r.dariJANAKA ? "Temuan Lapangan" : "PTSP",
      "Nama Pemilik": r.namaPemilik, "Naskah Reklame": r.naskahReklame,
      "Alamat": r.alamat, "Desa": r.desa, "Kecamatan": r.kecamatan,
      "Jenis": r.jenisReklame, "Dimensi": r.dimensi, "No. SK": r.noSK,
      "Berlaku Sampai": r.berlakuSampai ?? "-", "Status": r.statusSK,
      "Latitude": r.hasCoordinate ? r.lat : "-", "Longitude": r.hasCoordinate ? r.lng : "-",
      "Link SK": r.urlSK || "-",
    }))
    const sheet = XLSX.utils.json_to_sheet(data)
    sheet["!cols"] = Object.keys(data[0] ?? {}).map((key) => ({ wch: Math.min(48, Math.max(12, key.length + 4)) }))
    sheet["!freeze"] = { xSplit: 0, ySplit: 1 }
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, sheet, "Data Reklame")
    setExportProgress(80)
    XLSX.writeFile(book, `data-reklame-${new Date().toISOString().slice(0, 10)}.xlsx`)
    setExportProgress(100)
    await new Promise((resolve) => setTimeout(resolve, 500))
    setExporting(false)
    setExportOpen(false)
  }

  const handleTambahTitik = async (value: FieldFinding = tambahForm) => {
    const lat = Number(value.lat), lng = Number(value.lng)
    if (!value.nama.trim() || !Number.isFinite(lat) || !Number.isFinite(lng)) { showToast("Nama dan koordinat wajib diisi", "error"); return }
    setTambahSaving(true)
    try {
      const titik = titikJanaka.find((t) => t.id === "__new__")
      void titik
      await fetch("/api/janaka/titik:tambah", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nama: value.nama.trim(), alamat: value.alamat.trim(), lat, lng, jenisReklame: value.jenisReklame, keterangan: value.keterangan.trim(), panjang: Number(value.panjang) || 0, lebar: Number(value.lebar) || 0, petugas: "-" })
      })
      showToast("Titik temuan berhasil ditambahkan", "success")
      setTambahOpen(false)
      window.location.reload()
    } catch (err) { showToast(err instanceof Error ? err.message : "Gagal menambahkan titik", "error") } finally { setTambahSaving(false) }
  }

  const handleRefresh = () => {
    showToast("Memuat ulang data dari PTSP…", "info")
    void refreshReklamaList()
  }

  const handleHapusTemuan = async () => {
    if (!temuanHapus?.dariJANAKA || menghapus) return
    setMenghapus(true)
    try {
      await hapusTitik(temuanHapus.id.replace(/^janaka-/, ""))
      showToast("Temuan lapangan berhasil dihapus", "success")
      setTemuanHapus(null)
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal menghapus temuan lapangan", "error")
    } finally {
      setMenghapus(false)
    }
  }

  const mulaiEditTemuan = (item: ReklameItem) => {
    const sumber = titikJanaka.find((t) => t.id === item.id.replace(/^janaka-/, ""))
    if (!sumber) {
      showToast("Data temuan belum siap. Muat ulang daftar lalu coba lagi.", "error")
      return
    }
    setTemuanEdit(sumber)
    setDraftEdit({
      nama: sumber.nama ?? "",
      alamat: sumber.alamat ?? "",
      lat: String(sumber.lat ?? ""),
      lng: String(sumber.lng ?? ""),
      keterangan: sumber.keterangan ?? "",
      jenisReklame: sumber.jenisReklame ?? "",
      panjang: String(sumber.panjang ?? 0),
      lebar: String(sumber.lebar ?? 0),
    })
  }

  const handleSimpanEdit = async () => {
    if (!temuanEdit || !draftEdit || menyimpanEdit) return
    const lat = Number(draftEdit.lat)
    const lng = Number(draftEdit.lng)
    const panjang = Number(draftEdit.panjang)
    const lebar = Number(draftEdit.lebar)
    if (!draftEdit.nama.trim()) {
      showToast("Nama temuan wajib diisi", "error")
      return
    }
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
      showToast("Koordinat latitude atau longitude tidak valid", "error")
      return
    }
    if (!Number.isFinite(panjang) || panjang < 0 || !Number.isFinite(lebar) || lebar < 0) {
      showToast("Ukuran reklame harus berupa angka nol atau lebih", "error")
      return
    }

    const input: TitikJanakaInput = {
      nama: draftEdit.nama,
      alamat: draftEdit.alamat,
      lat,
      lng,
      keterangan: draftEdit.keterangan,
      jenisReklame: draftEdit.jenisReklame,
      panjang,
      lebar,
      petugas: temuanEdit.petugas || "-",
    }

    setMenyimpanEdit(true)
    try {
      await ubahTitik(temuanEdit.id, input)
      showToast("Temuan lapangan berhasil diperbarui", "success")
      setTemuanEdit(null)
      setDraftEdit(null)
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal menyimpan perubahan temuan", "error")
    } finally {
      setMenyimpanEdit(false)
    }
  }

  const kolom = useMemo<Column<ReklameItem>[]>(
    () => [
      {
        key: "no",
        header: "No.",
        render: (_r, idx) => (
          <span className="font-mono text-[13px] text-slate-500 dark:text-slate-400 font-semibold text-center block">
            {(safePage - 1) * PAGE_SIZE + (idx ?? 0) + 1}
          </span>
        ),
        className: "w-12 text-center",
      },
      {
        key: "nama",
        header: "Nama Pemilik / Naskah",
        mobileTitle: true,
        render: (r) => {
          const done = executedIds.has(r.id)
          const jumlah = laporanCount.get(r.id) ?? 0
          return (
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                  <p className="truncate font-semibold text-slate-950 dark:text-slate-100">
                  {r.namaPemilik}
                </p>
                {done ? (
                  <Badge tone="emerald" className="shrink-0">
                    <CheckCircle2 className="w-2.5 h-2.5" />
                    Ditindak
                  </Badge>
                ) : null}
              </div>
              <p className="truncate text-xs text-slate-700 dark:text-slate-300">
                {r.naskahReklame}
                {done && jumlah > 1 ? ` · ${jumlah}× laporan` : ""}
              </p>
            </div>
          )
        },
        className: "max-w-[190px]",
      },
      {
        key: "alamat",
        header: "Alamat",
        render: (r) => (
          <div className="min-w-0">
            <p className="truncate text-[13px] text-slate-900 dark:text-slate-200">{r.alamat}</p>
            <p className="truncate text-xs text-slate-700 dark:text-slate-300">
              {r.desa} · {r.kecamatan}
            </p>
          </div>
        ),
        className: "max-w-[200px]",
      },
      {
        key: "jenis",
        header: "Jenis",
        render: (r) => (
          <span className="text-[13px] text-slate-900 dark:text-slate-200">{r.jenisReklame}</span>
        ),
      },
      {
        key: "dimensi",
        header: "Dimensi",
        render: (r) => (
          <span className="whitespace-nowrap font-mono text-[13px]">
            {r.dimensi}
            <span className="block text-slate-400 dark:text-slate-500">{r.luasTanah} m²</span>
          </span>
        ),
      },
      {
        key: "noSK",
        header: "No. SK",
        render: (r) =>
          r.adaSK ? (
            <span className="block max-w-[160px] truncate font-mono text-[13px]">{r.noSK}</span>
          ) : (
            <span className="text-[13px] italic text-slate-700 dark:text-slate-300">Tidak ada</span>
          ),
        className: "max-w-[140px]",
      },
      {
        key: "berlaku",
        header: "Berlaku s.d.",
        render: (r) => (
          <span className="whitespace-nowrap font-mono text-[13px]">
            {r.adaSK ? formatTanggalSingkat(r.berlakuSampai) : "—"}
          </span>
        ),
      },
      {
        key: "status",
        header: "Status",
        render: (r) => (
          /*
           * Teks polos, bukan badge berwarna.
           *
           * Badge "Aktif" (hijau) / "Kadaluarsa" (merah) membuat seluruh
           * tabel berwarna-warni padahal yang penting cuma dibaca. Teks
           * kecil biasa lebih tenang dan tetap jelas. `whitespace-normal`
           * supaya label panjang terbungkus rapi, bukan memaksa kolom
           * melebar dan memakan tempat kolom lain.
           */
          <span className="block text-[13px] leading-snug text-slate-900 dark:text-slate-200">
            {r.statusSK}
            {r.statusApi === "belum_berizin" ? (
              <span className="block text-xs text-slate-700 dark:text-slate-300">belum berizin</span>
            ) : null}
          </span>
        ),
        className: "w-[92px]",
      },
      {
        key: "sumber",
        header: "Sumber",
        render: (r) => (
          <span className="block text-[13px] leading-snug text-slate-900 dark:text-slate-200">
            {r.dariJANAKA ? "Temuan Lapangan" : "PTSP"}
          </span>
        ),
        className: "w-[104px]",
      },
      {
        key: "aksi",
        header: "Aksi",
        render: (r) => (
          <div className="flex w-[190px] min-w-[190px] flex-nowrap items-center gap-1.5">
            <ActionButton
              size="sm"
              variant="secondary"
              className="!h-8 min-w-0 flex-1 justify-center whitespace-nowrap !px-2"
              onClick={() => navigate(`/data-reklame/${r.id}`)}
            >
              Detail
            </ActionButton>
            <ActionButton
              size="sm"
              variant="secondary"
              className="!h-8 !w-8 shrink-0 !px-0"
              aria-label={`Buka lokasi ${r.namaPemilik} di pemetaan`}
              title={r.hasCoordinate ? "Buka di Pemetaan" : "Koordinat belum tersedia"}
              disabled={!r.hasCoordinate}
              onClick={() => navigate(`/mapping?reklameId=${encodeURIComponent(r.id)}`)}
              icon={<MapPin className="h-4 w-4" />}
            >
              <span className="sr-only">Pemetaan</span>
            </ActionButton>
            {r.dariJANAKA ? (
              <>
              <ActionButton
                size="sm"
                variant="secondary"
                className="!h-8 !w-8 shrink-0 !px-0"
                aria-label={`Edit temuan ${r.namaPemilik}`}
                title="Edit temuan"
                onClick={() => mulaiEditTemuan(r)}
                icon={<Pencil className="h-4 w-4" />}
              >
                <span className="sr-only">Edit</span>
              </ActionButton>
              <ActionButton
                size="sm"
                variant="danger"
                className="!h-8 !w-8 shrink-0 !px-0"
                aria-label={`Hapus temuan ${r.namaPemilik}`}
                title="Hapus temuan"
                onClick={() => setTemuanHapus(r)}
                icon={<Trash2 className="h-4 w-4" />}
              >
                <span className="sr-only">Hapus</span>
              </ActionButton>
              </>
            ) : null}
          </div>
        ),
        className: "w-[190px] min-w-[190px]",
      },
    ],
    [navigate, safePage, titikJanaka],
  )

  return (
    <AppLayout onRefresh={handleRefresh} refreshing={loading}>
      <FieldFindingModal
        open={!!temuanEdit && !!draftEdit}
        title="Edit Temuan Lapangan"
        initial={draftEdit}
        saving={menyimpanEdit}
        submitLabel="Simpan Perubahan"
        onSubmit={(value) => { setDraftEdit(value); void handleSimpanEdit() }}
        onClose={() => { if (!menyimpanEdit) { setTemuanEdit(null); setDraftEdit(null) } }}
      />
      <FieldFindingModal
        open={tambahOpen}
        title="Tambah Titik Temuan Lapangan"
        saving={tambahSaving}
        onClose={() => { if (!tambahSaving) setTambahOpen(false) }}
        onSubmit={(value) => { setTambahForm(value); void handleTambahTitik(value) }}
      />
      <Modal open={exportOpen} onClose={() => { if (!exporting) setExportOpen(false) }} title="Export Data Reklame ke Excel" size="md" footer={<div className="flex justify-end gap-2"><ActionButton variant="secondary" disabled={exporting} onClick={() => setExportOpen(false)}>Batal</ActionButton><ActionButton loading={exporting} onClick={() => void handleExport()} icon={<Download className="h-4 w-4" />}>Export XLSX</ActionButton></div>}>
        <div className="space-y-4">
          <Field label="Sumber data"><Dropdown value={exportSource} onChange={(v) => setExportSource(v as FilterSumber)} opsi={[{ value: "SEMUA", label: "Semua data" }, { value: "PTSP", label: "PTSP saja" }, { value: "JANAKA", label: "Temuan lapangan saja" }]} /></Field>
          <Field label="Status"><Dropdown value={exportStatus} onChange={(v) => setExportStatus(v as FilterStatus)} opsi={[{ value: "SEMUA", label: "Semua status" }, { value: "Aktif", label: "Aktif" }, { value: "Akan Habis", label: "Akan habis" }, { value: "Kadaluarsa", label: "Kadaluarsa" }, { value: "TANPA_SK", label: "SK tidak ada" }]} /></Field>
          {exporting ? <div className="space-y-2"><div className="flex justify-between text-xs font-semibold"><span>Menyiapkan file Excel…</span><span>{exportProgress}%</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${exportProgress}%` }} /></div></div> : <p className="text-xs text-slate-500">Header, lebar kolom, freeze header, koordinat, dan tautan SK akan disertakan.</p>}
        </div>
      </Modal>
      <ConfirmDialog
        open={!!temuanHapus}
        tone="danger"
        title="Hapus Temuan Lapangan?"
        message={<>Temuan <span className="font-semibold">{temuanHapus?.namaPemilik}</span> akan dihapus permanen dan tidak dapat dikembalikan.</>}
        confirmLabel="Ya, Hapus Temuan"
        loading={menghapus}
        onConfirm={() => void handleHapusTemuan()}
        onCancel={() => { if (!menghapus) setTemuanHapus(null) }}
      />
      <div className="space-y-5">
        {loading && reklameList.length === 0 ? <KerangkaDataReklame /> : null}

        <DataStatusBanner
          loading={loading}
          progress={progress}
          error={error}
          stale={stale}
          count={reklameList.length}
          onRetry={() => void refreshReklamaList()}
        />

        <Card>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4 dark:border-slate-700/60"><div><h2 className="text-sm font-bold">Data Reklame</h2><p className="text-xs text-slate-500">{reklameList.length} data tersedia</p></div><div className="flex flex-wrap gap-2"><ActionButton size="sm" variant="secondary" onClick={() => setTambahOpen(true)} icon={<Plus className="h-4 w-4" />}>Tambah Titik Temuan</ActionButton><ActionButton size="sm" onClick={() => setExportOpen(true)} icon={<Download className="h-4 w-4" />}>Export Excel</ActionButton></div></div>
          {/*
            Satu baris: pencarian + dua dropdown, tiga kolom sama lebar.

            Sebelumnya pencarian memakai `1fr` sementara dua dropdown dikunci
            `168px`, jadi kolom tengah dan kanan selalu lebih sempit dari
            kiri — batas kolomnya tidak sejajar dan barisnya terlihat
            tanggung. Sekarang ketiganya `1fr`: pembatas kolom tegak lurus
            dari atas ke bawah, dan tampilannya persis sama dengan baris
            filter di Rekap Penindakan.
          */}
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:items-end sm:gap-3">
            <Field label="Pencarian" htmlFor="search" className="col-span-2 w-full sm:col-span-1">
              <InputWithIcon
                id="search"
                name="search"
                type="search"
                placeholder="Cari pemilik, naskah, alamat, nomor SK, desa…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
                icon={<Search className="w-4 h-4" />}
              />
            </Field>

            <Dropdown
              value={sumber}
              onChange={(v) => { setSumber(v as FilterSumber); setPage(1) }}
              aria-label="Sumber data"
              placeholder="Semua sumber"
              tipis
              opsi={[
                { value: "SEMUA", label: `Semua sumber (${stats.total})` },
                { value: "PTSP", label: `PTSP (${jumlahSumber.ptsp})` },
                { value: "JANAKA", label: `Temuan lapangan (${jumlahSumber.janaka})` },
              ]}
            />

            <Dropdown
              value={status}
              onChange={(v) => { setStatus(v as FilterStatus); setPage(1) }}
              aria-label="Status"
              placeholder="Semua status"
              tipis
              opsi={[
                { value: "SEMUA", label: `Semua status (${stats.total})` },
                { value: "Aktif", label: `Aktif (${stats.aktif})` },
                { value: "Akan Habis", label: `Akan habis (${stats.akanHabis})` },
                { value: "Kadaluarsa", label: `Kadaluarsa (${stats.kadaluarsa})` },
                { value: "TANPA_SK", label: `Tanpa SK (${jumlahSumber.tanpaSK})` },
              ]}
            />
          </div>

          {hasFilter ? (
            <div className="mb-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-3 dark:border-slate-700/60">
              <span className="text-[11px] text-slate-400 dark:text-slate-500">
                Menampilkan{" "}
                <span className="font-bold tabular-nums text-slate-600 dark:text-slate-300">
                  {filtered.length}
                </span>{" "}
                dari {stats.total} titik
              </span>
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700/60 dark:hover:text-slate-200"
              >
                <RotateCcw className="h-3 w-3" />
                Reset
              </button>
            </div>
          ) : null}

          <div className="mt-4">
            <DataTable
              columns={kolom}
              rows={pageData}
              keyOf={(r) => r.id}
              loading={loading && reklameList.length === 0}
              skeletonRows={PAGE_SIZE}
              alwaysTable
              bordered
              emptyMessage="Tidak ada titik reklame yang cocok dengan filter ini."
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
    </AppLayout>
  )
}

