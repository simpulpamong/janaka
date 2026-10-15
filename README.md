# JANAKA

**Jaringan Navigasi Penegakan Perda**
Sistem penegakan Perda & pengawasan perizinan reklame — Satpol PP Kabupaten Ponorogo.

Terintegrasi penuh dengan **API PTSP** (Sprinter Ponorogo), **Firebase**, dan
**Cloudinary**.

---

## Menjalankan

```bash
npm install
cp .env.example .env      # isi semua kredensial
npm run dev               # http://localhost:5173
```

Perintah lain:

| Perintah | Kegunaan |
| --- | --- |
| `npm run build` | build ke `dist/` |
| `npm start` | jalankan `dist/` + API pada satu port (`PORT`, default 5173) |
| `npm run typecheck:all` | typecheck aplikasi + konfigurasi Node + perkakas |
| `npm run test:dasar` | typecheck + deadcode + kontrak + tata letak (**tanpa** peramban/jaringan) |
| `npm run verify` | typecheck penuh + build + seluruh cek statis |
| `npm test` | `test:dasar` + integrasi + kualitas + keamanan API (butuh dev server aktif) |
| `npm run seed:admin` | buat / naikkan akun administrator pertama |

### Perkakas pengecekan

Skrip di `tools/`, dijalankan lewat `tsx` — tanpa perlu build.

| Perintah | Yang dijaga |
| --- | --- |
| `npm run test:deadcode` | ekspor yang tak pernah dipakai + **berkas yatim** |
| `npm run test:tools` | setiap CLI tool dipakai dan setiap path npm script valid |
| `npm run test:jsx` | komentar yang bocor jadi teks di layar (bug `Topbar`) |
| `npm run test:zindex` | skala lapisan: overlay **wajib** di atas modal (bug dropdown) |
| `npm run test:profil` | sinkronisasi profil: `login()` **harus** menunggu profil (bug kedipan) |
| `npm run test:kontrak` | izin browser vs server, rute, substitusi service worker |
| `npm run test:tata-letak` | jarak atas tiap menu seragam (tidak ada baris aksi melayang) |
| `npm run test:koneksi` | kelengkapan `.env` + jemput PTSP/Firebase/Cloudinary |
| `npm run test:kuota` | ukuran bundel gzip vs batas entrance & per-chunk |

> Kredensial uji (opsional, untuk `npm test`): `JANAKA_EMAIL` + `JANAKA_PASSWORD`.
>
> `test:deadcode` membaca allowlist dari `tools/deadcode-allow.json` — dipakai
> untuk berkas yang memang dijalankan, bukan diimpor (`server/index.ts`,
> `vite.config.ts`, plugin Vite).

---

## 1. Konfigurasi `.env`

### Firebase (browser)

`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`,
`VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`,
`VITE_FIREBASE_APP_ID`.

> ⚠️ Nilai berawalan `VITE_` ikut ter-render ke bundle browser. Jangan pernah
> memberi awalan tersebut pada kredensial Admin SDK.

### Firebase Admin SDK (server — wajib)

```
FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...}
```

Firebase Console → Project Settings → **Service Accounts** → *Generate new private key* →
unduh JSON → tempelkan seluruh isinya (satu baris) ke `FIREBASE_SERVICE_ACCOUNT`.

Alternatif: `GOOGLE_APPLICATION_CREDENTIALS=/path/service-account.json`.

Tanpa kredensial ini:
- login **tetap bisa** (memakai Firebase Authentication langsung),
- tetapi **Manajemen Pengguna, penetapan izin per menu, dan atur ulang password tidak
  bisa dipakai** — halaman `/pengaturan/pengguna` menampilkan banner yang menjelaskan
  apa yang perlu diisi.

Alasannya: operasi `createUser`, `updateUser`, `deleteUser`, dan `revokeRefreshTokens`
**tidak tersedia** di Firebase client SDK. Menjalankannya dari browser berarti
menaruh service account key di dalam paket yang diunduh siapa pun.

### Seed administrator

```bash
ADMIN_EMAIL=admin@ponorogo.go.id \
ADMIN_PASSWORD='RahasiaKuat123' \
  npm run seed:admin
```

