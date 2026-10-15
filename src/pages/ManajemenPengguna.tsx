import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  AlertCircle,
  CircleDot,
  Lock,
  LockKeyhole,
  Plus,
  Search,
  ServerCrash,
  Shield,
  ShieldCheck,
  Trash2,
  UserCog,
} from "lucide-react"
import { AppLayout } from "@/components/layout"
import {
  ActionButton,
  Alert,
  Badge,
  Card,
  DataTable,
  EmptyState,
  Field,
  Input,
  InputWithIcon,
  PasswordField,
  StatTile,
  Textarea,
  type Column,
} from "@/components/ui/primitives"
import { Dropdown } from "@/components/ui/Dropdown"
import { AksiMenu } from "@/components/ui/AksiMenu"
import { ConfirmDialog, Modal } from "@/components/ui/Modal"
import { cn } from "@/lib/cn"
import { useAuth } from "@/context/AuthContext"
import { useToast } from "@/hooks/useToast"
import {
  buatPengguna,
  daftarPengguna,
  hapusPengguna,
  ubahPengguna,
} from "@/services/adminApi"
import { formatTanggalSingkat } from "@/utils"
import {
  DEFAULT_ADMIN_PERMISSIONS,
  DEFAULT_USER_PERMISSIONS,
  IZIN_WAJIB,
  PERMISSION_GROUPS,
  PERMISSION_KHUSUS_ADMIN,
  PERMISSION_LABELS,
  ROLE_LABEL,
  sanitize,

  type AppPermissions,
  type AppUser,
  type UserRole,
} from "@/lib/access"
import {
  PASSWORD_MIN,
  normalisasiUsername,
  tanpaSpasi,
  validasiPassword,
  validasiUsername,
} from "@/lib/akun"

