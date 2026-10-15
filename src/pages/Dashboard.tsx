import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  ArrowRight,
  Building2,
  ExternalLink,
  FileText,
  MapPinned,
  MapPinOff,
  PieChart,
  Search,
  ShieldAlert,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react"
import { AppLayout } from "@/components/layout"
import { DataStatusBanner } from "@/components/common/DataStatusBanner"
import { StatusBadge } from "@/components/common/StatusBadge"
import { Modal } from "@/components/ui/Modal"
import {
  ActionButton,
  Badge,
  Card,
  CardTitle,
  DataTable,
  EmptyState,
  Pagination,
  StatTile,
  type Column,
} from "@/components/ui/primitives"
import { useLaporan, useTitikJanaka } from "@/hooks/useLaporan"
import { cn } from "@/lib/cn"
import { useReklamaStore } from "@/hooks/useReklamaStore"
import { KerangkaDashboard } from "@/components/common/Kerangka"
import { formatPersentase, formatTanggalSingkat, hitungStatistik } from "@/utils"
import type { ReklameItem, StatistikReklame } from "@/utils/reklame"

export default function Dashboard() {
  const navigate = useNavigate()
  const {
    reklameList,
    loading,
    progress,
    error,
    stale,
    meta,
    lastLoadedAt,
    loadReklamaList,
    refreshReklamaList,
  } = useReklamaStore()
  const { laporan, executedIds } = useLaporan()
  const { titik } = useTitikJanaka()

  const [modalTanpaSKOpen, setModalTanpaSKOpen] = useState(false)
  const [modalTanpaKoordinatOpen, setModalTanpaKoordinatOpen] = useState(false)

  useEffect(() => {
    if (reklameList.length === 0 && lastLoadedAt === null && !loading && !error) {
      void loadReklamaList({ per_page: 100 })
    }
  }, [reklameList.length, lastLoadedAt, loading, error, loadReklamaList])

  const stats = useMemo(() => hitungStatistik(reklameList), [reklameList])

  const daftarTanpaSK = useMemo(
    () => reklameList.filter((r) => !r.adaSK || r.statusApi === "belum_berizin"),
    [reklameList],
  )

  const daftarTanpaKoordinat = useMemo(
    () => reklameList.filter((r) => !r.hasCoordinate),
    [reklameList],
  )

  return (
    <AppLayout onRefresh={() => void refreshReklamaList()} refreshing={loading}>
      <div className="space-y-5">
        {/* Muat pertama: belum ada apa pun untuk ditampilkan, jadi jangan
            tampilkan angka nol yang lalu berubah jadi angka asli — lompatannya
            jauh lebih terasa daripada kerangka yang menahan tempatnya. */}
        {loading && reklameList.length === 0 ? <KerangkaDashboard /> : null}

        <DataStatusBanner
          loading={loading}
          progress={progress}
          error={error}
          stale={stale}
          count={reklameList.length}
          onRetry={() => void refreshReklamaList()}
        />

        {/* Statistik utama */}
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            label="Total Titik Reklame"
            value={loading && reklameList.length === 0 ? "—" : stats.total}
            hint={`${meta.total || "—"} data di PTSP`}
            icon={<MapPinned className="w-5 h-5 text-blue-500" />}
            tone="blue"
          />
          <StatTile
            label="Izin Aktif"
            value={loading && reklameList.length === 0 ? "—" : stats.aktif}
            hint={
              loading && reklameList.length === 0
                ? "Memuat…"
                : `${formatPersentase(stats.total ? (stats.aktif / stats.total) * 100 : 0, 0)} dari total`
            }
            icon={<ShieldCheck className="w-5 h-5 text-emerald-500" />}
            tone="emerald"
          />
          <StatTile
            label="Akan Habis"
            value={loading && reklameList.length === 0 ? "—" : stats.akanHabis}
            hint="≤ 30 hari sebelum berakhir"
            icon={<TriangleAlert className="w-5 h-5 text-amber-500" />}
            tone="amber"
            onClick={() => navigate("/data-reklame?status=Akan%20Habis")}
          />
          <StatTile
            label="Kadaluarsa"
            value={loading && reklameList.length === 0 ? "—" : stats.kadaluarsa}
            hint={`${formatPersentase(stats.persenKadaluarsa, 0)} dari total`}
            icon={<ShieldAlert className="w-5 h-5 text-rose-500" />}
            tone="rose"
            onClick={() => navigate("/data-reklame?status=Kadaluarsa")}
          />
        </section>

        {/* Grafik & Distribusi */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Card>
            <CardTitle
              description="Proporsi izin aktif, akan habis, dan kadaluarsa"
              action={
                <ActionButton
                  size="sm"
                  variant="secondary"
                  onClick={() => navigate("/mapping")}
                  icon={<ArrowRight className="h-3.5 w-3.5" />}
                >
                  Lihat Peta
                </ActionButton>
              }
            >
              Distribusi Status Perizinan
            </CardTitle>
            <StatusBarChart stats={stats} loading={loading && reklameList.length === 0} />
          </Card>

          <Card>
            <CardTitle
              description="Sebaran titik reklame berdasarkan jenis media dan konstruksi"
              action={
                <ActionButton
                  size="sm"
                  variant="secondary"
                  onClick={() => navigate("/data-reklame")}
                  icon={<ArrowRight className="h-3.5 w-3.5" />}
                >
                  Data Reklame
                </ActionButton>
              }
            >
              Komposisi Jenis Reklame
            </CardTitle>
            <JenisReklameDonutChart
              reklameList={reklameList}
              loading={loading && reklameList.length === 0}
            />
          </Card>
        </section>

        {/* Titik Tanpa SK & Tanpa Koordinat */}
        {(daftarTanpaSK.length > 0 || stats.tanpaKoordinat > 0) && (
          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {daftarTanpaSK.length > 0 ? (
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 px-4 py-3.5 sm:px-5 sm:py-4 shadow-xs transition-all">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300">
                    <ShieldAlert className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                        Titik Reklame Tanpa SK
                      </h3>
                      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                        ({daftarTanpaSK.length} titik)
                      </span>
                    </div>
                  </div>
                </div>
                <ActionButton
                  size="sm"
                  variant="secondary"
                  onClick={() => setModalTanpaSKOpen(true)}
                  icon={<FileText className="h-3.5 w-3.5" />}
                >
                  Lihat Daftar
                </ActionButton>
              </div>
            ) : null}

            {stats.tanpaKoordinat > 0 ? (
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 px-4 py-3.5 sm:px-5 sm:py-4 shadow-xs transition-all">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300">
                    <MapPinOff className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                        Titik Tanpa Koordinat
                      </h3>
                      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                        ({stats.tanpaKoordinat} titik)
                      </span>
                    </div>
                  </div>
                </div>
                <ActionButton
                  size="sm"
                  variant="secondary"
                  onClick={() => setModalTanpaKoordinatOpen(true)}
                  icon={<FileText className="h-3.5 w-3.5" />}
                >
                  Lihat Daftar
                </ActionButton>
              </div>
            ) : null}
          </section>
        )}

        {/* Aktivitas penindakan */}
        <section className="grid gap-5 lg:grid-cols-3">
          <Card>
            <CardTitle
              description={`${laporan.length} laporan tercatat`}
              action={
                <ActionButton size="sm" variant="ghost" onClick={() => navigate("/rekap")}>
                  Riwayat
                </ActionButton>
              }
            >
              Aktivitas Penindakan
            </CardTitle>

            {laporan.length === 0 ? (
              <EmptyState
                message="Belum ada laporan penindakan."
                icon={<ShieldCheck className="w-6 h-6" />}
              />
            ) : (
              /*
               Lima laporan terbaru, bukan rekap per kategori tindakan.
               Kategori tindakan sudah tidak dipakai — semua penindakan di
               lapangan adalah pembongkaran, jadi rekap itu cuma berisi satu
               baris yang selalu sama ("Teguran Tertulis: 1") dan tidak
               memberi informasi apa pun. Yang berguna justru tahu laporan
               apa yang terakhir masuk.
              */
              <div className="space-y-2.5">
                {laporan.slice(0, 5).map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => navigate("/rekap")}
                    className="group flex w-full items-start gap-2.5 rounded-xl border border-transparent p-2 text-left transition-colors hover:border-slate-200 hover:bg-slate-50 dark:hover:border-slate-700/60 dark:hover:bg-slate-800/50"
                  >
                    <span className="mt-0.5 shrink-0 font-mono text-[10px] font-bold tabular-nums text-slate-400 dark:text-slate-500">
                      {formatTanggalSingkat(l.tanggal)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold text-slate-700 dark:text-slate-200">
                        {l.reklameNama}
                      </span>
                      <span className="block truncate text-[10px] text-slate-400 dark:text-slate-500">
                        {l.fotoBukti?.length ?? 0} foto · {l.catatanPetugas || "tanpa keterangan"}
                      </span>
                    </span>
                    <span className="shrink-0 text-[10px] font-bold text-slate-400 dark:text-slate-500">
                      {l.dariJANAKA ? (
                        <ShieldAlert className="h-3 w-3 text-amber-500" />
                      ) : (
                        <Building2 className="h-3 w-3 text-slate-400" />
                      )}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <CardTitle>
              Progres Penindakan
            </CardTitle>
            <div className="grid grid-cols-2 gap-2.5">
              <MiniStat label="Sudah ditindak" value={`${executedIds.size} titik`} tone="emerald" />
              <MiniStat
                label="Belum ditindak"
                value={`${Math.max(0, reklameList.length - executedIds.size)} titik`}
                tone="slate"
              />
              <MiniStat
                label="Cakupan"
                value={
                  reklameList.length > 0
                    ? `${Math.round((executedIds.size / reklameList.length) * 100)}%`
                    : "0%"
                }
                tone="blue"
              />
              <MiniStat label="Titik JANAKA" value={`${titik.length} titik`} tone="violet" />
            </div>
          </Card>

          <Card>
            <CardTitle>
              Temuan Lapangan
            </CardTitle>
            <div className="space-y-3">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Total{" "}
                <span className="font-semibold text-slate-800 dark:text-slate-100">
                  {titik.length}
                </span>{" "}
                titik ditemukan saat patroli keliling dan dicatat sendiri oleh JANAKA.
              </p>
              <ActionButton
                block
                variant="secondary"
                onClick={() => navigate(titik.length > 0 ? "/mapping" : "/laporan")}
              >
                {titik.length > 0 ? "Lihat di Peta" : "Tambah Titik Tidak Berizin"}
              </ActionButton>
            </div>
          </Card>
        </section>

        {/* Modal Daftar Tanpa SK */}
        <ModalDaftarReklame
          open={modalTanpaSKOpen}
          onClose={() => setModalTanpaSKOpen(false)}
          title="Daftar Reklame Tanpa SK"
          badge={`${daftarTanpaSK.length} Titik`}
          badgeTone="rose"
          items={daftarTanpaSK}
          targetUrl="/data-reklame?tanpaSK=1"
          targetLabel="Buka di Menu Data Reklame"
        />

        {/* Modal Daftar Tanpa Koordinat */}
        <ModalDaftarReklame
          open={modalTanpaKoordinatOpen}
          onClose={() => setModalTanpaKoordinatOpen(false)}
          title="Daftar Reklame Tanpa Koordinat"
          badge={`${daftarTanpaKoordinat.length} Titik`}
          badgeTone="amber"
          items={daftarTanpaKoordinat}
          targetUrl="/data-reklame"
          targetLabel="Buka di Menu Data Reklame"
        />
      </div>
    </AppLayout>
  )
}

/* ── Statistik kecil di dalam kartu ── */
function MiniStat({
  label,
  value,
  tone = "slate",
}: {
  label: string
  value: string
  tone?: "slate" | "blue" | "emerald" | "amber" | "rose" | "violet"
}) {
  const warna = {
    slate: "bg-slate-100 dark:bg-slate-700/50 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-transparent",
    blue: "bg-blue-50/80 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-transparent",
    emerald: "bg-emerald-50/80 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-transparent",
    amber: "bg-amber-50/80 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-transparent",
    rose: "bg-rose-50/80 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-transparent",
    violet: "bg-violet-50/80 dark:bg-violet-500/10 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-transparent",
  }[tone]

  return (
    <div className={cn("rounded-xl px-3 py-2.5", warna)}>
      <p className="text-[10px] font-bold uppercase tracking-wider opacity-70">{label}</p>
      <p className="mt-0.5 text-sm font-bold font-mono">{value}</p>
    </div>
  )
}

/* ── Grafik batang status ── */
function StatusBarChart({ stats, loading }: { stats: StatistikReklame; loading: boolean }) {
  const rows = [
    { label: "Aktif", value: stats.aktif, color: "bg-emerald-500" },
    { label: "Akan Habis", value: stats.akanHabis, color: "bg-amber-500" },
    { label: "Kadaluarsa", value: stats.kadaluarsa, color: "bg-rose-500" },
  ]
  const max = Math.max(1, ...rows.map((r) => r.value))

  if (loading) {
    return (
      <div className="space-y-4" role="status" aria-label="Memuat distribusi status">
        {rows.map((row) => (
          <div key={row.label} className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="janaka-skeleton h-3 w-20 rounded" />
              <span className="janaka-skeleton h-3 w-16 rounded" />
            </div>
            <div className="janaka-skeleton h-2.5 w-full rounded-full" />
          </div>
        ))}
        <span className="sr-only">Memuat distribusi status…</span>
      </div>
    )
  }

  if (stats.total === 0) {
    return (
      <EmptyState
        message="Belum ada data untuk ditampilkan."
        hint="Data reklame diambil otomatis dari API PTSP. Muat ulang bila tabel tetap kosong."
      />
    )
  }

  return (
    <div className="space-y-4">
      {rows.map((row) => (
        <div key={row.label} className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-700 dark:text-slate-200">{row.label}</span>
            <span className="tabular-nums text-slate-400 dark:text-slate-500">
              {row.value} ·{" "}
              {formatPersentase(stats.total ? (row.value / stats.total) * 100 : 0, 0)}
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700/60">
            <div
              className={`h-full rounded-full ${row.color} transition-[width] duration-500`}
              style={{ width: `${(row.value / max) * 100}%` }}
            />
          </div>
        </div>
      ))}

      <div className="grid grid-cols-2 gap-2.5 border-t border-slate-100 dark:border-slate-700/60 pt-4 sm:grid-cols-4">
        <MiniStat label="Permanen" value={`${stats.permanen}`} />
        <MiniStat label="Belum berizin" value={`${stats.belumBerizin}`} tone="rose" />
        <MiniStat label="Berkoordinat" value={`${stats.denganKoordinat}`} tone="blue" />
        <MiniStat
          label="Total luas"
          value={`${stats.luasTotal.toLocaleString("id-ID", { maximumFractionDigits: 2 })} m²`}
        />
      </div>
    </div>
  )
}

/* ── Komposisi Jenis Reklame (Diagram Lingkaran / Donut Chart) ── */
const PALETTE_JENIS = [
  { stroke: "#3B82F6", bg: "bg-blue-500" },     // Biru
  { stroke: "#10B981", bg: "bg-emerald-500" },  // Hijau
  { stroke: "#8B5CF6", bg: "bg-violet-500" },   // Ungu
  { stroke: "#F59E0B", bg: "bg-amber-500" },    // Kuning Amber
  { stroke: "#EC4899", bg: "bg-pink-500" },     // Merah Muda
  { stroke: "#06B6D4", bg: "bg-cyan-500" },     // Cyan
  { stroke: "#F97316", bg: "bg-orange-500" },   // Oranye
  { stroke: "#64748B", bg: "bg-slate-400" },    // Abu-abu
]

interface SliceData {
  jenis: string
  count: number
  percent: number
  stroke: string
  bg: string
}

function JenisReklameDonutChart({
  reklameList,
  loading,
}: {
  reklameList: ReklameItem[]
  loading: boolean
}) {
  const RADIUS = 38
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS

  const { slices, total } = useMemo(() => {
    if (reklameList.length === 0) return { slices: [], total: 0 }

    const map = new Map<string, number>()
    for (const r of reklameList) {
      const raw = r.jenisReklame?.trim()
      const name = raw && raw !== "-" ? raw : "Lainnya"
      map.set(name, (map.get(name) || 0) + 1)
    }

    const sorted = Array.from(map.entries()).sort((a, b) => b[1] - a[1])
    const MAX_SLICES = 6
    let finalEntries: { jenis: string; count: number }[] = []

    if (sorted.length <= MAX_SLICES) {
      finalEntries = sorted.map(([jenis, count]) => ({ jenis, count }))
    } else {
      const top = sorted.slice(0, MAX_SLICES - 1).map(([jenis, count]) => ({ jenis, count }))
      const othersCount = sorted.slice(MAX_SLICES - 1).reduce((acc, [, c]) => acc + c, 0)
      const existingIdx = top.findIndex((t) => t.jenis.toLowerCase() === "lainnya")
      if (existingIdx >= 0) {
        top[existingIdx].count += othersCount
        finalEntries = top
      } else {
        finalEntries = [...top, { jenis: "Lainnya", count: othersCount }]
      }
    }

    const tot = reklameList.length
    const res: SliceData[] = finalEntries.map((item, idx) => {
      const pal = PALETTE_JENIS[idx % PALETTE_JENIS.length]
      return {
        jenis: item.jenis,
        count: item.count,
        percent: tot > 0 ? (item.count / tot) * 100 : 0,
        stroke: pal.stroke,
        bg: pal.bg,
      }
    })

    return { slices: res, total: tot }
  }, [reklameList])

  const offsets = useMemo(() => {
    let acc = 0
    return slices.map((s) => {
      const current = acc
      acc += (s.percent / 100) * CIRCUMFERENCE
      return current
    })
  }, [slices, CIRCUMFERENCE])

  if (loading) {
    return (
      <div className="flex flex-col sm:flex-row items-center gap-6 py-3">
        <div className="w-36 h-36 rounded-full janaka-skeleton shrink-0" />
        <div className="flex-1 w-full space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-1.5">
              <div className="flex justify-between">
                <span className="h-3 w-28 janaka-skeleton rounded" />
                <span className="h-3 w-12 janaka-skeleton rounded" />
              </div>
              <div className="h-1.5 w-full janaka-skeleton rounded-full" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (total === 0) {
    return (
      <EmptyState
        message="Belum ada data jenis reklame."
        hint="Kategori reklame akan otomatis terpetakan setelah data dari PTSP dimuat."
        icon={<PieChart className="w-6 h-6 text-slate-400" />}
      />
    )
  }

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6 py-1">
      {/* Donut Chart SVG */}
      <div className="relative flex items-center justify-center shrink-0">
        <svg
          viewBox="0 0 100 100"
          className="w-36 h-36 sm:w-44 sm:h-44 -rotate-90 transform drop-shadow-sm"
          aria-hidden="true"
        >
          {/* Background Ring */}
          <circle
            cx="50"
            cy="50"
            r={RADIUS}
            fill="transparent"
            stroke="currentColor"
            strokeWidth="11"
            className="text-slate-100 dark:text-slate-700/60"
          />

          {/* Slices */}
          {slices.map((slice, i) => {
            const dash = (slice.percent / 100) * CIRCUMFERENCE
            const offset = offsets[i]
            return (
              <circle
                key={slice.jenis}
                cx="50"
                cy="50"
                r={RADIUS}
                fill="transparent"
                stroke={slice.stroke}
                strokeWidth="11"
                strokeDasharray={`${dash} ${CIRCUMFERENCE}`}
                strokeDashoffset={-offset}
                className="transition-all duration-700 ease-out"
              />
            )
          })}
        </svg>

        {/* Center Label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
          <span className="font-mono text-xl sm:text-2xl font-bold text-slate-800 dark:text-slate-100 leading-none">
            {total}
          </span>
          <span className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Titik
          </span>
        </div>
      </div>

      {/* Legend & Breakdown Bars */}
      <div className="flex-1 min-w-0 space-y-2.5 w-full">
        {slices.map((slice) => (
          <div key={slice.jenis} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: slice.stroke }}
                />
                <span className="font-medium text-slate-700 dark:text-slate-200 truncate">
                  {slice.jenis}
                </span>
              </div>
              <span className="tabular-nums font-mono text-xs text-slate-500 dark:text-slate-400 shrink-0 ml-2">
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  {slice.count}
                </span>
                <span className="text-[11px] text-slate-400 dark:text-slate-500 ml-1">
                  ({slice.percent.toFixed(1)}%)
                </span>
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700/60">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.max(1, slice.percent)}%`, backgroundColor: slice.stroke }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Modal Daftar Titik Khusus (Tanpa SK / Tanpa Koordinat) ── */
function ModalDaftarReklame({
  open,
  onClose,
  title,
  subtitle,
  badge,
  badgeTone = "rose",
  items,
  targetUrl,
  targetLabel = "Buka di Data Reklame",
}: {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  badge?: string
  badgeTone?: "rose" | "amber" | "blue"
  items: ReklameItem[]
  targetUrl?: string
  targetLabel?: string
}) {
  const navigate = useNavigate()
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 8

  useEffect(() => {
    if (open) {
      setSearch("")
      setPage(1)
    }
  }, [open])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      (r) =>
        r.namaPemilik.toLowerCase().includes(q) ||
        r.naskahReklame.toLowerCase().includes(q) ||
        r.alamat.toLowerCase().includes(q) ||
        r.jenisReklame.toLowerCase().includes(q) ||
        r.kecamatan.toLowerCase().includes(q) ||
        r.desa.toLowerCase().includes(q),
    )
  }, [items, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageData = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const kolom = useMemo<Column<ReklameItem>[]>(
    () => [
      {
        key: "no",
        header: "No.",
        render: (_r, idx) => (
          <span className="font-mono text-xs text-slate-400 dark:text-slate-500 font-semibold text-center block">
            {(safePage - 1) * PAGE_SIZE + (idx ?? 0) + 1}
          </span>
        ),
        className: "w-12 text-center",
      },
      {
        key: "nama",
        header: "Nama Pemilik / Naskah",
        mobileTitle: true,
        render: (r) => (
          <div className="min-w-0">
            <p className="truncate font-semibold text-slate-800 dark:text-slate-100">
              {r.namaPemilik}
            </p>
            <p className="truncate text-[11px] text-slate-400 dark:text-slate-500">
              {r.naskahReklame}
            </p>
          </div>
        ),
        className: "max-w-[200px]",
      },
      {
        key: "jenis",
        header: "Jenis Reklame",
        render: (r) => (
          <span className="block truncate text-xs text-slate-700 dark:text-slate-300">
            {r.jenisReklame}
          </span>
        ),
        className: "max-w-[140px]",
      },
      {
        key: "alamat",
        header: "Alamat & Wilayah",
        render: (r) => (
          <span className="block max-w-[220px] truncate text-xs text-slate-500 dark:text-slate-400">
            {r.alamat}
          </span>
        ),
        className: "max-w-[200px]",
      },
      {
        key: "status",
        header: "Status",
        render: (r) => <StatusBadge status={r.statusSK} />,
        className: "w-28",
      },
      {
        key: "aksi",
        header: "",
        render: (r) => (
          <ActionButton
            size="sm"
            variant="secondary"
            onClick={() => {
              onClose()
              navigate(`/data-reklame/${r.id}`)
            }}
          >
            Detail
          </ActionButton>
        ),
        className: "w-20 text-right",
      },
    ],
    [safePage, navigate, onClose],
  )

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={
        <div className="flex items-center gap-2 flex-wrap">
          <span>{title}</span>
          {badge ? <Badge tone={badgeTone}>{badge}</Badge> : null}
        </div>
      }
      footer={
        <div className="flex items-center justify-between w-full flex-wrap gap-3">
          {targetUrl ? (
            <ActionButton
              size="sm"
              variant="secondary"
              onClick={() => {
                onClose()
                navigate(targetUrl)
              }}
              icon={<ExternalLink className="w-3.5 h-3.5" />}
            >
              {targetLabel}
            </ActionButton>
          ) : (
            <div />
          )}
          <ActionButton size="sm" variant="ghost" onClick={onClose}>
            Tutup
          </ActionButton>
        </div>
      }
    >
      <div className="space-y-4">
        {subtitle ? (
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            {subtitle}
          </p>
        ) : null}

        {/* Pencarian mini */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              placeholder="Cari pemilik, naskah, alamat…"
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <span className="text-xs text-slate-400 dark:text-slate-500">
            {filtered.length} dari {items.length} data
          </span>
        </div>

        {/* Tabel bordered dengan nomor */}
        <div className="border border-slate-200 dark:border-slate-700/80 rounded-xl overflow-hidden">
          <DataTable
            columns={kolom}
            rows={pageData}
            keyOf={(r) => r.id}
            bordered
            alwaysTable
            emptyMessage={
              search ? "Tidak ada data yang cocok dengan pencarian." : "Tidak ada data."
            }
          />
        </div>

        {/* Paginasi bila ada > 1 halaman */}
        {totalPages > 1 ? (
          <Pagination
            page={safePage}
            totalPages={totalPages}
            onChange={setPage}
            className="pt-1"
          />
        ) : null}
      </div>
    </Modal>
  )
}