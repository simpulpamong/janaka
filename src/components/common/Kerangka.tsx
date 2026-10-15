import { Skeleton } from "@/components/ui/primitives"

/**
 * Kerangka loading per halaman.
 *
 * ## Prinsip
 * Kerangka harus **meniru ukuran, jarak, dan warna** isi yang asli. Kalau tidak,
 * yang terjadi adalah "lompatan": begitu data tiba, seluruh baris bergeser
 * karena tinggi yang dipesan berbeda. Petugas yang paling menonjol adalah
 * saat tabel muncul — kolom teks yang tiba dengan tinggi satu baris, sementara
 * kerangkanya cuma garis setipis `h-3`.
 *
 * Jadi setiap fungsi di sini menyalin angka yang sama dengan komponen aslinya:
 * tinggi baris tabel `py-3`, tinggi input `py-2.5`, radius `rounded-xl`,
 * tinggi kartu statistik `h-7`, dan seterusnya. Kalau komponen aslinya diubah,
 * kerangka ini harus diubah juga — itulah gunanya.
 */

/* ══════════════════════════════════════════════════════════════════
 *  Potongan bersama
 * ══════════════════════════════════════════════════════════════════ */

/** Kartu statistik — sama dengan `StatTile`: label 11px, angka `text-2xl`. */
export function KerangkaStatistik({
  jumlah,
  kolom = 4,
}: {
  jumlah: number
  /** Jumlah kolom grid.atau, secara bawaan mengikuti mis. grid-cols-2 sm:grid-cols-4. */
  kolom?: 2 | 3 | 4
}) {
  const grid =
    kolom === 2
      ? "grid-cols-2"
      : kolom === 3
        ? "grid-cols-2 sm:grid-cols-3"
        : "grid-cols-2 sm:grid-cols-4"
  return (
    <div className={`grid ${grid} gap-3`}>
      {Array.from({ length: jumlah }, (_, i) => (
        <div
          key={i}
          className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-4 dark:border-slate-700/60 dark:bg-slate-800/60"
        >
          <div className="flex items-start justify-between gap-2">
            <Skeleton className="h-3 w-2/5" />
          </div>
          <Skeleton className="mt-2 h-7 w-1/3" />
        </div>
      ))}
    </div>
  )
}

/** Kolom filter — tinggi input `py-2.5` + border `rounded-xl`, sama dengan `Field`. */
export function KerangkaFilter({
  jumlah = 3,
  tombol,
}: {
  jumlah?: number
  /** Slot tombol aksi di kanan — persistent, mis. "Pilih Foto". */
  tombol?: React.ReactNode
}) {
  return (
    <div className="space-y-4">
      <div
        className={
          jumlah >= 3
            ? "grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
            : "grid gap-3 sm:grid-cols-2"
        }
      >
        {Array.from({ length: jumlah }, (_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="ml-1 h-2.5 w-20" />
            <Skeleton className="h-[42px] w-full rounded-xl" />
          </div>
        ))}
      </div>
      {tombol ? <div className="flex justify-end">{tombol}</div> : null}
    </div>
  )
}

/**
 * Tabel.
 *
 * Tinggi baris sengaja `py-3` — sama dengan `DataTable`, supaya baris pertama
 * yang tiba langsung menempati tempat yang sudah dipesan.
 */
export function KerangkaTabel({
  kolom = 6,
  baris = 5,
  bordered = false,
}: {
  kolom?: number
  baris?: number
  bordered?: boolean
}) {
  return (
    <div className="space-y-3" role="status" aria-label="Memuat tabel">
      <div
        aria-hidden="true"
        className={`grid gap-3 border-b border-slate-200 px-3 pb-3 dark:border-slate-700 ${
          bordered ? "rounded-t-xl bg-slate-100/75 dark:bg-slate-800/40" : ""
        }`}
        style={{ gridTemplateColumns: `repeat(${kolom}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: kolom }, (_, i) => (
          <Skeleton key={i} className="h-2.5 w-3/4" />
        ))}
      </div>
      {Array.from({ length: baris }, (_, row) => (
        <div
          key={row}
          aria-hidden="true"
          className="grid items-center gap-3 rounded-xl border border-slate-100 px-3 py-3 dark:border-slate-700/60"
          style={{ gridTemplateColumns: `repeat(${kolom}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: kolom }, (_, col) => (
            <Skeleton
              key={col}
              className={
                col === 0 ? "h-3 w-4/5" : col === kolom - 1 ? "h-3 w-1/2" : "h-3 w-3/5"
              }
            />
          ))}
        </div>
      ))}
      <span className="sr-only">Memuat data…</span>
    </div>
  )
}

