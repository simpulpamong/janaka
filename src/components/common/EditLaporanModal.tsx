import { useEffect, useRef, useState } from "react"
import { Camera, MapPin, Save, Trash2, UploadCloud, X } from "lucide-react"
import { Modal } from "@/components/ui/Modal"
import {
  ActionButton,
  Field,
  Input,
  Textarea,
} from "@/components/ui/primitives"
import DatePicker from "@/components/ui/DatePicker"
import { useToast } from "@/hooks/useToast"
import { updateLaporan } from "@/services/laporanService"
import {
  FOLDER_UPLOAD,
  uploadToCloudinary,
  validateImageFile,
  type CloudinaryUploadResult,
} from "@/lib/cloudinary"
import { blobKeFile, kompresFoto } from "@/lib/image/kompres"
import { KameraWeb, perangkatPunyaKameraNative } from "@/components/common/KameraWeb"
import { JamPicker } from "@/components/common/JamPicker"
import { MapPickerModal } from "@/components/peta/MapPickerModal"
import { formatBytes } from "@/utils"
import type { LaporanPenindakan } from "@/types"

/** Foto yang masih lokal — belum tersimpan, bisa dilepas sebelum disimpan. */
interface FotoBaru extends CloudinaryUploadResult {
  /** Nama berkas hasil kompresi (untuk ditampilkan). */
  namaFile: string
  /** Ukuran berkas terkompresi dalam byte. */
  ukuranBytes: number
  /** Ukuran berkas asli sebelum dikompresi. */
  ukuranAsli: number
}
/**
 * Modal ubah laporan penindakan.
 *
 * ## Kenapa foto sengaja bisa diubah di sini
 * Petugas sering baru sadar setelah laporan tersimpan: foto yang diambil
 * kurang jelas, ada yang salah titik, atau yang dibutuhkan ternyata belum
 * masuk. Sebelumnya satu-satunya jalan adalah menghapus lalu membuat
 * laporan baru — dan itu menghilangkan riwayat lama. Dengan ubah langsung,
 * riwayat tetap utuh dan isinya bisa dibetulkan.
 *
 * Foto yang sudah tersimpan tetap memakai URL Cloudinary-nya; foto baru
 * diunggah saat disimpan. Tidak ada yang dihapus dari Cloudinary sampai
 * penyimpanan berhasil.
 */