Skrip ini aman dijalankan ulang: akun yang sudah ada akan memakai ulang UID-nya,
password diperbarui, dan role dipaksa menjadi `admin` dengan izin penuh.

### Cloudinary

`VITE_CLOUDINARY_CLOUD_NAME`, `VITE_CLOUDINARY_UPLOAD_PRESET`,
`VITE_CLOUDINARY_API_KEY`, `VITE_CLOUDINARY_API_SECRET`.

### PTSP

`VITE_PTSP_BASE_URL=https://sprinter.ponorogo.go.id`, `PTSP_API_KEY`.

Server PTSP tidak mengirim header CORS sehingga request langsung dari browser
diblokir. `vite.config.ts` menyediakan proxy `/api` dan `/v1`, dan header
`X-API-Key` disisipkan di sisi proses Node — bukan di browser. Simpan key
sebagai `PTSP_API_KEY` tanpa prefix `VITE_`; rotasi key bila sebelumnya sudah
dipakai sebagai `VITE_PTSP_API_KEY` atau fallback di bundle frontend.

---

## 2. Deploy Security Rules

Firestore Rules memverifikasi izin **per menu**, bukan hanya peran:

```
firebase deploy --only firestore:rules,firestore:indexes
```

| Koleksi | Baca | Tambah | Ubah | Hapus |
| --- | --- | --- | --- | --- |
| `users` | akun aktif | ✗ (server) | ✗ (server) | ✗ (server) |
| `laporan_penindakan` | akun aktif | `menuLaporan` | `menuLaporan` | `aksiHapusLaporan` |
| `titik_janaka` | akun aktif | `aksiTambahTitik` | `aksiTambahTitik` | `aksiTambahTitik` |

### Catatan deploy

Jalur yang paling sederhana adalah `npm run build && npm start` — satu proses Node
menyajikan `dist/`, `/api/janaka/*`, dan proxy PTSP di `/api/*` + `/v1/*`.
Kodenya identik dengan yang jalan di Vercel karena keduanya memakai
`server/ptspProxy.ts`; `npm run dev` memakai proxy Vite dengan endpoint
yang sama.

### Deploy ke Vercel

`vercel.json` membangun Vite ke `dist/`. Ada **dua** function, dipisah
sesuai kebutuhan:

| Function | Rute | Isi bundle |
| --- | --- | --- |
| `api/ptsp.ts` | `/api/*` (kecuali `janaka`), `/v1/*`, `/api/health` | **tanpa** `firebase-admin` — ringan, dan ini yang paling sering dipanggil |
| `api/janaka.ts` | `/api/janaka/*` | memakai `firebase-admin` (manajemen akun) |

Pemisahan ini disengaja: `firebase-admin` berukuran ±15 MB, dan sekitar
8 MB-nya hanya source map & deklarasi tipe. Kalau digabung, function PTSP
ikut membawa semuanya dan tiap cold start terasa berat. `excludeFiles` di
`vercel.json` memangkas `.map`, `.d.ts`, `.md`, dan `.txt` dari bundle.

Routing di `vercel.json` sengaja berlapis, dari atas ke bawah:

| # | Rule | Tujuan |
| --- | --- | --- |
| 1 | `handle: filesystem` | Berkas statis & function yang benar-benar ter-deploy |
| 2 | `/api/janaka/*` → `/api/janaka` | Function manajemen akun |
| 3–4 | `/v1/*`, `/api/*` → `/api/ptsp` | Function PTSP; dilewati otomatis kalau tidak ada |
| 5–6 | → `https://sprinter.ponorogo.go.id/...` | **Jaring pengaman** bila function gagal ter-deploy |
| 7 | `/(.*)` → `/index.html` | Fallback SPA |

Rule 5–6 menyisipkan `X-API-Key` dari env `PTSP_API_KEY` lewat `transforms`,
jadi key tetap server-only. Artinya **data PTSP tetap jalan walau function
Vercel gagal ter-build** — aturan 3–4 dilewati karena `check: true`, lalu
request diteruskan langsung ke PTSP.