/** Kartu berisi judul + isi, mengikuti `Card` (`rounded-2xl`, `p-5 sm:p-6`). */
export function KerangkaKartu({
  judul,
  children,
}: {
  judul?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white shadow-[0_1px_3px_0_rgba(15,23,42,0.07)] dark:border-slate-700/60 dark:bg-slate-800/60 dark:shadow-none sm:p-6">
      {judul ? <Skeleton className="mb-4 h-3.5 w-40" /> : null}
      <div className="p-5 sm:p-0">{children}</div>
    </div>
  )
}

/** Baris pilihan status — inline, tinggi `py-1.5` seperti `FilterChip`. */
export function KerangkaStatusChip({ jumlah = 5 }: { jumlah?: number }) {
  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-2">
      <Skeleton className="mr-1 h-3 w-14" />
      {Array.from({ length: jumlah }, (_, i) => (
        <Skeleton key={i} className="h-7 w-20 rounded-lg" />
      ))}
    </div>
  )
}

/** Daftar kartu untuk tampilan mobile — tinggi `p-4`, sama dengan kartu DataTable. */
export function KerangkaDaftar({ baris = 4 }: { baris?: number }) {
  return (
    <div className="space-y-3" role="status" aria-label="Memuat daftar">
      {Array.from({ length: baris }, (_, i) => (
        <div
          key={i}
          aria-hidden="true"
          className="space-y-2.5 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700/70 dark:bg-slate-900/40"
        >
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-6 w-16 shrink-0 rounded-full" />
          </div>
          <Skeleton className="h-3 w-3/5" />
        </div>
      ))}
      <span className="sr-only">Memuat daftar…</span>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════
 *  Kerangka per halaman
 * ══════════════════════════════════════════════════════════════════ */

/**
 * Dashboard.
 *
 * Meniru urutan aslinya: 4 kartu statistik, peta/panel utama, lalu daftar
 * aktivitas. Tanpa `Judul halaman` — topbar sudah memuat nama halaman.
 */
export function KerangkaDashboard() {
  return (
    <div className="space-y-5">
      <KerangkaStatistik jumlah={4} />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="h-72 rounded-2xl border border-slate-200/90 bg-white lg:col-span-2 dark:border-slate-700/60 dark:bg-slate-800/60" />
        <KerangkaKartu>
          <div className="space-y-3">
            <Skeleton className="h-3.5 w-32" />
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="space-y-1.5">
                <Skeleton className="h-3 w-3/5" />
                <Skeleton className="h-2.5 w-2/5" />
              </div>
            ))}
          </div>
        </KerangkaKartu>
      </div>
      <KerangkaKartu>
        <Skeleton className="mb-4 h-3.5 w-36" />
        <KerangkaDaftar baris={4} />
      </KerangkaKartu>
    </div>
  )
}

/** Data Reklame — statistik, baris status inline, filter, tabel. */
export function KerangkaDataReklame() {
  return (
    <div className="space-y-5">
      <KerangkaStatistik jumlah={3} kolom={3} />
      <KerangkaKartu>
        <KerangkaStatusChip jumlah={5} />
        <div className="mt-4">
          <KerangkaFilter jumlah={1} />
        </div>
      </KerangkaKartu>
      <KerangkaKartu judul>
        <KerangkaTabel kolom={7} baris={6} bordered />
      </KerangkaKartu>
    </div>
  )
}

