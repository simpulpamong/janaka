import { useState } from "react"
import { Copy, MapPin, Plus, Trash2 } from "lucide-react"
import { Dropdown } from "@/components/ui/Dropdown"
import { ActionButton, Field, Input, Textarea } from "@/components/ui/primitives"
import { MapPickerModal } from "@/components/peta/MapPickerModal"
import { cn } from "@/lib/cn"
import { OPSI_JENIS_REKLAME } from "@/lib/access"

/**
 * Formulir tambah titik untuk banyak reklame di satu koordinat.
 *
 * ## Masalah yang dipecahkan
 * Di lapangan, satu titik lokasi bisa punya beberapa reklame: papan nama di
 * tiang, baliho di atasnya, spanduk di pagar — semuanya di satu lokasi yang
 * sama. Versi lama meminta koordinat, nama, jenis, panjang, lebar, dan
 * keterangan untuk **satu** reklame, lalu mengulang seluruhnya dari awal
 * untuk reklame berikutnya. Duplikat yang paling menyebalkan: koordinat dan
 * alamat — yang **pasti sama** — diketik ulang setiap kali.
 *
 * ## Bentuk datanya
 * Alamat dan koordinat disimpan **sekali** di luar daftar baris. Yang
 * berulang hanya yang benar-benar berbeda per reklame: nama, jenis, ukuran,
 * dan keterangan. Kalau satu koordinat punya lima reklame, hasilnya tetap
 * lima titik; yang berbeda hanya cara mengisinya.
 */
export interface BarisTitik {
  id: string
  nama: string
  jenisReklame: string
  panjang: string
  lebar: string
  keterangan: string
}

export interface TitikMassalProps {
  /** Alamat & koordinat dipakai bersama semua baris. */
  alamat: string
  onAlamatUbah: (v: string) => void
  coords: { lat: number; lng: number } | null
  onCoordsUbah: (v: { lat: number; lng: number } | null) => void
  baris: BarisTitik[]
  onBarisUbah: (v: BarisTitik[]) => void
  /** Jumlah minimum baris; default 1 karena itu kasus paling sering. */
  minimal?: number
}

const BARIS_KOSONG = (): BarisTitik => ({
  id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  nama: "",
  jenisReklame: "Papan Nama Tiang",
  panjang: "",
  lebar: "",
  keterangan: "",
})

