import { useEffect, useMemo, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { CheckCircle2, MapPin, Pencil, RotateCcw, Save, Search, Trash2 } from "lucide-react"
import { AppLayout } from "@/components/layout"
import { DataStatusBanner } from "@/components/common/DataStatusBanner"
import { KerangkaDataReklame } from "@/components/common/Kerangka"
import {
  ActionButton,
  Badge,
  Card,
  DataTable,
  Field,
  Input,
  InputWithIcon,
  Pagination,
  Textarea,
  type Column,
} from "@/components/ui/primitives"
import { Dropdown } from "@/components/ui/Dropdown"
import { ConfirmDialog, Modal } from "@/components/ui/Modal"
import { MapPickerModal } from "@/components/peta/MapPickerModal"
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

interface DraftTemuan {
  nama: string
  alamat: string
  lat: string
  lng: string
  keterangan: string
  jenisReklame: string
  panjang: string
  lebar: string
}

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
  const [petaTemuanTerbuka, setPetaTemuanTerbuka] = useState(false)

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
          <div className="grid w-[152px] grid-cols-[minmax(60px,1fr)_40px_40px] items-center gap-1.5">
            <ActionButton
              size="sm"
              variant="secondary"
              className={`w-full justify-center ${r.dariJANAKA ? "" : "col-span-3"}`}
              onClick={() => navigate(`/data-reklame/${r.id}`)}
            >
              Detail
            </ActionButton>
            {r.dariJANAKA ? (
              <>
              <ActionButton
                size="sm"
                variant="secondary"
                className="!h-8 !w-10 !px-0"
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
                className="!h-8 !w-10 !px-0"
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
        className: "w-[152px]",
      },
    ],
    [navigate, safePage, titikJanaka],
  )

  return (
    <AppLayout onRefresh={handleRefresh} refreshing={loading}>
      <Modal
        open={!!temuanEdit && !!draftEdit}
        title="Edit Temuan Lapangan"
        onClose={() => { if (!menyimpanEdit) { setTemuanEdit(null); setDraftEdit(null) } }}
        size="lg"
        footer={
          <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <ActionButton variant="secondary" disabled={menyimpanEdit} onClick={() => { setTemuanEdit(null); setDraftEdit(null) }}>Batal</ActionButton>
            <ActionButton loading={menyimpanEdit} onClick={() => void handleSimpanEdit()} icon={<Save className="h-4 w-4" />}>Simpan Perubahan</ActionButton>
          </div>
        }
      >
        {draftEdit ? <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nama / Nama Usaha" required htmlFor="edit-temuan-nama" className="sm:col-span-2">
            <Input id="edit-temuan-nama" value={draftEdit.nama} onChange={(e) => setDraftEdit((d) => d ? { ...d, nama: e.target.value } : d)} placeholder="Nama pemilik atau usaha" />
          </Field>
          <Field label="Alamat" htmlFor="edit-temuan-alamat" className="sm:col-span-2">
            <Input id="edit-temuan-alamat" value={draftEdit.alamat} onChange={(e) => setDraftEdit((d) => d ? { ...d, alamat: e.target.value } : d)} placeholder="Alamat lokasi temuan" />
          </Field>
          <div className="space-y-3 sm:col-span-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Latitude" required htmlFor="edit-temuan-lat">
                <Input id="edit-temuan-lat" type="number" step="any" value={draftEdit.lat} onChange={(e) => setDraftEdit((d) => d ? { ...d, lat: e.target.value } : d)} />
              </Field>
              <Field label="Longitude" required htmlFor="edit-temuan-lng">
                <Input id="edit-temuan-lng" type="number" step="any" value={draftEdit.lng} onChange={(e) => setDraftEdit((d) => d ? { ...d, lng: e.target.value } : d)} />
              </Field>
            </div>
            <ActionButton
              variant="secondary"
              onClick={() => setPetaTemuanTerbuka(true)}
              icon={<MapPin className="h-4 w-4" />}
            >
              Pilih Titik di Peta
            </ActionButton>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Klik lokasi pada peta atau geser pin. Koordinat akan terisi otomatis.
            </p>
          </div>
          <Field label="Jenis Reklame" htmlFor="edit-temuan-jenis">
            <Input id="edit-temuan-jenis" value={draftEdit.jenisReklame} onChange={(e) => setDraftEdit((d) => d ? { ...d, jenisReklame: e.target.value } : d)} placeholder="Contoh: Billboard" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Panjang (cm)" htmlFor="edit-temuan-panjang">
              <Input id="edit-temuan-panjang" type="number" min="0" step="any" value={draftEdit.panjang} onChange={(e) => setDraftEdit((d) => d ? { ...d, panjang: e.target.value } : d)} />
            </Field>
            <Field label="Lebar (cm)" htmlFor="edit-temuan-lebar">
              <Input id="edit-temuan-lebar" type="number" min="0" step="any" value={draftEdit.lebar} onChange={(e) => setDraftEdit((d) => d ? { ...d, lebar: e.target.value } : d)} />
            </Field>
          </div>
          <Field label="Keterangan Temuan" htmlFor="edit-temuan-keterangan" className="sm:col-span-2">
            <Textarea id="edit-temuan-keterangan" value={draftEdit.keterangan} onChange={(e) => setDraftEdit((d) => d ? { ...d, keterangan: e.target.value } : d)} placeholder="Catatan kondisi atau temuan lapangan" />
          </Field>
        </div> : null}
      </Modal>
      <MapPickerModal
        open={petaTemuanTerbuka && !!draftEdit}
        onClose={() => setPetaTemuanTerbuka(false)}
        initialLat={draftEdit ? Number(draftEdit.lat) : undefined}
        initialLng={draftEdit ? Number(draftEdit.lng) : undefined}
        onSelect={(pos) => setDraftEdit((draft) => draft ? {
          ...draft,
          lat: String(pos.lat),
          lng: String(pos.lng),
        } : draft)}
        title="Pilih Lokasi Temuan"
      />
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

