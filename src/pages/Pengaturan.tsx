import { useEffect, useRef, useState } from "react"
import { useSearchParams } from "react-router-dom"
import {
  KeyRound,
  LockKeyhole,
  Save,
  Shield,
  UserCog,
  UserRound,
  FileText,
  Palette,
  PenTool,
  UploadCloud,
  X,
} from "lucide-react"
import { AppLayout } from "@/components/layout"
import {
  ActionButton,
  Card,
  CardTitle,
  Field,
  Input,
  PasswordField,
  StrengthMeter,
  Tabs,
} from "@/components/ui/primitives"
import { Modal } from "@/components/ui/Modal"
import { useToast } from "@/hooks/useToast"
import { useAuth } from "@/context/AuthContext"
import { formatTanggalLengkap, formatTanggalWaktu } from "@/utils"
import {
  APP_FULL_NAME,
  APP_INSTANSI,
  APP_NAME,
  ROLE_LABEL,
} from "@/lib/access"
import { PASSWORD_MIN, tanpaSpasi } from "@/lib/akun"
import { ManajemenPenggunaContent } from "@/pages/ManajemenPengguna"
import { JanakaLogo } from "@/components/layout/JanakaLogo"
import { KerangkaPengaturan } from "@/components/common/Kerangka"
import { ambilFormatDokumen, simpanFormatDokumen } from "@/services/formatDokumenService"
import {
  DEFAULT_FORMAT_DOKUMEN,
  bacaFormatDokumenCache,
  type FormatDokumen,
  type KopKonfigurasi,
  type Penandatangan,
} from "@/lib/formatDokumen"
import { uploadToCloudinary } from "@/lib/cloudinary"
import { validateImageFile } from "@/lib/cloudinary/upload"

type Tab = "profil" | "pengguna" | "format-dokumen" | "tentang"

export default function Pengaturan() {
  const { can, changePassword, refreshProfile } = useAuth()
  const { showToast } = useToast()
  const [refreshing, setRefreshing] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()

  const tabParam = searchParams.get("tab")
  const canKelolaPengguna = can("aksiKelolaPengguna")

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await refreshProfile()
      showToast("Data pengaturan berhasil diperbarui.", "info")
    } catch {
      showToast("Gagal memperbarui data pengaturan.", "error")
    } finally {
      setRefreshing(false)
    }
  }

  const activeTab: Tab =
    tabParam === "pengguna" && canKelolaPengguna
      ? "pengguna"
      : tabParam === "format-dokumen" && canKelolaPengguna
        ? "format-dokumen"
        : tabParam === "tentang"
          ? "tentang"
          : "profil"

  const handleTabChange = (nextTab: string) => {
    setSearchParams({ tab: nextTab }, { replace: true })
  }

  const tabItems = [
    { id: "profil", label: "Profil Saya", icon: <UserRound className="h-4 w-4" /> },
    ...(canKelolaPengguna
      ? [
          { id: "pengguna", label: "Manajemen Pengguna", icon: <UserCog className="h-4 w-4" /> },
          { id: "format-dokumen", label: "Format Dokumen", icon: <FileText className="h-4 w-4" /> },
        ]
      : []),
    { id: "tentang", label: "Tentang Sistem", icon: <Shield className="h-4 w-4" /> },
  ]

  return (
    <AppLayout onRefresh={handleRefresh} refreshing={refreshing}>
      <div className="space-y-5">
        <Tabs
          layoutId="janaka-tab-pengaturan"
          value={activeTab}
          onChange={handleTabChange}
          items={tabItems}
          iconOnlyMobile
        />

        {activeTab === "profil" &&
          (refreshing ? (
            <KerangkaPengaturan tab="profil" />
          ) : (
            <TabProfil onChangePassword={changePassword} />
          ))}
        {activeTab === "pengguna" && canKelolaPengguna && (
          <ManajemenPenggunaContent />
        )}
        {activeTab === "format-dokumen" && canKelolaPengguna && <TabFormatDokumen />}
        {activeTab === "tentang" && <TabTentang />}
      </div>
    </AppLayout>
  )
}

