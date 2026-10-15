import { useEffect, useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import {
  ArrowLeft,
  Building2,
  ClipboardCheck,
  FileText,
  Layers,
  MapPin,
  Ruler,
  Tag,
  User,
} from "lucide-react"
import { AppLayout } from "@/components/layout"
import { StatusBadge } from "@/components/common/StatusBadge"
import { urlDokumenProksi } from "@/lib/dokumen"
import {
  ActionButton,
  Alert,
  Card,
  CardTitle,
  DataTable,
  EmptyState,
  PageHeader,
  Skeleton,
  type Column,
} from "@/components/ui/primitives"
import { useToast } from "@/hooks/useToast"
import { getReklameDetail, getReklameSK } from "@/services/ptspservice"
import { cn } from "@/lib/cn"
import { formatTanggalLengkap, formatTanggalSingkat } from "@/utils"
import { normalizeReklame, normalizeRiwayat } from "@/utils"
import { titikJanakaKeReklame } from "@/utils/titikJanaka"
import { useTitikJanaka } from "@/hooks/useLaporan"
import type { ReklameItem, RiwayatSK } from "@/utils/reklame"

export default function DetailReklame() {
  const { id = "" } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { showToast } = useToast()

  const [loading, setLoading] = useState(true)
  const [item, setItem] = useState<ReklameItem | null>(null)
  const [riwayat, setRiwayat] = useState<RiwayatSK[]>([])
  const [notFound, setNotFound] = useState(false)

  /* Titik temuan lapangan dipakai untuk id berawalan `janaka-`. */
  const { titik: titikJanaka } = useTitikJanaka()

  useEffect(() => {
    let cancelled = false

    if (!id) {
      setNotFound(true)
      setLoading(false)
      return
    }

    /*
     * Titik temuan lapangan tidak ada di server PTSP.
     *
     * ID-nya diberi awalan `janaka-` saat digabung ke tabel Data Reklame
     * (lihat `src/utils/titikJanaka.ts`). Tanpa percabangan ini, menekan
     * "Detail" pada baris temuan akan memanggil endpoint PTSP dengan id
     * yang tidak dikenal — dan pengguna melihat "tidak tersedia di server
     * PTSP atau terjadi kesalahan koneksi" untuk data yang sebenarnya ada
     * dan utuh di Firestore.
     *
     * Karenanya: kalau awalnya `janaka-`, ambil dari Firestore saja.
     */
    if (id.startsWith("janaka-")) {
      const asli = titikJanaka.find((t) => `janaka-${t.id}` === id) ?? null

      if (!asli) {
        /*
         * Belum ketemu — bisa karena snapshot Firestore masih menyusul.
         * Biarkan `loading` tetap true; listener `titikJanaka` akan
         * memicu render ulang dan efek ini jalan lagi lewat dependensi
         * di bawah. Tidak langsung "tidak ditemukan", supaya data yang
         * lambat satu detik tidak dilaporkan hilang.
         */
        return
      }

      setItem(titikJanakaKeReklame(asli))
      setRiwayat([])
      setNotFound(false)
      setLoading(false)
      return
    }

    const run = async () => {
      setLoading(true)
      setNotFound(false)
      setItem(null)
      setRiwayat([])

      try {
        const detail = await getReklameDetail(id)
        if (cancelled) return

        setItem(normalizeReklame(detail.item))

        let skRows = normalizeRiwayat(detail.riwayat, detail.item?.sk?.sk_aktif?.id ?? null)

        // Fallback ke endpoint SK khusus bila endpoint detail tidak menyertakan riwayat.
        if (skRows.length === 0) {
          try {
            const res = await getReklameSK(id)
            if (cancelled) return
            skRows = normalizeRiwayat(res.riwayat, res.sk?.sk_aktif?.id ?? null)
          } catch {
            /* riwayat bersifat opsional — abaikan kegagalan */
          }
        }

        if (cancelled) return
        setRiwayat(skRows)
        setNotFound(false)
      } catch (err) {
        if (cancelled) return
        showToast(err instanceof Error ? err.message : "Gagal memuat detail", "error")
        setNotFound(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [id, showToast, titikJanaka])

  /*
   * Kolom riwayat SK.
   *
   * Semua kolom diberi lebar tegas dan perataan yang sama. Sebelumnya
   * `max-w` di `<td>` dan `max-w` di anaknya berbeda — sel dipatok
   * 120px tapi isinya 160px — dan tabel auto-layout memenangkan yang
   * isi, jadi kolom-kolom jadi tidak rata dan "Peminjaman" tampak
   * mengambang di tengah. Dengan satu lebar per kolom dan isi yang
   * mengikutinya, seluruh baris lurus.
   */
  const kolomSK = useMemo<Column<RiwayatSK>[]>(
    () => [
      {
        key: "noSK",
        header: "Nomor SK",
        mobileTitle: true,
        render: (s) => (
          <span className="block truncate font-mono text-[11px]">{s.noSK}</span>
        ),
        className: "w-[180px] max-w-[180px]",
      },
      {
        key: "peminjaman",
        header: "Peminjaman",
        render: (s) => (
          <span className="block truncate text-xs" title={s.namaPerusahaan}>
            {s.namaPerusahaan}
          </span>
        ),
        className: "w-[150px] max-w-[150px]",
      },
      {
        key: "berlaku",
        header: "Berlaku",
        render: (s) => (
          <span className="block whitespace-nowrap font-mono text-[11px]">
            {formatTanggalSingkat(s.berlakuMulai)}
            {" → "}
            {formatTanggalSingkat(s.berlakuSampai)}
          </span>
        ),
        className: "w-[150px] max-w-[150px]",
      },
      {
        key: "masa",
        header: "Masa",
        render: (s) => (
          <span className="block whitespace-nowrap text-xs">{s.masaBulan} bln</span>
        ),
        className: "w-[64px] max-w-[64px]",
      },
      {
        key: "status",
        header: "Status",
        render: (s) => <StatusBadge status={s.status} />,
        className: "w-[110px] max-w-[110px]",
      },
      {
        key: "dokumen",
        header: "Dokumen",
        render: (s) =>
          s.adaFile && s.urlSK ? (
            <a
              href={urlDokumenProksi(s.urlSK)}
              target="_blank"
              rel="noopener noreferrer"
              referrerPolicy="no-referrer"
              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 transition-colors hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
            >
              <FileText className="h-3 w-3" />
              Lihat
            </a>
          ) : (
            <span className="text-xs italic text-slate-400 dark:text-slate-500">
              Tidak tersedia
            </span>
          ),
        className: "w-[96px] max-w-[96px]",
      },
    ],
    [],
  )

  if (loading) {
    return (
      <AppLayout>
        <div className="space-y-5" role="status" aria-label="Memuat detail reklame">
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-xl" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-56" />
              <Skeleton className="h-3 w-72" />
            </div>
          </div>
          <div className="grid gap-5 lg:grid-cols-3">
            <div className="space-y-5 lg:col-span-2">
              <div className="rounded-2xl border border-slate-200/70 dark:border-slate-700/60 bg-white dark:bg-slate-800/60 p-5 sm:p-6">
                <Skeleton className="h-4 w-48" />
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <Skeleton className="h-8 w-8 rounded-lg" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-2.5 w-24" />
                        <Skeleton className="h-3.5 w-full" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200/70 dark:border-slate-700/60 bg-white dark:bg-slate-800/60 p-5 sm:p-6">
                <Skeleton className="h-4 w-40" />
                <div className="mt-5 space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-9 w-full" />
                  ))}
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200/70 dark:border-slate-700/60 bg-white dark:bg-slate-800/60 p-5 sm:p-6">
              <Skeleton className="h-4 w-36" />
              <div className="mt-5 space-y-3">
                <Skeleton className="h-24 w-full rounded-xl" />
                <Skeleton className="h-16 w-full rounded-xl" />
              </div>
            </div>
          </div>
          <span className="sr-only">Memuat detail reklame…</span>
        </div>
      </AppLayout>
    )
  }

  if (!item || notFound) {
    return (
      <AppLayout>
        <Card>
          <EmptyState
            message="Data reklame tidak ditemukan"
            hint={`Reklame dengan ID ${id} tidak tersedia di server PTSP atau terjadi kesalahan koneksi.`}
            icon={<FileText className="w-6 h-6" />}
            action={
              <div className="flex gap-2">
                <ActionButton variant="secondary" onClick={() => navigate("/data-reklame")}>
                  <ArrowLeft className="h-4 w-4" />
                  Kembali ke Daftar
                </ActionButton>
                <ActionButton onClick={() => window.location.reload()}>Coba Lagi</ActionButton>
              </div>
            }
          />
        </Card>
      </AppLayout>
    )
  }

  const nadaStatus =
    item.statusSK === "Kadaluarsa"
      ? { kartu: "border-rose-500/40 bg-rose-500/10", teks: "text-rose-700 dark:text-rose-400" }
      : item.statusSK === "Akan Habis"
        ? { kartu: "border-amber-500/40 bg-amber-500/10", teks: "text-amber-700 dark:text-amber-400" }
        : {
            kartu: "border-emerald-500/40 bg-emerald-500/10",
            teks: "text-emerald-700 dark:text-emerald-400",
          }

  return (
    <AppLayout>
      <div className="space-y-5">
        <ActionButton
          variant="ghost"
          size="sm"
          className="-ml-2"
          onClick={() => navigate("/data-reklame")}
          icon={<ArrowLeft className="h-4 w-4" />}
        >
          Kembali ke Daftar
        </ActionButton>
        <PageHeader
          title={item.namaPemilik}
          subtitle={item.alamat}
          icon={<Building2 className="w-5 h-5" />}
          action={
            <ActionButton
              onClick={() => navigate(`/execution?reklameId=${item.id}`)}
              icon={<ClipboardCheck className="h-4 w-4" />}
              className="w-full justify-center sm:w-auto"
            >
              Buat Laporan
            </ActionButton>
          }
        />

        <div className="grid gap-5 lg:grid-cols-3">
          {/* Informasi */}
          <div className="space-y-5 lg:col-span-2">
            <Card>
              <CardTitle>Informasi Perizinan Reklame</CardTitle>
              <div className="grid gap-4 sm:grid-cols-2">
                <InfoRow icon={Building2} label="Nama Pemilik / Perusahaan" value={item.namaPemilik} />
                <InfoRow icon={Tag} label="Naskah Reklame" value={item.naskahReklame} />
                <InfoRow icon={Layers} label="Jenis Reklame" value={item.jenisReklame} />
                <InfoRow
                  icon={Ruler}
                  label="Dimensi"
                  value={`${item.dimensi} (${item.luasTanah} m²)`}
                />
                <InfoRow icon={Layers} label="Jumlah Titik" value={`${item.jumlah} titik`} />
                <InfoRow
                  icon={MapPin}
                  label="Wilayah"
                  value={`Desa ${item.desa}, Kec. ${item.kecamatan}`}
                />
                <InfoRow
                  icon={MapPin}
                  label="Koordinat"
                  value={
                    item.lat || item.lng
                      ? `${item.lat.toFixed(6)}, ${item.lng.toFixed(6)}`
                      : "Tidak tersedia"
                  }
                />
                <InfoRow icon={User} label="ID Reklame PTSP" value={item.idReklame ?? item.id} />
              </div>
            </Card>

            <Card>
              <CardTitle>
                Surat Izin (SK)
              </CardTitle>
              <div className="space-y-4">
                {item.adaSK ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <InfoRow icon={FileText} label="Nomor SK" value={item.noSK} />
                    <InfoRow
                      icon={FileText}
                      label="Masa Berlaku"
                      value={`${item.masaBerlakuBulan} bulan`}
                    />
                    <InfoRow
                      icon={FileText}
                      label="Berlaku Mulai"
                      value={formatTanggalLengkap(item.berlakuMulai)}
                    />
                    <InfoRow
                      icon={FileText}
                      label="Berlaku Sampai"
                      value={formatTanggalLengkap(item.berlakuSampai)}
                    />
                  </div>
                ) : (
                  <Alert tone="rose">
                    <p className="font-bold">Tidak memiliki Surat Izin</p>
                    <p className="mt-0.5">
                      Reklame ini tidak tercatat memiliki SK di PTSP, sehingga berstatus
                      kadaluarsa dan menjadi prioritas penindakan.
                    </p>
                  </Alert>
                )}

                {item.urlSK ? (
                  <a
                    href={urlDokumenProksi(item.urlSK)}
                    target="_blank"
                    rel="noopener noreferrer"
                    referrerPolicy="no-referrer"
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-xs transition-colors hover:bg-slate-200 dark:border-slate-600 dark:bg-slate-700/70 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    <FileText className="h-4 w-4" />
                    Lihat Dokumen SK Digital
                  </a>
                ) : null}
              </div>
            </Card>

            <Card>
              <CardTitle description={`${riwayat.length} dokumen SK tercatat untuk reklame ini`}>
                Riwayat SK
              </CardTitle>
              <DataTable
                columns={kolomSK}
                rows={riwayat}
                keyOf={(s) => s.noSK}
                emptyMessage="Riwayat SK belum tersedia dari server PTSP."
              />
            </Card>
          </div>

          {/* Ringkasan */}
          <div className="space-y-5">
            <Card>
              <CardTitle>Status Masa Berlaku</CardTitle>
              <div className="space-y-3">
                <div className={cn("rounded-xl border p-4", nadaStatus.kartu)}>
                  <p className="text-[10px] font-bold uppercase tracking-wider opacity-70">
                    Status Izin
                  </p>
                  <p className={cn("mt-1 text-lg font-bold", nadaStatus.teks)}>{item.statusSK}</p>
                  <p className="mt-1 text-xs opacity-80">{item.statusDetail}</p>
                </div>

              </div>
            </Card>

            <Card>
              <CardTitle>Referensi</CardTitle>
              <div className="space-y-2 text-xs">
                {/*
                 * Titik temuan lapangan bukan item PTSP, jadi istilah di
                 * kartu ini ikut berubah. Menulis "ID Item PTSP" untuk
                 * titik temuan salah — id-nya dokumen Firestore milik
                 * JANAKA, tidak ada padanannya di sistem perizinan.
                 */}
                <KV
                  label={item.dariJANAKA ? "ID Titik" : "ID Item PTSP"}
                  value={item.dariJANAKA ? (item.idReklame ?? item.id) : item.id}
                />
                {!item.dariJANAKA ? (
                  <KV label="ID Reklame" value={item.idReklame ?? "-"} />
                ) : null}
                <KV
                  label="Sumber Data"
                  value={item.dariJANAKA ? "Temuan Lapangan · JANAKA" : "API PTSP · Sprinter Ponorogo"}
                />
                <KV label="Diperbarui" value={formatTanggalLengkap(new Date().toISOString())} />
              </div>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof MapPin
  label: string
  value: string
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 rounded-lg bg-slate-100 dark:bg-slate-700/50 p-1.5 text-slate-500 dark:text-slate-400">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {label}
        </p>
        <p className="break-words text-sm font-semibold text-slate-800 dark:text-slate-100">
          {value}
        </p>
      </div>
    </div>
  )
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-slate-100 dark:border-slate-700/60 pb-1.5 last:border-0">
      <span className="shrink-0 text-slate-500 dark:text-slate-400">{label}</span>
      <span className="text-right font-semibold break-all text-slate-700 dark:text-slate-200">
        {value}
      </span>
    </div>
  )
}