/** Rekap Penindakan — statistik, filter bertumpuk, tabel. */
export function KerangkaRekap() {
  return (
    <div className="space-y-5">
      <KerangkaStatistik jumlah={4} />
      <KerangkaKartu>
        <KerangkaFilter jumlah={3} />
        <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800/70">
          <KerangkaStatusChip jumlah={4} />
        </div>
      </KerangkaKartu>
      <KerangkaKartu judul>
        <KerangkaTabel kolom={6} baris={6} />
      </KerangkaKartu>
    </div>
  )
}

/**
 * Laporan Lapangan.
 *
 * Meniru urutan form yang asli: pilih titik, tanggal, keterangan, foto.
 * Kolom foto memakai `aspect-[4/3]` yang sama dengan grid foto asli — kalau
 * tidak, area foto melompat begitu thumbnail pertama muncul.
 */
export function KerangkaLaporan() {
  return (
    <div className="space-y-5">
      <KerangkaKartu>
        <div className="space-y-6">
          {/* 1. Titik target */}
          <div className="space-y-3">
            <Skeleton className="h-3 w-44" />
            <Skeleton className="h-12 w-full rounded-xl" />
            <Skeleton className="h-40 w-full rounded-xl" />
          </div>
          {/* 2. Tanggal */}
          <div className="space-y-2">
            <Skeleton className="h-3 w-36" />
            <Skeleton className="h-[42px] w-full rounded-xl" />
          </div>
          {/* 3. Keterangan */}
          <div className="space-y-2">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-[104px] w-full rounded-xl" />
          </div>
          {/* 4. Foto — rasio sama dengan grid asli */}
          <div className="space-y-3">
            <Skeleton className="h-3 w-32" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="aspect-[4/3] w-full rounded-xl" />
              ))}
            </div>
          </div>
          {/* Aksi simpan */}
          <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-6 dark:border-slate-800/70">
            <Skeleton className="h-3 w-64" />
            <Skeleton className="h-11 w-56 rounded-xl" />
          </div>
        </div>
      </KerangkaKartu>
    </div>
  )
}

/** Detail reklame PTSP — identitas, informasi izin, dokumen, dan ringkasan. */
export function KerangkaDetailReklame() {
  return (
    <div className="space-y-5" role="status" aria-label="Memuat detail reklame">
      <div className="flex items-center gap-3">
        <Skeleton className="h-11 w-11 shrink-0 rounded-2xl" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-5 w-2/5 max-w-72" />
          <Skeleton className="h-3.5 w-3/5 max-w-96" />
        </div>
        <Skeleton className="hidden h-9 w-36 rounded-xl sm:block" />
      </div>
      <Skeleton className="h-8 w-32 rounded-lg" />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {[0, 1, 2].map((card) => (
            <KerangkaKartu key={card} judul>
              <div className="grid gap-5 sm:grid-cols-2">
                {Array.from({ length: card === 0 ? 6 : 4 }, (_, row) => (
                  <div key={row} className="space-y-2">
                    <Skeleton className="h-2.5 w-24" />
                    <Skeleton className="h-4 w-4/5" />
                  </div>
                ))}
              </div>
            </KerangkaKartu>
          ))}
        </div>
        <div className="space-y-5">
          <KerangkaKartu judul>
            <Skeleton className="h-20 w-full rounded-xl" />
          </KerangkaKartu>
          <KerangkaKartu judul>
            <div className="space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-4 w-3/5" />
            </div>
          </KerangkaKartu>
        </div>
      </div>
    </div>
  )
}

/**
 * Area peta saja — tanpa toolbar.
 *
 * ## Kenapa dipisah dari kerangkanya sendiri
 * Versi lama (`KerangkaPeta`) merender **toolbar + peta** sekaligus. Itu
 * benar kalau seluruh halaman belum ada. Tapi dua pemanggilnya tidak
 * seperti itu:
 *
 * - `Mapping.tsx` memanggilnya dari dalam `AppLayout`, sebagai `fallback`
 *   Suspense yang hanya menutupi kotak peta. Toolbar di situ sudah nyata
 *   dan dirender nyata — menggambarnya lagi membuat dua toolbar
 *   bertumpuk.
 * - Pemanggil lain memakainya saat daftar titik masih kosong. Di sana
 *   toolbar juga sudah ada; hanya petanya yang belum.
 *
 * Jadi yang dibutuhkan bukan "kerangka halaman peta", tapi "kotak peta".
 * Namanya sekarang menyatakan itu secara langsung.
 *
 * ## Tinggi wajib sama
 * `tinggi` diterima sebagai nilai CSS apa adanya — sama seperti peta
 * asli yang menerimanya lewat prop `height`. Kalau keduanya berbeda,
 * kotak kerangka dan peta yang sebenarnya tidak akan sama tinggi, dan
 * begitu data tiba seluruh halaman melompat. Itu justru kebalikan dari
 * tujuan skeleton.
 */
