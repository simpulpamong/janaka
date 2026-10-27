import { useEffect, useState } from "react"
import { LocateFixed, MapPin, Plus } from "lucide-react"
import { ActionButton, Field, Input, Textarea } from "@/components/ui/primitives"
import { Dropdown } from "@/components/ui/Dropdown"
import { Modal } from "@/components/ui/Modal"
import { MapPickerModal } from "@/components/peta/MapPickerModal"
import { OPSI_JENIS_REKLAME } from "@/lib/access"
import { useGeolocation } from "@/hooks/useGeolocation"
import { cn } from "@/lib/cn"

export interface FieldFinding {
  nama: string; alamat: string; lat: string; lng: string; keterangan: string
  jenisReklame: string; panjang: string; lebar: string
}

const kosong = (): FieldFinding => ({ nama: "", alamat: "", lat: "", lng: "", keterangan: "", jenisReklame: OPSI_JENIS_REKLAME[0]?.value ?? "Papan Nama Tiang", panjang: "", lebar: "" })

interface Props {
  open: boolean
  onClose: () => void
  title: string
  initial?: Partial<FieldFinding> | null
  saving?: boolean
  submitLabel?: string
  onSubmit: (value: FieldFinding) => void
}

export function FieldFindingModal({ open, onClose, title, initial, saving = false, submitLabel = "Simpan Titik", onSubmit }: Props) {
  const [form, setForm] = useState<FieldFinding>(kosong)
  const [pickerOpen, setPickerOpen] = useState(false)
  const { coords, loading: geoLoading, requestLocation } = useGeolocation()
  useEffect(() => { if (open) setForm({ ...kosong(), ...initial }) }, [open, initial])
  useEffect(() => { if (open && coords && !form.lat && !form.lng) setForm(f => ({ ...f, lat: String(coords.lat), lng: String(coords.lng) })) }, [coords, open, form.lat, form.lng])
  const set = (key: keyof FieldFinding, value: string) => setForm(f => ({ ...f, [key]: value }))
  return <>
    <Modal open={open} onClose={() => { if (!saving) onClose() }} title={title} size="lg" footer={<div className="flex justify-end gap-2"><ActionButton variant="secondary" disabled={saving} onClick={onClose}>Batal</ActionButton><ActionButton loading={saving} onClick={() => onSubmit(form)} icon={<Plus className="h-4 w-4" />}>{submitLabel}</ActionButton></div>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nama / Nama Usaha" required className="sm:col-span-2"><Input value={form.nama} onChange={e => set("nama", e.target.value)} placeholder="Nama pemilik atau usaha" /></Field>
        <Field label="Alamat Lokasi" className="sm:col-span-2"><Input value={form.alamat} onChange={e => set("alamat", e.target.value)} placeholder="Alamat lokasi temuan" /></Field>
        <Field label="Jenis Reklame"><Dropdown value={form.jenisReklame} onChange={v => set("jenisReklame", v)} opsi={OPSI_JENIS_REKLAME} /></Field>
        <Field label="Keterangan"><Textarea value={form.keterangan} onChange={e => set("keterangan", e.target.value)} placeholder="Catatan kondisi atau temuan lapangan" rows={2} /></Field>
        <div className="sm:col-span-2 grid gap-4 sm:grid-cols-2"><Field label="Latitude" required><Input type="number" step="any" value={form.lat} onChange={e => set("lat", e.target.value)} /></Field><Field label="Longitude" required><Input type="number" step="any" value={form.lng} onChange={e => set("lng", e.target.value)} /></Field></div>
        <div className="sm:col-span-2 flex flex-wrap gap-2"><ActionButton variant="secondary" onClick={() => setPickerOpen(true)} icon={<MapPin className="h-4 w-4" />}>Pilih Titik di Peta</ActionButton><ActionButton variant="secondary" onClick={requestLocation} disabled={geoLoading} icon={<LocateFixed className={cn("h-4 w-4", geoLoading && "animate-pulse")} />}>{geoLoading ? "Mengambil GPS…" : "Ambil Lokasi GPS"}</ActionButton></div>
        <Field label="Panjang (cm)"><Input type="number" min="0" value={form.panjang} onChange={e => set("panjang", e.target.value)} /></Field><Field label="Lebar (cm)"><Input type="number" min="0" value={form.lebar} onChange={e => set("lebar", e.target.value)} /></Field>
      </div>
    </Modal>
    <MapPickerModal open={pickerOpen && open} onClose={() => setPickerOpen(false)} initialLat={Number(form.lat) || undefined} initialLng={Number(form.lng) || undefined} onSelect={p => { set("lat", String(p.lat)); set("lng", String(p.lng)); setPickerOpen(false) }} />
  </>
}