export function EditLaporanModal({
  open,
  laporan,
  onClose,
  onTersimpan,
}: {
  open: boolean
  laporan: LaporanPenindakan | null
  onClose: () => void
  /** Dipanggil setelah berhasil disimpan. */
  onTersimpan?: () => void
}) {
  const { showToast } = useToast()

  const [nomorBA, setNomorBA] = useState("")
  const [tanggal, setTanggal] = useState("")
  const [waktu, setWaktu] = useState("")
  const [nama, setNama] = useState("")
  const [alamat, setAlamat] = useState("")
  const [lat, setLat] = useState("")
  const [lng, setLng] = useState("")
  const [keterangan, setKeterangan] = useState("")

  /** URL foto yang sudah tersimpan. */
  const [fotoLama, setFotoLama] = useState<string[]>([])
  /** Foto baru yang sudah terunggah ke Cloudinary. */
  const [fotoBaru, setFotoBaru] = useState<FotoBaru[]>([])

  const [menyimpan, setMenyimpan] = useState(false)
  const [mengunggah, setMengunggah] = useState(false)
  const [kameraOpen, setKameraOpen] = useState(false)
  const [petaOpen, setPetaOpen] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const fileRef = useRef<HTMLInputElement>(null)
  const kameraRef = useRef<HTMLInputElement>(null)

  /* Isi form setiap kali modal dibuka untuk laporan yang berbeda. */
  useEffect(() => {
    if (!open || !laporan) return
    setNomorBA(laporan.nomorBA || "")
    setTanggal(laporan.tanggal || "")
    setWaktu(laporan.waktu || "")
    setNama(laporan.reklameNama || "")
    setAlamat(laporan.reklameAlamat || "")
    setLat(String(laporan.lat ?? ""))
    setLng(String(laporan.lng ?? ""))
    setKeterangan(laporan.catatanPetugas || "")
    setFotoLama((laporan.fotoBukti ?? []).map((f) => f.url))
    setFotoBaru([])
    setErrors({})
  }, [open, laporan])

  const bukaKamera = () => {
    if (perangkatPunyaKameraNative()) kameraRef.current?.click()
    else setKameraOpen(true)
  }

  const prosesFoto = async (list: File[]) => {
    if (list.length === 0) return
    const valid = list.filter((f) => {
      const err = validateImageFile(f)
      if (err) showToast(err, "error")
      return !err
    })
    if (valid.length === 0) return

    setMengunggah(true)
    let berhasil = 0
    for (const file of valid) {
      try {
        const hasil = await kompresFoto(file)
        const result = await uploadToCloudinary(
          blobKeFile(hasil.blob, hasil.namaFile),
          FOLDER_UPLOAD,
        )
        setFotoBaru((prev) => [
          ...prev,
          { ...result, namaFile: hasil.namaFile, ukuranBytes: hasil.ukuranBytes, ukuranAsli: file.size },
        ])
        berhasil += 1
      } catch (err) {
        showToast(err instanceof Error ? err.message : `Gagal mengunggah ${file.name}`, "error")
      }
    }
    setMengunggah(false)
    if (berhasil > 0) showToast(`${berhasil} foto berhasil diunggah`, "success")
  }

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return
    void prosesFoto(Array.from(files))
    if (fileRef.current) fileRef.current.value = ""
    if (kameraRef.current) kameraRef.current.value = ""
  }

  const validasi = (): boolean => {
    const errs: Record<string, string> = {}
    if (!nama.trim()) errs.nama = "Nama titik reklame wajib diisi."
    if (!tanggal) errs.tanggal = "Tanggal wajib diisi."

    const latN = Number(lat)
    const lngN = Number(lng)
    if (!lat.trim() || !Number.isFinite(latN)) errs.lat = "Latitude harus berupa angka."
    else if (latN < -90 || latN > 90) errs.lat = "Latitude harus antara -90 dan 90."
    if (!lng.trim() || !Number.isFinite(lngN)) errs.lng = "Longitude harus berupa angka."
    else if (lngN < -180 || lngN > 180) errs.lng = "Longitude harus antara -180 dan 180."

    if (fotoLama.length + fotoBaru.length === 0) {
      errs.foto = "Minimal satu foto dokumentasi wajib ada."
    }

    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSimpan = async () => {
    if (!laporan) return
    if (!validasi()) return

    setMenyimpan(true)
    try {
      const fotoBukti = [
        ...fotoLama.map((url, i) => {
          const asli = (laporan.fotoBukti ?? []).find((f) => f.url === url)
          return (
            asli ?? {
              publicId: `lama-${i}`,
              namaFile: `foto-${i + 1}.jpg`,
              url,
              width: 0,
              height: 0,
              ukuranBytes: 0,
              diunggahPada: laporan.updatedAt || "",
            }
          )
        }),
        ...fotoBaru.map((f) => ({
          publicId: f.publicId,
          namaFile: f.namaFile,
          url: f.url,
          width: f.width,
          height: f.height,
          ukuranBytes: f.ukuranBytes,
          diunggahPada: new Date().toISOString(),
        })),
      ]

      await updateLaporan(laporan.id, {
        nomorBA: nomorBA.trim() || laporan.nomorBA,
        reklameNama: nama.trim(),
        reklameAlamat: alamat.trim(),
        lat: Number(lat),
        lng: Number(lng),
        // "Tindakan" tidak lagi jadi kategori terpisah — digabung ke keterangan.
        tindakan: laporan.tindakan,
        catatanPetugas: keterangan.trim(),
        fotoBukti,
        tanggal,
        waktu: waktu.trim(),
      })

      showToast("Laporan berhasil diperbarui", "success")
      onTersimpan?.()
      onClose()
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal memperbarui laporan", "error")
    } finally {
      setMenyimpan(false)
    }
  }

  if (!laporan) return null

  const totalFoto = fotoLama.length + fotoBaru.length

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Ubah Laporan Penindakan"
      icon={<Save className="h-4 w-4 text-blue-500" />}
      size="lg"
      footer={
        <div className="flex w-full items-center justify-end gap-3">
          <ActionButton variant="secondary" onClick={onClose} disabled={menyimpan}>
            Batal
          </ActionButton>
          <ActionButton
            onClick={() => void handleSimpan()}
            loading={menyimpan}
            disabled={menyimpan}
            icon={<Save className="h-4 w-4" />}
          >
            Simpan Perubahan
          </ActionButton>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Nomor BA + tanggal */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nomor Berita Acara" htmlFor="edit-nomor">
            <Input
              id="edit-nomor"
              value={nomorBA}
              onChange={(e) => setNomorBA(e.target.value)}
              placeholder="000/BA/JANAKA/2026"
              disabled={menyimpan}
            />
          </Field>
          <Field label="Waktu" htmlFor="edit-waktu">
            <JamPicker
              id="edit-waktu"
              value={waktu}
              onChange={setWaktu}
              disabled={menyimpan}
              aria-label="Waktu penindakan"
            />
          </Field>
        </div>

        <Field label="Tanggal Penindakan" htmlFor="edit-tanggal">
          <DatePicker
            value={tanggal}
            onChange={setTanggal}
            aria-label="Tanggal Penindakan"
          />
        </Field>

        {/* Titik reklame */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nama Titik Reklame" error={errors.nama} htmlFor="edit-nama" required>
            <Input
              id="edit-nama"
              value={nama}
              onChange={(e) => {
                setNama(e.target.value)
                setErrors((p) => ({ ...p, nama: "" }))
              }}
              placeholder="Nama usaha / pemilik"
              disabled={menyimpan}
            />
          </Field>
          <Field label="Alamat" htmlFor="edit-alamat">
            <Input
              id="edit-alamat"
              value={alamat}
              onChange={(e) => setAlamat(e.target.value)}
              placeholder="Alamat lokasi"
              disabled={menyimpan}
            />
          </Field>
        </div>

        {/* Koordinat — bisa diketik manual atau dipilih di peta */}
        <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700/60">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Koordinat Lokasi
            </span>
            <button
              type="button"
              onClick={() => setPetaOpen(true)}
              disabled={menyimpan}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 transition-colors hover:text-blue-700 disabled:opacity-50 dark:text-blue-400 dark:hover:text-blue-300"
            >
              <MapPin className="h-3.5 w-3.5" />
              Pilih di Peta
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Latitude" error={errors.lat} htmlFor="edit-lat" required>
              <Input
                id="edit-lat"
                value={lat}
                onChange={(e) => {
                  setLat(e.target.value)
                  setErrors((p) => ({ ...p, lat: "" }))
                }}
                placeholder="-7.6304"
                inputMode="decimal"
                disabled={menyimpan}
              />
            </Field>
            <Field label="Longitude" error={errors.lng} htmlFor="edit-lng" required>
              <Input
                id="edit-lng"
                value={lng}
                onChange={(e) => {
                  setLng(e.target.value)
                  setErrors((p) => ({ ...p, lng: "" }))
                }}
                placeholder="111.5158"
                inputMode="decimal"
                disabled={menyimpan}
              />
            </Field>
          </div>

        </div>

        {/*
          Kolom "Nama Petugas" dihapus.

          Isinya tidak pernah ada. Halaman Laporan Lapangan menyimpan "-"
          di field `petugas`, dan tidak ada satu pun tempat yang mengisinya
          dengan nama sungguhan. Form yang meminta nama padahal sistem
          tidak pernah memakainya hanya menambah satu isian kosong yang
          harus dilewati setiap kali menyimpan.
        */}

        {/* Keterangan — pengganti "tindakan" */}
        <Field label="Keterangan" htmlFor="edit-keterangan">
          <Textarea
            id="edit-keterangan"
            value={keterangan}
            onChange={(e) => setKeterangan(e.target.value)}
            placeholder="Uraian kondisi lapangan, hasil pemeriksaan, atau catatan tindak lanjut…"
            rows={4}
            disabled={menyimpan}
          />
        </Field>

        {/* Foto */}
        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Foto Dokumentasi ({totalFoto})
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <ActionButton
                type="button"
                size="sm"
                variant="secondary"
                onClick={bukaKamera}
                disabled={mengunggah || menyimpan}
                icon={<Camera className="h-4 w-4" />}
              >
                Kamera
              </ActionButton>
              <ActionButton
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => fileRef.current?.click()}
                disabled={mengunggah || menyimpan}
                icon={<UploadCloud className="h-4 w-4" />}
              >
                {mengunggah ? "Mengunggah…" : "Galeri"}
              </ActionButton>
            </div>
          </div>

          {errors.foto ? (
            <p className="mb-2 text-xs font-semibold text-rose-600 dark:text-rose-400">{errors.foto}</p>
          ) : null}

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <input
            ref={kameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />

          {totalFoto === 0 ? (
            <p className="rounded-xl border-2 border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400 dark:border-slate-700 dark:text-slate-500">
              Belum ada foto. Sertakan minimal satu foto dokumentasi.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {fotoLama.map((url, i) => (
                <figure
                  key={`lama-${url}`}
                  className="group relative overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700/60"
                >
                  <img
                    src={url}
                    alt={`Foto ${i + 1}`}
                    className="aspect-[4/3] w-full object-cover"
                    loading="lazy"
                  />
                  <figcaption className="bg-white px-2 py-1 text-[10px] font-semibold text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                    Foto {i + 1} · tersimpan
                  </figcaption>
                  <button
                    type="button"
                    onClick={() => setFotoLama((prev) => prev.filter((_, j) => j !== i))}
                    disabled={menyimpan}
                    className="absolute right-1.5 top-1.5 rounded-md bg-black/65 p-1.5 text-white transition-colors hover:bg-rose-600 disabled:opacity-40"
                    aria-label={`Hapus foto ${i + 1}`}
                    title="Hapus foto ini"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </figure>
              ))}

              {fotoBaru.map((f, i) => (
                <figure
                  key={f.publicId}
                  className="group relative overflow-hidden rounded-xl border border-emerald-300 dark:border-emerald-700/60"
                >
                  <img
                    src={f.url}
                    alt={f.namaFile}
                    className="aspect-[4/3] w-full object-cover"
                  />
                  <figcaption className="bg-white px-2 py-1 text-[10px] font-semibold text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                    {f.width}×{f.height} · {formatBytes(f.ukuranBytes)}
                  </figcaption>
                  <span className="absolute left-1.5 top-1.5 rounded-md bg-emerald-600/90 px-1.5 py-0.5 text-[10px] font-bold text-white">
                    Baru
                  </span>
                  <button
                    type="button"
                    onClick={() => setFotoBaru((prev) => prev.filter((_, j) => j !== i))}
                    disabled={menyimpan}
                    className="absolute right-1.5 top-1.5 rounded-md bg-black/65 p-1.5 text-white transition-colors hover:bg-rose-600 disabled:opacity-40"
                    aria-label={`Hapus foto baru ${i + 1}`}
                    title="Batal unggah foto ini"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </figure>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Pemilih koordinat dari peta — pin bisa digeser atau diklik langsung. */}
      <MapPickerModal
        open={petaOpen}
        onClose={() => setPetaOpen(false)}
        initialLat={Number(lat) || undefined}
        initialLng={Number(lng) || undefined}
        onSelect={(pos) => {
          setLat(String(pos.lat))
          setLng(String(pos.lng))
          setErrors((p) => ({ ...p, lat: "", lng: "" }))
        }}
        title="Pilih Lokasi Reklame"
      />

      {/* Kamera web — hanya di PC; ponsel lewat kamera native. */}
      <KameraWeb
        open={kameraOpen}
        onClose={() => setKameraOpen(false)}
        onCapture={(blob) => {
          const nama = `kamera-${new Date().toISOString().replace(/[:.]/g, "-")}.jpg`
          void prosesFoto([new File([blob], nama, { type: "image/jpeg" })])
        }}
      />
    </Modal>
  )
}