export function TitikMassal({
  alamat,
  onAlamatUbah,
  coords,
  onCoordsUbah,
  baris,
  onBarisUbah,
  minimal = 1,
}: TitikMassalProps) {
  const [petaTerbuka, setPetaTerbuka] = useState(false)

  const ubahBaris = (id: string, bagian: Partial<BarisTitik>): void => {
    onBarisUbah(baris.map((b) => (b.id === id ? { ...b, ...bagian } : b)))
  }

  const tambahBaris = (): void => {
    const terakhir = baris[baris.length - 1]
    // Baris baru mewarisi jenis & ukuran terakhir. Untuk reklame yang
    // berderet di satu titik, pola itu hampir selalu sama — dan tetap bisa
    // diubah kalau ternyata tidak.
    onBarisUbah([
      ...baris,
      {
        ...BARIS_KOSONG(),
        jenisReklame: terakhir?.jenisReklame ?? "Papan Nama Tiang",
        panjang: terakhir?.panjang ?? "",
        lebar: terakhir?.lebar ?? "",
      },
    ])
  }

  const hapusBaris = (id: string): void => {
    if (baris.length <= minimal) return
    onBarisUbah(baris.filter((b) => b.id !== id))
  }

  /**
   * Salin isi satu baris ke semua baris lain.
   *
   * Dikiriman karena reklame di satu koordinat sering berpola: tiga papan
   * nama dengan ukuran sama, lalu satu baliho. Salin sekali jauh lebih cepat
   * daripada mengisi tiap baris.
   */
  const salinKeSemua = (sumber: BarisTitik): void => {
    onBarisUbah(
      baris.map((b) =>
        b.id === sumber.id
          ? b
          : {
              ...b,
              jenisReklame: sumber.jenisReklame,
              panjang: sumber.panjang,
              lebar: sumber.lebar,
              keterangan: sumber.keterangan,
            },
      ),
    )
  }

  return (
    <div className="space-y-4">
      {/* ── Bagian bersama: dipakai semua baris ── */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-700/60 dark:bg-slate-800/30">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Lokasi — diisi sekali untuk semua reklame di titik ini
        </p>

        <div className="space-y-3">
          <Field label="Alamat Lokasi" htmlFor="alamatTitikMassal">
            <Input
              id="alamatTitikMassal"
              name="alamatTitikMassal"
              placeholder="mis. Jl. Ahmad Yani No. 12, Jenes"
              value={alamat}
              onChange={(e) => onAlamatUbah(e.target.value)}
            />
          </Field>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setPetaTerbuka(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900/50 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <MapPin className="h-3.5 w-3.5 text-rose-500" />
              Pilih di Peta
            </button>

            <span
              className={cn(
                "font-mono text-xs",
                coords
                  ? "font-bold text-slate-800 dark:text-slate-100"
                  : "text-amber-600 dark:text-amber-400",
              )}
            >
              {coords
                ? `${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`
                : "Koordinat belum dipilih"}
            </span>
          </div>
        </div>
      </div>

      {/* ── Daftar reklame di titik ini ── */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Reklame di titik ini ({baris.length})
          </p>
          <ActionButton
            type="button"
            size="sm"
            variant="secondary"
            onClick={tambahBaris}
            icon={<Plus className="h-3.5 w-3.5" />}
          >
            Tambah Reklame
          </ActionButton>
        </div>

        {baris.map((b, i) => (
          <div
            key={b.id}
            className="space-y-3 rounded-xl border border-slate-200 p-3.5 dark:border-slate-700/60"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-slate-100 text-[11px] font-bold text-slate-600 dark:bg-slate-700/60 dark:text-slate-200">
                {i + 1}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => salinKeSemua(b)}
                  disabled={baris.length < 2}
                  title="Salin jenis, ukuran, dan keterangan baris ini ke semua baris"
                  className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => hapusBaris(b.id)}
                  disabled={baris.length <= minimal}
                  title={baris.length <= minimal ? "Minimal satu baris" : "Hapus baris ini"}
                  className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40 dark:hover:bg-rose-900/30 dark:hover:text-rose-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <Field label="Nama / Nama Usaha" required htmlFor={`nama-${b.id}`}>
              <Input
                id={`nama-${b.id}`}
                name={`nama-${b.id}`}
                placeholder="mis. Toko Sembako Jaya"
                value={b.nama}
                onChange={(e) => ubahBaris(b.id, { nama: e.target.value })}
              />
            </Field>

            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Jenis Reklame" htmlFor={`jenis-${b.id}`}>
                <Dropdown
                  id={`jenis-${b.id}`}
                  aria-label={`Jenis Reklame baris ${i + 1}`}
                  value={b.jenisReklame}
                  onChange={(v: string) => ubahBaris(b.id, { jenisReklame: v })}
                  opsi={OPSI_JENIS_REKLAME}
                />
              </Field>
              <Field label="Panjang (cm)" htmlFor={`panjang-${b.id}`}>
                <Input
                  id={`panjang-${b.id}`}
                  name={`panjang-${b.id}`}
                  type="text"
                  inputMode="numeric"
                  placeholder="150"
                  value={b.panjang}
                  onChange={(e) =>
                    ubahBaris(b.id, { panjang: e.target.value.replace(/\D/g, "") })
                  }
                  className="font-mono tabular-nums"
                />
              </Field>
              <Field label="Lebar (cm)" htmlFor={`lebar-${b.id}`}>
                <Input
                  id={`lebar-${b.id}`}
                  name={`lebar-${b.id}`}
                  type="text"
                  inputMode="numeric"
                  placeholder="300"
                  value={b.lebar}
                  onChange={(e) => ubahBaris(b.id, { lebar: e.target.value.replace(/\D/g, "") })}
                  className="font-mono tabular-nums"
                />
              </Field>
            </div>

            <Field label="Keterangan" htmlFor={`ket-${b.id}`}>
              <Textarea
                id={`ket-${b.id}`}
                name={`ket-${b.id}`}
                placeholder="mis. Terpaku di tiang utilitas, menyatu dengan bangunan"
                value={b.keterangan}
                onChange={(e) => ubahBaris(b.id, { keterangan: e.target.value })}
                rows={2}
              />
            </Field>
          </div>
        ))}
      </div>

      <MapPickerModal
        open={petaTerbuka}
        onClose={() => setPetaTerbuka(false)}
        initialLat={coords?.lat}
        initialLng={coords?.lng}
        onSelect={(pos) => onCoordsUbah(pos)}
      />
    </div>
  )
}

/** Baris kosong tunggal untuk pemakai yang hanya butuh satu reklame. */
export function barisTitikKosong(): BarisTitik {
  return BARIS_KOSONG()
}