/* ── Tab: Profil Saya (Termasuk Ubah Password) ─────────────────────────── */

function TabProfil({
  onChangePassword,
}: {
  onChangePassword: (current: string, next: string) => Promise<void>
}) {
  const { profile, role, updateProfile } = useAuth()
  const { showToast } = useToast()

  /* State profil */
  const [namaLengkap, setNamaLengkap] = useState(profile?.namaLengkap || "")
  const [jabatan, setJabatan] = useState(profile?.jabatan || "")
  const [nip, setNip] = useState(profile?.nip || "")
  const [savingProfil, setSavingProfil] = useState(false)
  const [errorsProfil, setErrorsProfil] = useState<Record<string, string>>({})

  /* Sinkronisasi state saat data profil diperbarui */
  useEffect(() => {
    if (profile) {
      setNamaLengkap(profile.namaLengkap || "")
      setJabatan(profile.jabatan || "")
      setNip(profile.nip || "")
    }
  }, [profile?.namaLengkap, profile?.jabatan, profile?.nip])

  const handleSimpanProfil = async (e: React.FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    const namaBersih = namaLengkap.trim()
    if (!namaBersih || namaBersih.length < 2) {
      errs.namaLengkap = "Nama lengkap minimal 2 karakter."
    }
    if (nip && !/^\d{1,20}$/.test(nip.trim())) {
      errs.nip = "NIP hanya boleh berisi angka (maksimal 20 digit)."
    }
    setErrorsProfil(errs)
    if (Object.keys(errs).length > 0) return

    setSavingProfil(true)
    try {
      await updateProfile({
        namaLengkap: namaBersih,
        jabatan: jabatan.trim(),
        nip: nip.trim(),
      })
      showToast("Profil berhasil diperbarui.", "success")
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal memperbarui profil.", "error")
    } finally {
      setSavingProfil(false)
    }
  }

  /* State Ubah Password (Modal) */
  const [modalPasswordOpen, setModalPasswordOpen] = useState(false)
  const [currentPass, setCurrentPass] = useState("")
  const [nextPass, setNextPass] = useState("")
  const [repeatPass, setRepeatPass] = useState("")
  const [busyPass, setBusyPass] = useState(false)
  const [errorsPass, setErrorsPass] = useState<Record<string, string>>({})

  const handleUbahPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (!currentPass) errs.current = "Password saat ini wajib diisi."
    if (!nextPass) errs.next = "Password baru wajib diisi."
    else if (nextPass.length < 6) errs.next = "Password minimal 6 karakter."
    if (nextPass !== repeatPass) errs.repeat = "Konfirmasi password tidak cocok."
    if (currentPass && nextPass && currentPass === nextPass) {
      errs.next = "Password baru harus berbeda dari password lama."
    }
    setErrorsPass(errs)
    if (Object.keys(errs).length > 0) return

    setBusyPass(true)
    try {
      await onChangePassword(currentPass, nextPass)
      showToast("Password berhasil diubah — gunakan password baru saat masuk berikutnya.", "success")
      setCurrentPass("")
      setNextPass("")
      setRepeatPass("")
      setModalPasswordOpen(false)
    } catch (err) {
      const message = normalizePasswordError(err)
      showToast(message, "error")
      if (/lama|salah|invalid/i.test(message)) setErrorsPass({ current: message })
    } finally {
      setBusyPass(false)
    }
  }

  const infoAkun: { label: string; value: string }[] = [
    { label: "Username", value: profile?.username || "-" },
    { label: "Peran", value: ROLE_LABEL[role] },
    { label: "Bergabung", value: formatTanggalLengkap(profile?.createdAt) },
    {
      label: "Login Terakhir",
      value: profile?.lastLoginAt ? formatTanggalWaktu(profile.lastLoginAt) : "Belum pernah",
    },
  ]

  return (
    <div className="space-y-5">
      {/* ── Form Edit Profil ── */}
      <Card>
        <CardTitle description="Perbarui identitas profil Anda (berlaku untuk admin dan petugas)">
          Data Profil Saya
        </CardTitle>

        <form onSubmit={handleSimpanProfil} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Nama Lengkap" error={errorsProfil.namaLengkap} htmlFor="namaLengkap" required>
              <Input
                id="namaLengkap"
                value={namaLengkap}
                onChange={(e) => {
                  setNamaLengkap(e.target.value)
                  setErrorsProfil((prev) => ({ ...prev, namaLengkap: "" }))
                }}
                placeholder="Nama lengkap Anda"
                disabled={savingProfil}
              />
            </Field>

            <Field label="Jabatan" htmlFor="jabatan">
              <Input
                id="jabatan"
                value={jabatan}
                onChange={(e) => setJabatan(e.target.value)}
                placeholder="Contoh: Petugas Penindakan Lapangan"
                disabled={savingProfil}
              />
            </Field>

            <Field label="NIP" error={errorsProfil.nip} htmlFor="nip">
              <Input
                id="nip"
                value={nip}
                onChange={(e) => {
                  setNip(e.target.value)
                  setErrorsProfil((prev) => ({ ...prev, nip: "" }))
                }}
                placeholder="Nomor Induk Pegawai (hanya angka)"
                disabled={savingProfil}
              />
            </Field>
          </div>

          <div className="pt-2">
            <ActionButton
              type="submit"
              loading={savingProfil}
              disabled={savingProfil}
              icon={<Save className="w-4 h-4" />}
            >
              Simpan Profil
            </ActionButton>
          </div>
        </form>

        {/* Informasi Akun Tambahan */}
        <div className="mt-6 border-t border-slate-200 dark:border-slate-800 pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Informasi Akun
              </p>
            </div>
            <ActionButton
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setErrorsPass({})
                setModalPasswordOpen(true)
              }}
              icon={<KeyRound className="w-3.5 h-3.5 text-blue-500" />}
            >
              Ubah Password
            </ActionButton>
          </div>

          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {infoAkun.map((r) => (
              <div
                key={r.label}
                className="flex flex-col rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-right shadow-xs dark:border-slate-800/60 dark:bg-slate-800/40"
              >
                <dt className="text-right text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {r.label}
                </dt>
                <dd className="mt-0.5 break-words text-right text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {r.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </Card>

      {/* ── Modal Ubah Password ── */}
      <Modal
        open={modalPasswordOpen}
        onClose={() => {
          setModalPasswordOpen(false)
          setErrorsPass({})
          setCurrentPass("")
          setNextPass("")
          setRepeatPass("")
        }}
        title="Ubah Password"
        icon={<KeyRound className="w-4 h-4 text-blue-500" />}
        size="sm"
        footer={
          <div className="flex items-center justify-end gap-3 w-full">
            <ActionButton
              variant="secondary"
              onClick={() => setModalPasswordOpen(false)}
              disabled={busyPass}
            >
              Batal
            </ActionButton>
            <ActionButton
              onClick={(e) => void handleUbahPassword(e)}
              loading={busyPass}
              disabled={busyPass || !currentPass || !nextPass}
              icon={<KeyRound className="w-4 h-4" />}
            >
              Simpan Password
            </ActionButton>
          </div>
        }
      >
        <form onSubmit={handleUbahPassword} className="space-y-4">
          <Field label="Password Saat Ini" error={errorsPass.current} htmlFor="modalCurrentPass" required>
            <PasswordField
              id="modalCurrentPass"
              leadingIcon={<LockKeyhole className="w-4 h-4" strokeWidth={2.5} />}
              value={currentPass}
              onChange={(v) => {
                // Tanpa spasi — dicegah saat mengetik, bukan setelahnya.
                setCurrentPass(tanpaSpasi(v))
                setErrorsPass((p) => ({ ...p, current: "" }))
              }}
              placeholder="Masukkan password lama"
              disabled={busyPass}
              invalid={!!errorsPass.current}
            />
          </Field>
          <Field label="Password Baru" error={errorsPass.next} htmlFor="modalNextPass" required>
            <PasswordField
              id="modalNextPass"
              leadingIcon={<LockKeyhole className="w-4 h-4" strokeWidth={2.5} />}
              value={nextPass}
              onChange={(v) => {
                setNextPass(tanpaSpasi(v))
                setErrorsPass((p) => ({ ...p, next: "" }))
              }}
              placeholder={`Minimal ${PASSWORD_MIN} karakter, tanpa spasi`}
              autoComplete="new-password"
              disabled={busyPass}
              invalid={!!errorsPass.next}
            />
            {nextPass ? <StrengthMeter value={nextPass} /> : null}
          </Field>
          <Field label="Konfirmasi Password Baru" error={errorsPass.repeat} htmlFor="modalRepeatPass" required>
            <PasswordField
              id="modalRepeatPass"
              leadingIcon={<LockKeyhole className="w-4 h-4" strokeWidth={2.5} />}
              value={repeatPass}
              onChange={(v) => {
                setRepeatPass(tanpaSpasi(v))
                setErrorsPass((p) => ({ ...p, repeat: "" }))
              }}
              placeholder="Ulangi password baru"
              autoComplete="new-password"
              disabled={busyPass}
              invalid={!!errorsPass.repeat}
            />
          </Field>
        </form>
      </Modal>
    </div>
  )
}

/* ── Tab: Format Dokumen (BA & Rekap) ──────────────────────────────────── */

function TabFormatDokumen() {
  const { showToast } = useToast()
  const [cacheAwal] = useState(() => bacaFormatDokumenCache())
  const [cfg, setCfg] = useState<FormatDokumen>(cacheAwal ?? DEFAULT_FORMAT_DOKUMEN)
  const [pratinjauLogoKiri, setPratinjauLogoKiri] = useState(cfg.kop.logoKiri.url)
  const [pratinjauLogoKanan, setPratinjauLogoKanan] = useState(cfg.kop.logoKanan.url)
  const [loading, setLoading] = useState(cacheAwal === null)
  const [saving, setSaving] = useState(false)
  const konfigurasiDiubah = useRef(false)
  /** Slot logo yang sedang diunggah; `null` = tidak ada. */
  const [mengunggahLogo, setMengunggahLogo] = useState<"kiri" | "kanan" | null>(null)
  const fileLogoKiriRef = useRef<HTMLInputElement>(null)
  const fileLogoKananRef = useRef<HTMLInputElement>(null)

  // Hindari memuat ulang gambar saat URL masih sedang diketik.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPratinjauLogoKiri(cfg.kop.logoKiri.url)
      setPratinjauLogoKanan(cfg.kop.logoKanan.url)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [cfg.kop.logoKiri.url, cfg.kop.logoKanan.url])

  useEffect(() => {
    let aktif = true
    ambilFormatDokumen()
      .then((data) => {
        if (!aktif) return
        if (!konfigurasiDiubah.current) setCfg(data)
        setLoading(false)
      })
      .catch((err) => {
        if (!aktif) return
        console.error(err)
        showToast("Gagal memuat format dokumen.", "error")
        setLoading(false)
      })
    return () => {
      aktif = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      await simpanFormatDokumen(cfg)
      showToast("Format dokumen berhasil disimpan.", "success")
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal menyimpan.", "error")
    } finally {
      setSaving(false)
    }
  }

  /* ── Pengubah lokal ── */
  const ubahCfg = (ubah: (prev: FormatDokumen) => FormatDokumen) => {
    konfigurasiDiubah.current = true
    setCfg(ubah)
  }

  const ubahKop = (field: keyof KopKonfigurasi, nilai: string | number) => {
    ubahCfg((prev) => ({ ...prev, kop: { ...prev.kop, [field]: nilai } }))
  }

  /** Ubah sebagian satu slot logo (kiri atau kanan). */
  const ubahLogo = (sisi: "kiri" | "kanan", patch: Partial<{ url: string; lebarMm: number }>) => {
    ubahCfg((prev) => {
      const kunci = sisi === "kiri" ? "logoKiri" : "logoKanan"
      return { ...prev, kop: { ...prev.kop, [kunci]: { ...prev.kop[kunci], ...patch } } }
    })
  }

  const ubahPenandatangan = (field: keyof Penandatangan, nilai: string) => {
    ubahCfg((prev) => ({
      ...prev,
      penandatangan: { ...prev.penandatangan, [field]: nilai },
    }))
  }

  /*
   * Unggah logo ke Cloudinary.
   *
   * Logo disimpan sebagai URL Cloudinary, bukan data URL. Data URL logo
   * 200 KB masuk ke dokumen Firestore dan ikut terambil setiap kali
   * pengaturan dibuka — URL jauh lebih ringan dan bisa di-ganti tanpa
   * menyentuh dokumen.
   */
  const unggahLogo = async (file: File, sisi: "kiri" | "kanan") => {
    const err = validateImageFile(file)
    if (err) {
      showToast(err, "error")
      return
    }
    setMengunggahLogo(sisi)
    try {
      const hasil = await uploadToCloudinary(file, "janaka/logo")
      ubahLogo(sisi, { url: hasil.url })
      showToast(`Logo ${sisi} berhasil diunggah.`, "success")
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Gagal mengunggah logo.", "error")
    } finally {
      setMengunggahLogo(null)
      const ref = sisi === "kiri" ? fileLogoKiriRef : fileLogoKananRef
      if (ref.current) ref.current.value = ""
    }
  }

  if (loading) return <KerangkaPengaturan tab="profil" />

  return (
    <div className="space-y-5">
      {/* ── KOP ── */}
      <Card>
        <CardTitle description="Kepala surat untuk Berita Acara & Rekapitulasi">
          <div className="flex items-center gap-2">
            <Palette className="h-4 w-4" />
            <span>KOP Surat</span>
          </div>
        </CardTitle>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Nama Instansi Baris 1" htmlFor="kop-b1">
            <Input
              id="kop-b1"
              value={cfg.kop.instansiBaris1}
              onChange={(e) => ubahKop("instansiBaris1", e.target.value)}
              placeholder="BADAN PENEGAK PERDA SATPOL PP"
            />
          </Field>
          <Field label="Nama Instansi Baris 2" htmlFor="kop-b2">
            <Input
              id="kop-b2"
              value={cfg.kop.instansiBaris2}
              onChange={(e) => ubahKop("instansiBaris2", e.target.value)}
              placeholder="KABUPATEN PONOROGO"
            />
          </Field>
          <Field label="Kota" htmlFor="kop-kota">
            <Input
              id="kop-kota"
              value={cfg.kota}
              onChange={(e) => ubahCfg((prev) => ({ ...prev, kota: e.target.value }))}
              placeholder="Ponorogo"
            />
          </Field>
          <Field label="Alamat" htmlFor="kop-alamat" className="sm:col-span-2">
            <Input
              id="kop-alamat"
              value={cfg.kop.alamat}
              onChange={(e) => ubahKop("alamat", e.target.value)}
              placeholder="Jalan Daeng Sastrodirja, Ponorogo, Jawa Timur"
            />
          </Field>
          <Field label="Telepon" htmlFor="kop-telepon">
            <Input
              id="kop-telepon"
              value={cfg.kop.telepon}
              onChange={(e) => ubahKop("telepon", e.target.value)}
              placeholder="(0352) 421165"
            />
          </Field>
        </div>
      </Card>

      {/* ── Logo ──
          Dua slot supaya kop surat resmi bisa memakai dua lambang —
          instansi induk di kiri, instansi pelaksana di kanan. Keduanya
          bisa diisi salah satu saja, atau satu pun dilewat. */}
      <Card>
        <CardTitle description="Dua slot logo (kiri & kanan). Bisa diisi salah satu atau keduanya — unggah berkas atau tempel tautan.">
          <div className="flex items-center gap-2">
            <UploadCloud className="h-4 w-4" />
            <span>Logo Kop Surat</span>
          </div>
        </CardTitle>

        <div className="grid gap-4 sm:grid-cols-2">
          {(["kiri", "kanan"] as const).map((sisi) => {
            const logo = sisi === "kiri" ? cfg.kop.logoKiri : cfg.kop.logoKanan
            const urlPratinjau = sisi === "kiri" ? pratinjauLogoKiri : pratinjauLogoKanan
            const idAwal = sisi === "kiri" ? "logo-kiri" : "logo-kanan"
            return (
              <div
                key={sisi}
                className="rounded-xl border border-slate-200 p-3.5 dark:border-slate-700/60"
              >
                <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Logo {sisi === "kiri" ? "Kiri" : "Kanan"}
                </p>

                {/* Pratinjau — posisi & ukuran bisa dinilai sebelum disimpan. */}
                <div className="mb-3 flex h-28 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-700">
                  {urlPratinjau ? (
                    <img
                      src={urlPratinjau}
                      alt={`Pratinjau logo ${sisi}`}
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <span className="text-[11px] font-semibold text-slate-400">Belum ada logo</span>
                  )}
                </div>

                <div className="space-y-3">
                  <Field label="URL Logo" htmlFor={`${idAwal}-url`}>
                    <Input
                      id={`${idAwal}-url`}
                      value={logo.url}
                      onChange={(e) => ubahLogo(sisi, { url: e.target.value })}
                      placeholder="https://… (kosongkan bila tidak dipakai)"
                    />
                  </Field>

                  <Field label="Lebar (mm)" htmlFor={`${idAwal}-lebar`}>
                    <Input
                      id={`${idAwal}-lebar`}
                      type="number"
                      min={5}
                      max={60}
                      value={String(logo.lebarMm)}
                      onChange={(e) =>
                        ubahLogo(sisi, { lebarMm: Number(e.target.value) || 0 })
                      }
                    />
                  </Field>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input
                    ref={sisi === "kiri" ? fileLogoKiriRef : fileLogoKananRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) void unggahLogo(f, sisi)
                    }}
                  />
                  <ActionButton
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      (sisi === "kiri" ? fileLogoKiriRef : fileLogoKananRef).current?.click()
                    }
                    disabled={mengunggahLogo === sisi}
                    icon={<UploadCloud className="h-3.5 w-3.5" />}
                  >
                    {mengunggahLogo === sisi ? "Mengunggah…" : "Unggah"}
                  </ActionButton>
                  {logo.url ? (
                    <ActionButton
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => ubahLogo(sisi, { url: "" })}
                      icon={<X className="h-3.5 w-3.5" />}
                    >
                      Hapus
                    </ActionButton>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      {/* ── Penandatangan ── */}
      <Card>
        <CardTitle description="Satu penandatangan untuk semua dokumen (BA & Rekap)">
          <div className="flex items-center gap-2">
            <PenTool className="h-4 w-4" />
            <span>Penandatangan</span>
          </div>
        </CardTitle>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Jabatan" htmlFor="ttd-jabatan">
            <Input
              id="ttd-jabatan"
              value={cfg.penandatangan.jabatan}
              onChange={(e) => ubahPenandatangan("jabatan", e.target.value)}
              placeholder="Kasat Satpol PP"
            />
          </Field>
          <Field label="Nama Lengkap" htmlFor="ttd-nama">
            <Input
              id="ttd-nama"
              value={cfg.penandatangan.nama}
              onChange={(e) => ubahPenandatangan("nama", e.target.value)}
              placeholder="Nama beserta gelar"
            />
          </Field>
          <Field label="NIP" htmlFor="ttd-nip">
            <Input
              id="ttd-nip"
              value={cfg.penandatangan.nip}
              onChange={(e) => ubahPenandatangan("nip", e.target.value)}
              placeholder="197501011995031001"
            />
          </Field>
        </div>
      </Card>

      {/* ── Judul dokumen ── */}
      <Card>
        <CardTitle description="Judul yang tercetak di bagian atas setiap dokumen">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            <span>Judul Dokumen</span>
          </div>
        </CardTitle>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Judul Berita Acara" htmlFor="judul-ba">
            <Input
              id="judul-ba"
              value={cfg.judulBA}
              onChange={(e) => ubahCfg((prev) => ({ ...prev, judulBA: e.target.value }))}
              placeholder="BERITA ACARA PENINDAKAN LAPANGAN"
            />
          </Field>
          <Field label="Judul Rekapitulasi" htmlFor="judul-rekap">
            <Input
              id="judul-rekap"
              value={cfg.judulRekap}
              onChange={(e) => ubahCfg((prev) => ({ ...prev, judulRekap: e.target.value }))}
              placeholder="REKAPITULASI RIWAYAT PENINDAKAN REKLAME"
            />
          </Field>
        </div>
      </Card>

      {/* ── Simpan ── */}
      <div className="flex justify-end border-t border-slate-200/90 pt-4 dark:border-slate-700/60">
        <ActionButton
          onClick={handleSave}
          loading={saving}
          icon={<Save className="w-4 h-4" />}
        >
          Simpan Format Dokumen
        </ActionButton>
      </div>
    </div>
  )
}

/* ── Tab: Tentang Sistem ───────────────────────────────────────────────── */

function TabTentang() {
  const { role } = useAuth()
  return (
    <Card>
      <CardTitle description="Informasi sistem dan aplikasi JANAKA">Tentang Sistem</CardTitle>

      {/* Kepala identitas — dua logo sejajar, sama tinggi.
          Tanpa pembungkus kartu: latar belakangnya sudah putih, dan
          wadah tambahan cuma menambah garis yang tidak bermakna. */}
      <div className="mb-5 flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 text-center dark:border-slate-700/60 dark:bg-slate-800/30 sm:flex-row sm:gap-4 sm:text-left">
        <div className="flex items-center gap-4">
          <img
            src="/assets/logo_satpol.svg"
            alt="Logo Satpol PP Kabupaten Ponorogo"
            className="h-14 w-auto shrink-0 object-contain sm:h-16"
            draggable={false}
            decoding="async"
          />
          <span aria-hidden="true" className="h-10 w-px shrink-0 bg-slate-300 dark:bg-slate-600 sm:h-12" />
          <JanakaLogo className="h-14 w-14 shrink-0 object-contain sm:h-16 sm:w-16" />
        </div>
        <div className="min-w-0">
          <p className="text-lg font-black uppercase leading-none tracking-[0.16em] text-slate-800 dark:text-slate-100">
            {APP_NAME}
          </p>
          <p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {APP_FULL_NAME}
          </p>
        </div>
      </div>

      <div className="space-y-0">
        <InfoRow label="Nama Aplikasi" value={APP_NAME} />
        <InfoRow label="Nama Panjang" value={APP_FULL_NAME} />
        <InfoRow label="Instansi" value={APP_INSTANSI} />
        <InfoRow label="Pengembang" value="Ahmad Abdul Basith, S.Tr.I.P" />
        <InfoRow label="Versi" value="1.0.0" />
        <InfoRow label="Peran Anda" value={ROLE_LABEL[role]} />
        <InfoRow label="Sumber Data" value="API PTSP · Sprinter Ponorogo" />
        <InfoRow label="Database" value="Firebase Firestore" last />
      </div>
    </Card>
  )
}

/* ── Helper kecil ──────────────────────────────────────────────────────── */

function InfoRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div
      className={`flex items-center justify-between gap-4 py-2.5 text-sm ${
        !last ? "border-b border-slate-200/90 dark:border-slate-700/60" : ""
      }`}
    >
      <span className="shrink-0 text-slate-500 dark:text-slate-400">{label}</span>
      <span className="text-right font-semibold text-slate-800 dark:text-slate-100">{value}</span>
    </div>
  )
}

function normalizePasswordError(err: unknown): string {
  const code =
    typeof err === "object" && err !== null && "code" in err
      ? String((err as { code: string }).code)
      : ""
  switch (code) {
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Password saat ini salah."
    case "auth/weak-password":
      return "Password baru terlalu lemah."
    case "auth/requires-recent-login":
      return "Sesi terlalu lama. Silakan keluar lalu masuk kembali."
    case "auth/network-request-failed":
      return "Tidak dapat menghubungi server autentikasi."
    default:
      return err instanceof Error ? err.message : "Gagal mengubah password."
  }
}