export function KerangkaPetaArea({ tinggi = 680 }: { tinggi?: number | string }) {
  return (
    <div
      className="relative w-full overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-900/40"
      style={{ height: typeof tinggi === "number" ? `${tinggi}px` : tinggi, minHeight: 380 }}
      aria-hidden="true"
    >
      <Skeleton className="h-full w-full rounded-xl" />

      {/* Peta Leaflet selalu punya kontrol zoom di pojok kiri atas.
          Memiripkannya sedikit lebih baik daripada kotak kosong yang
          terlihat "mati". */}
      <div className="absolute left-2.5 top-2.5 flex flex-col gap-1.5">
        <Skeleton className="h-8 w-8 rounded-md" />
        <Skeleton className="h-8 w-8 rounded-md" />
        <Skeleton className="h-8 w-8 rounded-md" />
      </div>
      <Skeleton className="absolute bottom-2.5 right-2.5 h-6 w-28 rounded-lg" />
      <Skeleton className="absolute bottom-2.5 left-2.5 h-6 w-20 rounded-lg" />
    </div>
  )
}

/** Pengaturan — tab lalu isi, sesuai tab yang sedang aktif. */
export function KerangkaPengaturan({
  tab = "profil",
}: {
  tab?: "profil" | "pengguna" | "format-dokumen" | "tentang"
}) {
  return (
    <div className="space-y-5">
      <div className="flex gap-1 rounded-2xl border border-slate-200/90 bg-slate-100/90 p-1.5 dark:border-slate-700/60 dark:bg-slate-800/40">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-10 flex-1 rounded-xl" />
        ))}
      </div>

      {tab === "pengguna" ? (
        <>
          <KerangkaStatistik jumlah={3} kolom={3} />
          <KerangkaKartu>
            <KerangkaFilter jumlah={2} />
            <div className="mt-4">
              <KerangkaTabel kolom={5} baris={6} bordered />
            </div>
          </KerangkaKartu>
        </>
      ) : tab === "format-dokumen" ? (
        <>
          <KerangkaKartu judul>
            <div className="grid gap-4 sm:grid-cols-2">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="space-y-1.5">
                  <Skeleton className="ml-1 h-2.5 w-28" />
                  <Skeleton className="h-[42px] w-full rounded-xl" />
                </div>
              ))}
            </div>
          </KerangkaKartu>
          <KerangkaKartu judul>
            <div className="grid gap-4 sm:grid-cols-2">
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="space-y-1.5">
                  <Skeleton className="ml-1 h-2.5 w-28" />
                  <Skeleton className="h-[42px] w-full rounded-xl" />
                </div>
              ))}
            </div>
          </KerangkaKartu>
        </>
      ) : tab === "tentang" ? (
        <KerangkaKartu judul>
          <div className="space-y-4">
            <Skeleton className="h-12 w-full rounded-xl" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </KerangkaKartu>
      ) : (
        <KerangkaKartu judul>
          <div className="space-y-4">
            {Array.from({ length: tab === "profil" ? 4 : 3 }, (_, i) => (
              <div key={i} className="space-y-1.5">
                <Skeleton className="ml-1 h-2.5 w-24" />
                <Skeleton className="h-[42px] w-full rounded-xl" />
              </div>
            ))}
            <Skeleton className="h-11 w-40 rounded-xl" />
          </div>
        </KerangkaKartu>
      )}
    </div>
  )
}