> Fungsi PTSP **tidak boleh** mengimpor `janakaAdminApi` sama sekali, meski
> hanya lewat `import()` dinamis: file tracer Vercel tetap mengikuti impor
> dinamis, jadi SDK-nya ikut ter-bundle walaupun tidak pernah dieksekusi.
> Pemeriksaan kontrak menegakkan hal ini.

Atur variabel berikut di **Project Settings → Environment Variables** untuk
setiap environment yang dipakai (centang **All Environments**, bukan hanya
Preview — Production sering terlewat), lalu redeploy:

| Variabel | Dipakai oleh | Wajib |
| --- | --- | --- |
| `PTSP_API_KEY` | proxy PTSP (server-only) | **ya** |
| `VITE_PTSP_BASE_URL` | proxy PTSP + allow-list dokumen | tidak (ada default) |
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID` | build Vite (login & data) | **ya** |
| `VITE_CLOUDINARY_CLOUD_NAME`, `VITE_CLOUDINARY_UPLOAD_PRESET` | build Vite (unggah foto) | tidak |
| `FIREBASE_SERVICE_ACCOUNT` | API `/api/janaka/*` (JSON service account, satu baris) | tidak |

> **`PTSP_API_KEY` wajib tanpa prefix `VITE_`.** Nilai berawalan `VITE_`
> ikut ter-render ke bundle browser — key PTSP tidak boleh bocor ke klien.
> Nilai `VITE_*` hanya dibaca saat **build**, jadi kalau lupa, tabel di atas
> tetap perlu diisi ulang tiap kali menambah env var baru.

#### Verifikasi setelah deploy

Jalankan dari repo ini:

```
npm run cek:vercel -- janakagakda.vercel.app
```

Alat itu menguji `/api/health`, `/api/reklame-items`, `/sw.js`, dan
`/dashboard`, lalu mencetak kesimpulan. Kalau function hidup, `/api/health`
melaporkan konfigurasi runtime (tanpa kredensial di respons):

```json
{
  "ok": true,
  "ptsp": {
    "baseUrl": "https://sprinter.ponorogo.go.id",
    "apiKey": { "ada": true, "panjang": 64, "sumber": "PTSP_API_KEY" },
    "jangkauan": { "ok": true, "status": 200, "total": 380 }
  },
  "firebaseAdmin": { "siap": true, "alasan": "" },
  "petunjuk": "PTSP siap."
}
```

| Gejala | Penyebab & perbaikan |
| --- | --- |
| `/api/reklame-items` JSON berisi `data` | Beres — proxy jalan. |
| JSON tapi `apiKey.ada: false` | `PTSP_API_KEY` belum diset → isi, lalu redeploy. |
| JSON dengan `status: 401` dari PTSP | Key ditolak PTSP → rotasi key. |
| `/api/health` HTML, tapi `/api/reklame-items` JSON | Beres — jaring pengaman yang bekerja, function belum ter-deploy. `npm run cek:vercel` akan mengatakannya. |
| Semua `/api/*` HTML | `PTSP_API_KEY` belum ter-deploy, atau build terakhir gagal (deployment lama masih hidup). |
| `/api/janaka/*` HTML | Function belum ter-deploy. Cek log build di dashboard Vercel. |
| `500 FUNCTION_INVOCATION_FAILED` + `ERR_MODULE_NOT_FOUND` | Impor relatif tanpa ekstensi `.js` — lihat catatan ESM di bawah. |

#### Catatan penting: ekstensi `.js` pada impor relatif

`api/` dan `server/` di-deploy ke Vercel sebagai **ESM native** (`"type": "module"`
di `package.json`). ESM **menolak** impor tanpa ekstensi, jadi setiap impor
relatif harus ditulis `"./ptspProxy.js"` — bukan `"./ptspProxy"`. TypeScript
tetap menunjuk ke sumber `.ts` lewat pemetaan ekstensi, jadi menulis `.js`
tetap benar dan `npm run dev` tidak ikut berubah.

Melewati aturan ini lolos saat build lalu meledak saat runtime:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/var/task/server/vercelHandler'
  imported from /var/task/api/index.js
```

Karena itu `tsconfig.node.json` memakai `moduleResolution: "nodenext"` — kalau
kembali ke `"bundler"`, error ini bisa muncul lagi tanpa build protes.
Pemeriksaan kontrak juga menegakkan setiap impor relatif punya ekstensi.

`npm run build` dan `npm run test:dasar` memeriksa kode lokal, tetapi tidak
dapat memverifikasi environment variable atau layanan eksternal yang
tersimpan di Project Settings Vercel — untuk itu memang ada `cek:vercel`.

Bila memakai **Firebase Hosting**, API harus dijalankan sebagai Cloud Function
karena service account tidak boleh ada di dalam kontainer statis:

- `janaka-admin-api` untuk `/api/janaka/{aksi}` (lihat rewrite di `firebase.json`),
- `janaka-pts-proxy` untuk `/api/reklame-items` dan `/v1/**`.

---

## 3. Model keamanan

Dua lapis, meniru pola proyek prabawa:

**Lapis 1 — Server (`/api/janaka/*`)**
Setiap permintaan diverifikasi dengan `auth.verifyIdToken()` (ID token yang
ditandatangani Google). Role dan izin **dibaca ulang dari Firestore di sisi
server** — nilai apa pun yang dikirim browser tidak pernah dipakai untuk
granting akses. Semua operasi حسus (`akun:buat`, `akun:ubah`, `akun:hapus`,
`password:ganti`) ditolak dengan 403 bila role bukan `admin`.

**Lapis 2 — Firestore Security Rules**
Menegakkan izin per menu untuk akses langsung ke Firestore, sehingga aturan
tetap berlaku meski sesi perambanDimodifikasi.

**Penjaga integrator di server**
- Admin tidak dapat menghapus, menurunkan peran, atau menonaktifkan akunnya sendiri.
- Minimal satu administrator aktif harus tersisa.
- Menonaktifkan akun juga mencabut refresh token-nya (`revokeRefreshTokens`).

### Peran

Hanya dua: `admin` dan `user`. Administrator tidak dibatasi; akun `user`
menerima izin per menu yang ditetapkan admin.

| Kunci izin | Label |
| --- | --- |
| `menuDashboard` | Dashboard *(wajib)* |
| `menuMapping` | Pemetaan Reklame |
| `menuReklame` | Data Reklame |
| `menuLaporan` | Laporan Lapangan |
| `menuRiwayat` | Riwayat Penindakan |
| `aksiTambahTitik` | Tambah Titik Tidak Berizin |
| `aksiHapusLaporan` | Hapus Laporan |
| `aksiCetakRekap` | Cetak Rekapitulasi |
| `aksiLihatDashboard` | Lihat Statistik Dashboard |
| `aksiUbahPassword` | Ubah Password *(wajib)* |
| `aksiKelolaPengguna` | Kelola Pengguna *(khusus admin)* |

---

## 4. Struktur

```
src/
  components/ui/       ── Kit kontrol (SEMUA komponen sendiri) ──
    primitives.tsx     PageHeader, Card, StatTile, ActionButton, Field, Input,
                       InputWithIcon, PasswordField, Checkbox, Switch, Tabs,
                       Badge, Alert, EmptyState, Skeleton*, DataTable,
                       Pagination, Spinner, FullLoader
    Modal.tsx          Modal + ConfirmDialog (portal, kunci gulir berhitung)
    Dropdown.tsx       Listbox — pengganti `<select>` bawaan browser
    DatePicker.tsx     Kalender penuh — pengganti `<input type="date">`
    menuLayang.ts      useMenuLayang: posisi menu portal + anti- clipping
    AksiMenu.tsx       Menu "⋯" baris tabel & tombol menu
    AkunDropdown.tsx   Menu akun di Topbar
    Toast.tsx          Notifikasi sendiri (pengganti sonner)
  components/common/   Sisanya: banner status & ErrorBoundary
  components/layout/   AppLayout (shell), Sidebar (collapse), Topbar,
                       RouteGuards, JanakaLogo
  context/             AuthContext  (sesi, peran, izin)
  hooks/               useReklamaStore, useLaporan, useDebounce, useGeolocation
  lib/access.ts        kontrak izin, peran, validasi
  lib/cn.ts            penyusun nama kelas
  lib/firebase/        konfigurasi + pembungkus Firestore & Auth
  lib/cloudinary/      unggah foto dokumentasi
  lib/pdf/             Berita Acara & rekapitulasi PDF
  pages/               Dashboard, ReklameList, DetailReklame, Mapping,
                       Execution, RiwayatPenutusan, Login, Pengaturan,
                       ManajemenPengguna
  routes/              definisi rute + guard
  services/            ptspservice, laporanService, adminApi
  utils/               normalizer PTSP, format, helper
server/
  janakaAdminApi.ts    API manajemen akun (Firebase Admin SDK)
  index.ts             server produksi: dist/ + API
tools/                 perkakas pengecekan (semua .mts, jalan via tsx)
  cek-deadcode.mts     ekspor tak terpakai + berkas yatim
  cek-kontrak.mts      izin browser vs server, rute, service worker
  cek-tata-letak.mts   konsistensi jarak antar menu
  cek-koneksi.mts      .env + jemput PTSP/Firebase/Cloudinary
  cek-kuota.mts        batas ukuran bundel
  legacy/              skrip uji lama (integration, quality, api, smoke)
```

> Hanya **tiga** berkas yang tetap `.js`, dan ketiganya wajib begitu:
> `tailwind.config.js` dan `postcss.config.js` (v3/PostCSS hanya memuat `.js`)
> serta `src/pwa/sw-template.js` (service worker harus JavaScript polos —
> dibaca peramban apa adanya, tanpa proses build). Ketiganya sudah diberi
> `// @ts-check` supaya tetap ikut diperiksa TypeScript.

### Prinsip UI

**Tidak ada satu pun kontrol bawaan sistem.** Tidak ada `<select>`, tidak ada
`window.confirm`/`alert`/`prompt`, tidak ada spinner OS, tidak ada pustaka toast
pihak ketiga. Semuanya komponen di `src/components/ui/`, karena ketiganya tidak
bisa diberi gaya, tampilannya berbeda tiap OS, dan memblokir input yang sama.

Shell aplikasi (`AppLayout`) mengikuti pola prabawa persis:

- Akar `h-[100svh] overflow-hidden`; dokumen dikunci, kolom konten jadi
  **satu-satunya** area scroll (`html.janaka-shell`).
- Sidebar adalah **saudara** kolom konten, bukan overlay dengan padding manual —
  lebarnya dianimasikan dan konten langsung ikut resized karena `flex-1 min-w-0`.
- Lebar sidebar **256px → 84px**, tombol ciut melayang di tepi (`top-[84px]
  -right-3.5`), preferensi disimpan di `localStorage`.
- Overlay mobile tanpa `blur`: `filter: blur()` pada subtree besar memaksa
  browser menyalin & mengaburkan seluruh halaman di setiap frame.
- Modal dianimasikan dengan keyframe CSS (compositor-only), bukan `motion`;
  `scale` dihindari karena memicu hitung ulang isi panel tiap frame.

`DataTable` mengukur **min-content tabel sendiri** lewat klon tersembunyi lalu
membandingkannya dengan lebar wadah. Kalau tidak muat, tabel otomatis berubah
menjadi **kartu** — jadi di layar sempit tidak ada tabel yang perlu digulir
horizontal. Angka min-content tiap tabel berbeda jauh, jadi breakpoint tetap
tidak bisa ditebak.

---

## 5. Pengujian

```bash
npm run dev          # terminal 1
npm test             # terminal 2
```

---

## 6. Catatan operasional

- **`localhost:5173`, bukan 5174.** Port 5174 dipakai bila 5173 sedang sibuk;
  beberapa browser menyimpan tab lama di sana yang membuat proxy PTSP gagal.
  Gunakan hard refresh (`Ctrl+Shift+R`).
- Firestore Rules harus di-deploy agar `laporan_penindakan` dan `titik_janaka`
  dapat ditulis. Sebelum itu, aplikasi tetap menampilkan data PTSP dengan banner
  informatif.
- Admin tidak dapat menghapus atau menurunkan peran akunnya sendiri, dan minimal
  satu administrator aktif selalu tersisa.
- Mengganti email oleh admin **tidak** memverifikasi alamat baru secara otomatis —
  pengguna baru akan diminta verifikasi saat masuk.