export function ManajemenPenggunaContent() {
  const { profile: currentUser, refreshProfile, isApiReady, apiNotice } = useAuth()
  const { showToast } = useToast()

  const [users, setUsers] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [filterRole, setFilterRole] = useState<"semua" | UserRole>("semua")
  const [dialog, setDialog] = useState<{ mode: "buat" | "ubah"; user?: AppUser } | null>(null)
  const [konfirmasiHapus, setKonfirmasiHapus] = useState<AppUser | null>(null)

  const muat = useCallback(async () => {
    if (!isApiReady) {
      setLoading(false)
      setUsers([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await daftarPengguna()
      if (!res.ok) {
        setError(res.pesan ?? "Gagal memuat daftar pengguna.")
        setUsers([])
        return
      }
      setUsers(res.data ?? [])
    } finally {
      setLoading(false)
    }
  }, [isApiReady])

  useEffect(() => {
    void muat()
  }, [muat])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return users.filter((u) => {
      if (filterRole !== "semua" && u.role !== filterRole) return false
      if (!q) return true
      return [u.namaLengkap, u.username, u.jabatan, u.nip].some((v) =>
        String(v ?? "").toLowerCase().includes(q),
      )
    })
  }, [users, search, filterRole])

  const stats = useMemo(
    () => ({
      total: users.length,
      admin: users.filter((u) => u.role === "admin").length,
      user: users.filter((u) => u.role === "user").length,
    }),
    [users],
  )

  const handleHapus = async () => {
    const target = konfirmasiHapus
    if (!target) return

    if (target.uid === currentUser?.uid) {
      showToast("Anda tidak dapat menghapus akun Anda sendiri.", "error")
      setKonfirmasiHapus(null)
      return
    }

    setLoading(true)
    try {
      const res = await hapusPengguna(target.uid)
      if (!res.ok) {
        showToast(res.pesan ?? "Gagal menghapus akun.", "error")
        return
      }
      showToast(res.pesan ?? "Akun dihapus.", "success")
      setKonfirmasiHapus(null)
      await muat()
    } finally {
      setLoading(false)
    }
  }

  /** Kolom tabel pengguna. */
  const kolomAkun: Column<AppUser>[] = [
    {
      /*
       * Nomor urut, sama seperti di Data Reklame.
       *
       * Daftar pengguna tidak berpaginasi, jadi angkanya cukup urutan
       * baris yang tampil. Kolom ini membantu admin cepat menunjuk akun
       * yang sedang dibahas saat bicara di depan layar.
       */
      key: "no",
      header: "No.",
      render: (_u, idx) => (
        <span className="block text-center font-mono text-xs font-semibold text-slate-500 dark:text-slate-400">
          {(idx ?? 0) + 1}
        </span>
      ),
      className: "w-12 text-center",
    },
    {
      key: "akun",
      header: "Akun",
      mobileTitle: true,
      render: (u) => (
        <div className="min-w-0">
          <p className="break-words font-semibold text-slate-800 dark:text-slate-100">
            {u.namaLengkap || u.username}
            {u.uid === currentUser?.uid ? (
              <span className="ml-1.5 text-[10px] font-bold text-blue-600 dark:text-blue-400">
                (Anda)
              </span>
            ) : null}
          </p>
          <p className="break-all font-mono text-[11px] text-blue-600/80 dark:text-blue-400/80">
            @{u.username}
          </p>
        </div>
      ),
      /*
       * Kolom ini tidak dipaksa `truncate` lagi. Nama panjang dan username
       * sering lebih panjang dari 190px, dan memotongnya berarti admin tidak
       * bisa membedakan dua akun tanpa membuka detail. `break-words` +
       * lebar minimum membuatnya membungkus ke baris berikutnya, dan itu
       * lebih berguna daripada satu baris rapi tapi tak kebaca.
       */
      className: "min-w-[190px] max-w-[280px]",
    },
    {
      key: "peran",
      header: "Peran",
      render: (u) => (
        <Badge tone={u.role === "admin" ? "violet" : "slate"}>
          {u.role === "admin" ? <ShieldCheck className="h-3 w-3" /> : <CircleDot className="h-3 w-3" />}
          {ROLE_LABEL[u.role]}
        </Badge>
      ),
    },
    {
      key: "jabatan",
      header: "Jabatan / NIP",
      /*
       * Jabatan dibungkus, dipotong. "Petugas Penindakan Lapangan Wilayah
       * Barat" bukan teks aneh — dipotong jadi "Petugas Penindakan Lap…"
       * admin harus membuka detail untuk tahu sisanya.
       */
      className: "min-w-[170px] max-w-[280px]",
      render: (u) => (
        <div className="min-w-0">
          <p className="break-words text-xs text-slate-700 dark:text-slate-200">
            {u.jabatan || "-"}
          </p>
          {u.nip ? (
            <p className="break-all font-mono text-[10px] text-slate-400 dark:text-slate-500">
              NIP {u.nip}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: "izin",
      header: "Menu Diizinkan",
      render: (u) =>
        u.role === "admin" ? (
          <Badge tone="blue">
            <Shield className="h-3 w-3" />
            Penuh
          </Badge>
        ) : (
          <span className="text-xs tabular-nums text-slate-400 dark:text-slate-500">
            {Object.values(u.permissions ?? {}).filter(Boolean).length} izin
          </span>
        ),
    },
    {
      key: "login",
      header: "Login Terakhir",
      render: (u) => (
        <span className="whitespace-nowrap text-xs text-slate-400 dark:text-slate-500">
          {formatTanggalSingkat(u.lastLoginAt)}
        </span>
      ),
    },
    {
      key: "aksi",
      header: "",
      render: (u) => (
        <div className="flex gap-1.5">
          <ActionButton
            size="sm"
            variant="secondary"
            onClick={() => setDialog({ mode: "ubah", user: u })}
            icon={<UserCog className="h-3.5 w-3.5" />}
          >
            Ubah
          </ActionButton>
          <AksiMenu
            items={[
              {
                id: "hapus",
                label: "Hapus Akun",
                hint: "Menghapus dari Firebase Auth & Firestore",
                icon: Trash2,
                tone: "danger",
                disabled: u.uid === currentUser?.uid,
                pemisah: true,
                onClick: () => setKonfirmasiHapus(u),
              },
            ]}
            label={`Aksi untuk ${u.namaLengkap || u.username}`}
            disabled={u.uid === currentUser?.uid}
          />
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-5">
      {/* Banner konfigurasi server */}
        {!isApiReady ? (
          <Alert tone="amber" icon={<ServerCrash className="w-4 h-4 shrink-0 mt-0.5" />}>
            <p className="font-bold">API manajemen akun belum aktif</p>
            <p className="mt-0.5">
              Operasi buat/ubah/hapus akun hanya bisa dilakukan lewat server yang memakai
              Firebase Admin SDK — SDK itu tidak boleh ada di browser demi keamanan.
            </p>
            <ol className="mt-1.5 list-decimal space-y-0.5 pl-5 text-xs opacity-90">
              <li>
                Unduh service account JSON di Firebase Console → Project Settings → Service
                Accounts.
              </li>
              <li>
                Tempelkan ke <code className="font-mono">.env</code> sebagai{" "}
                <code className="font-mono">FIREBASE_SERVICE_ACCOUNT</code>.
              </li>
              <li>
                Jalankan <code className="font-mono">npm run dev</code> lalu muat ulang halaman.
              </li>
            </ol>
            {apiNotice ? <p className="mt-1 text-[11px] opacity-70">Server: {apiNotice}</p> : null}
          </Alert>
        ) : null}

        {/* Statistik */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatTile label="Total Akun" value={stats.total} tone="slate" />
          <StatTile label="Administrator" value={stats.admin} tone="violet" />
          <StatTile label="Petugas" value={stats.user} tone="blue" />
        </div>

        {/* Filter */}
        <Card>
          <div className="grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
            <Field label="Cari Akun" htmlFor="cariPengguna">
              <InputWithIcon
                id="cariPengguna"
                name="cariPengguna"
                type="search"
                placeholder="Nama, username, jabatan, atau NIP…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                icon={<Search className="h-4 w-4" />}
              />
            </Field>
            <Field label="Peran" htmlFor="filterRole">
              <Dropdown
                id="filterRole"
                aria-label="Peran"
                value={filterRole}
                onChange={(v: string) => setFilterRole(v as "semua" | UserRole)}
                opsi={[
                  { value: "semua", label: "Semua peran" },
                  { value: "admin", label: "Administrator" },
                  { value: "user", label: "Petugas" },
                ]}
              />
            </Field>

            {/* Tombol duduk sejajar baris input, bukan melayang di atas. */}
            <div className="flex sm:justify-end">
              <ActionButton
                onClick={() => setDialog({ mode: "buat" })}
                disabled={!isApiReady}
                className="w-full sm:w-auto"
                icon={<Plus className="h-4 w-4" />}
              >
                Akun Baru
              </ActionButton>
            </div>
          </div>
        </Card>

        {/* Tabel */}
        <Card>
          {!isApiReady ? (
            <EmptyState
              message="Server belum siap"
              hint="Isi kredensial Firebase Admin SDK di berkas .env untuk mengaktifkan manajemen akun."
              icon={<ServerCrash className="w-6 h-6" />}
            />
          ) : error ? (
            <EmptyState
              message="Gagal memuat pengguna"
              hint={error}
              icon={<AlertCircle className="w-6 h-6" />}
              action={
                <ActionButton size="sm" onClick={() => void muat()}>
                  Coba Lagi
                </ActionButton>
              }
            />
          ) : (
            <DataTable
              columns={kolomAkun}
              rows={filtered}
              keyOf={(u) => u.uid}
              loading={loading && users.length === 0}
              skeletonRows={5}
              emptyMessage={
                users.length === 0
                  ? "Buat akun pertama untuk petugas lapangan."
                  : "Tidak ada akun yang cocok dengan filter."
              }
              bordered
            />
          )}
        </Card>

        {/* Dialog buat / ubah */}
        {dialog ? (
          <DialogAkun
            mode={dialog.mode}
            akun={dialog.user}
            onClose={() => setDialog(null)}
            onSelesai={async (pesan) => {
              setDialog(null)
              showToast(pesan, "success")
              await muat()
              await refreshProfile()
            }}
          />
        ) : null}

        {/* Konfirmasi hapus — ConfirmDialog, bukan `window.confirm`. */}
        <ConfirmDialog
          open={!!konfirmasiHapus}
          tone="danger"
          title="Hapus Akun?"
          message={
            <>
              Akun{" "}
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                {konfirmasiHapus?.namaLengkap || konfirmasiHapus?.username}
              </span>{" "}
              (@{konfirmasiHapus?.username}) akan dihapus dari Firebase Authentication dan tidak dapat
              masuk kembali.
            </>
          }
          confirmLabel="Ya, Hapus Akun"
          cancelLabel="Batal"
          loading={loading}
          onConfirm={() => void handleHapus()}
          onCancel={() => setKonfirmasiHapus(null)}
        />
    </div>
  )
}

export default function ManajemenPengguna() {
  return (
    <AppLayout>
      <ManajemenPenggunaContent />
    </AppLayout>
  )
}

/* ══════════════════════════════════════════════════════════════════
 *  Dialog Buat / Ubah Akun
 * ══════════════════════════════════════════════════════════════════ */

function DialogAkun({
  mode,
  akun,
  onClose,
  onSelesai,
}: {
  mode: "buat" | "ubah"
  akun?: AppUser
  onClose: () => void
  onSelesai: (pesan: string) => Promise<void>
}) {
  const baru = mode === "buat"
  const { showToast } = useToast()
  const formRef = useRef<HTMLFormElement>(null)

  const [username, setUsername] = useState(akun?.username ?? "")
  const [namaLengkap, setNamaLengkap] = useState(akun?.namaLengkap ?? "")
  const [password, setPassword] = useState("")
  const [role, setRole] = useState<UserRole>(akun?.role ?? "user")
  const [jabatan, setJabatan] = useState(akun?.jabatan ?? "")
  const [nip, setNip] = useState(akun?.nip ?? "")
  const [catatan, setCatatan] = useState(akun?.catatan ?? "")
  const isActive = akun?.isActive !== false
  const [izin, setIzin] = useState<AppPermissions>(
    akun?.permissions ?? { ...DEFAULT_USER_PERMISSIONS },
  )
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const gantiPeran = (berikut: UserRole) => {
    setRole(berikut)
    setIzin(
      berikut === "admin" ? { ...DEFAULT_ADMIN_PERMISSIONS } : { ...DEFAULT_USER_PERMISSIONS },
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}

    const errUsername = validasiUsername(username)
    if (errUsername) errs.username = errUsername
    if (namaLengkap.trim().length < 2) {
      errs.namaLengkap = "Nama lengkap minimal 2 karakter."
    }
    if (nip && !/^\d{1,20}$/.test(nip.trim())) errs.nip = "NIP hanya boleh angka."

    // Sama saja baik buat akun baru maupun atur ulang: password opsional
    // hanya berarti "biarkan" kalau kolomnya memang dikosongkan.
    if (password) {
      const errPass = validasiPassword(password)
      if (errPass) errs.password = errPass
    }

    setErrors(errs)
    if (Object.keys(errs).length > 0) return

    setBusy(true)
    try {
      const form = {
        username: normalisasiUsername(username),
        namaLengkap: sanitize(namaLengkap, 120),
        role,
        jabatan: sanitize(jabatan, 120),
        nip: sanitize(nip, 20),
        catatan: sanitize(catatan, 300),
        permissions: izin,
        isActive,
        ...(password ? { password } : {}),
      }

      const res = baru ? await buatPengguna(form) : await ubahPengguna(akun!.uid, form)

      if (!res.ok) {
        if (res.kode === 400 && /username|password/i.test(res.pesan ?? "")) {
          setErrors({ username: res.pesan! })
        }
        if (res.kode === 409) {
          setErrors({ username: res.pesan ?? "Username sudah digunakan." })
        }
        showToast(res.pesan ?? "Gagal menyimpan akun pengguna.", "error")
        return
      }

      await onSelesai(
        res.pesan ??
          (baru ? `Akun ${username} berhasil dibuat.` : "Akun berhasil diperbarui."),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={baru ? "Buat Akun Baru" : `Ubah Akun — ${akun?.namaLengkap || akun?.username}`}
      icon={<UserCog className="w-4 h-4 text-violet-500" />}
      size="lg"
      footer={
        <div className="flex items-center justify-end gap-3 w-full">
          <ActionButton variant="secondary" onClick={onClose} disabled={busy}>
            Batal
          </ActionButton>
          <ActionButton onClick={() => formRef.current?.requestSubmit()} disabled={busy} loading={busy}>
            {busy ? "Menyimpan…" : baru ? "Buat Akun" : "Simpan Perubahan"}
          </ActionButton>
        </div>
      }
    >
      <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Username"
            required
            error={errors.username}
            htmlFor="username"
            hint="Tanpa spasi. Boleh memakai titik, garis, dan @"
          >
            <Input
              id="username"
              name="username"
              type="text"
              inputMode="text"
              placeholder="contoh: budi.santoso"
              value={username}
              // Spasi dibuang saat diketik maupun saat paste — bukan
              // sekadar dideklarasikan error setelahnya.
              onChange={(e) => setUsername(tanpaSpasi(e.target.value))}
              onBlur={() => setUsername((v) => normalisasiUsername(v))}
              invalid={!!errors.username}
              disabled={busy}
              autoComplete="off"
              spellCheck={false}
              autoCapitalize="none"
            />
          </Field>
          <Field label="Nama Lengkap" required error={errors.namaLengkap} htmlFor="namaLengkap">
            <Input
              id="namaLengkap"
              name="namaLengkap"
              placeholder="Nama lengkap petugas"
              value={namaLengkap}
              onChange={(e) => setNamaLengkap(e.target.value)}
              invalid={!!errors.namaLengkap}
              disabled={busy}
            />
          </Field>
        </div>

        <Field
          label={baru ? "Password" : "Password Baru"}
          required={baru}
          error={errors.password}
          htmlFor="password"
          hint={!baru ? "Kosongkan bila tidak diubah" : undefined}
        >
          <PasswordField
            id="password"
            leadingIcon={<LockKeyhole className="w-4 h-4" strokeWidth={2.5} />}
            value={password}
            onChange={setPassword}
            placeholder={baru ? `Minimal ${PASSWORD_MIN} karakter, tanpa spasi` : "••••••••"}
            autoComplete="new-password"
            invalid={!!errors.password}
            disabled={busy}
          />
        </Field>

        {/* Pilihan Peran Akun (Admin / Petugas) */}
        <Field label="Peran Akun">
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => gantiPeran("user")}
              disabled={busy}
              className={cn(
                "flex items-start gap-3 p-3 rounded-xl border text-left transition-all",
                role === "user"
                  ? "border-blue-500 bg-blue-50/70 dark:bg-blue-500/10 text-blue-900 dark:text-blue-100 ring-2 ring-blue-500/20"
                  : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300",
              )}
            >
              <div
                className={cn(
                  "w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5",
                  role === "user" ? "border-blue-600 bg-blue-600" : "border-slate-400",
                )}
              >
                {role === "user" ? <div className="w-1.5 h-1.5 rounded-full bg-white" /> : null}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold leading-tight">
                  Petugas (User)
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  Akses standar dibatasi oleh izin per menu
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => gantiPeran("admin")}
              disabled={busy}
              className={cn(
                "flex items-start gap-3 p-3 rounded-xl border text-left transition-all",
                role === "admin"
                  ? "border-violet-500 bg-violet-50/70 dark:bg-violet-500/10 text-violet-900 dark:text-violet-100 ring-2 ring-violet-500/20"
                  : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300",
              )}
            >
              <div
                className={cn(
                  "w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5",
                  role === "admin" ? "border-violet-600 bg-violet-600" : "border-slate-400",
                )}
              >
                {role === "admin" ? <div className="w-1.5 h-1.5 rounded-full bg-white" /> : null}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold leading-tight flex items-center gap-1.5 text-violet-700 dark:text-violet-300">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Administrator (Admin)
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  Akses penuh ke seluruh menu & sistem
                </p>
              </div>
            </button>
          </div>
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Jabatan" htmlFor="jabatan">
            <Input
              id="jabatan"
              name="jabatan"
              placeholder="mis. Petugas lapangan"
              value={jabatan}
              onChange={(e) => setJabatan(e.target.value)}
              disabled={busy}
            />
          </Field>
          <Field label="NIP" error={errors.nip} htmlFor="nip">
            <Input
              id="nip"
              name="nip"
              inputMode="numeric"
              placeholder="Nomor induk pegawai"
              value={nip}
              onChange={(e) => setNip(e.target.value)}
              invalid={!!errors.nip}
              disabled={busy}
              className="font-mono"
            />
          </Field>
        </div>

        <Field label="Catatan Admin" htmlFor="catatan" hint="Tidak dilihat petugas">
          <Textarea
            id="catatan"
            name="catatan"
            placeholder="Catatan internal (tidak dilihat petugas)"
            value={catatan}
            onChange={(e) => setCatatan(e.target.value)}
            rows={2}
            disabled={busy}
          />
        </Field>

        {/* Penetapan izin per menu */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-700/25 p-4">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Hak Akses Menu
          </p>
          <IzinAkun nilai={izin} role={role} onUbah={setIzin} disabled={busy} />
        </div>
      </form>
    </Modal>
  )
}

/* ── Penetapan izin per menu ── */

function IzinAkun({
  nilai,
  role,
  onUbah,
  disabled,
}: {
  nilai: AppPermissions
  role: UserRole
  onUbah: (v: AppPermissions) => void
  disabled?: boolean
}) {
  if (role === "admin") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-violet-500/30 bg-violet-500/10 p-3 text-xs font-semibold text-violet-700 dark:text-violet-400">
        <Lock className="h-3.5 w-3.5" />
        Administrator tidak dibatasi — akses penuh ke semua menu.
      </div>
    )
  }

  const total = Object.keys(nilai).length
  const aktif = Object.values(nilai).filter(Boolean).length

  const setAll = (v: boolean) => {
    const next: AppPermissions = { ...nilai }
    for (const key of Object.keys(next) as (keyof AppPermissions)[]) {
      if (IZIN_WAJIB.includes(key)) next[key] = true
      else if (PERMISSION_KHUSUS_ADMIN.includes(key)) next[key] = false
      else next[key] = v
    }
    onUbah(next)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          <span className="font-bold text-slate-800 dark:text-slate-100">{aktif}</span> dari{" "}
          {total} izin aktif
        </p>
        <div className="flex gap-1">
          <MiniBtn onClick={() => onUbah({ ...DEFAULT_USER_PERMISSIONS })} disabled={disabled}>
            Bawaan
          </MiniBtn>
          <MiniBtn onClick={() => setAll(true)} disabled={disabled}>
            Semua
          </MiniBtn>
          <MiniBtn onClick={() => setAll(false)} disabled={disabled}>
            Kosong
          </MiniBtn>
        </div>
      </div>

      {PERMISSION_GROUPS.map((group) => (
        <div key={group.label}>
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {group.label}
          </p>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {group.keys.map((key) => {
              const wajib = IZIN_WAJIB.includes(key)
              const nyala = nilai[key]
              return (
                <button
                  key={key}
                  type="button"
                  disabled={wajib || disabled}
                  onClick={() => onUbah({ ...nilai, [key]: !nyala })}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-xs font-semibold transition-colors disabled:cursor-not-allowed",
                    wajib
                      ? "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400"
                      : nyala
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                        : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50",
                  )}
                >
                  <span className="min-w-0 truncate text-left">{PERMISSION_LABELS[key]}</span>
                  <span className="shrink-0 rounded bg-black/5 px-1.5 py-0.5 text-[9px] font-bold dark:bg-white/10">
                    {wajib ? (
                      <>
                        <Lock className="mr-0.5 inline h-2.5 w-2.5" />
                        WAJIB
                      </>
                    ) : nyala ? (
                      "ON"
                    ) : (
                      "OFF"
                    )}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

function MiniBtn({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg border border-slate-200 dark:border-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400 transition-colors hover:bg-slate-100 dark:hover:bg-slate-700/60 disabled:opacity-40"
    >
      {children}
    </button>
  )
}
