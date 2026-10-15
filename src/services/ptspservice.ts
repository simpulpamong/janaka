import axios, { type AxiosInstance } from "axios"

/* ─────────────────────  Konfigurasi  ─────────────────────
 *
 * PENTING: base URL memakai path relatif (`/api`) sehingga request
 * diarahkan ke proxy Vite, bukan langsung ke sprinter.ponorogo.go.id.
 *
 * Server PTSP tidak mengirim header `Access-Control-Allow-Origin`.
 * Akibatnya, request langsung dari browser akan diblokir CORS dan
 * dashboard menampilkan angka 0. Proxy meneruskan request lewat
 * proses Node sehingga kebijakan CORS tidak berlaku, sekaligus
 * menyisipkan header `X-API-Key` di sisi server.
 *
 * Nilai ini dapat di-override lewat VITE_PTSP_BASE_URL bila aplikasi
 * dijalankan di belakang reverse proxy yang sudah menangani routing.
 * ───────────────────────────────────────────────────────────── */

const API_BASE_URL: string = import.meta.env.VITE_PTSP_API_PROXY_PATH || "/api"

const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
  },
  timeout: 20000,
})

/**
 * Ulangi request secara otomatis untuk kegagalan jaringan / server.
 *
 * Motivation: server PTSP kadang lambat merespons saat trafik tinggi.
 * Tanpa retry, satu request gagal langsung dianggap kosong sehingga
 * dashboard menampilkan angka 0 walau sebenarnya data ada.
 */
api.interceptors.response.use(
  (res) => res,
  async (error: unknown) => {
    if (!axios.isAxiosError(error)) return Promise.reject(error)

    const config = error.config as (typeof error.config & { __retry?: number }) | undefined
    const status = error.response?.status
    const retryable =
      error.code === "ERR_NETWORK" ||
      error.code === "ECONNABORTED" ||
      status === undefined ||
      status === 429 ||
      status === 502 ||
      status === 503 ||
      status === 504

    if (config && retryable && (config.__retry ?? 0) < 1) {
      config.__retry = (config.__retry ?? 0) + 1
      const waitMs = 600 * 2 ** (config.__retry - 1)
      console.warn(
        `[PTSP] Percobaan ke-${config.__retry} gagal (${status ?? error.code}). ` +
          `Mengulang dalam ${waitMs}ms…`,
      )
      await new Promise((r) => setTimeout(r, waitMs))
      return api.request(config)
    }

    const pesan =
      status === 401
        ? "Server PTSP menolak API key (HTTP 401). Periksa PTSP_API_KEY pada environment Production Vercel."
        : status === 403
          ? "Akses API PTSP ditolak (HTTP 403). Periksa izin key yang digunakan."
          : status === 503
            ? "Server tidak dikonfigurasi (HTTP 503). Buka /api/health untuk melihat env var yang kurang."
            : pesanDariBadan(error) ||
              (error.code === "ERR_NETWORK"
                ? "Tidak dapat menghubungi server PTSP. Pastikan dev server (npm run dev) masih berjalan."
                : error.message) ||
              "Gagal menghubungi server PTSP"

    return Promise.reject(new Error(pesan))
  },
)

/**
 * Pesan error dari respons server.
 *
 * Dua kasus yang perlu dibedakan, karena gejalanya sama-sama "dashboard
 * kosong" tapi sebabnya berlawanan:
 *
 *  • JSON  → message/pesan dari handler kita. Actionable.
 *  • HTML  → respons `index.html`, artinya request tidak pernah sampai ke
 *    function Vercel dan tertangkap rewrite SPA `/(.*)`. Ini murni
 *    masalah konfigurasi `vercel.json`, bukan PTSP.
 */
function pesanDariBadan(error: { response?: { data?: unknown } }): string {
  const data = error.response?.data
  if (data == null) return ""
  if (typeof data === "string") {
    return /^\s*<(!doctype|html)/i.test(data)
      ? "Rute /api/* tidak sampai ke server Vercel (dapat index.html, bukan JSON). " +
        "Periksa rewrite di vercel.json dan pastikan folder api/ ikut ter-deploy."
      : ""
  }
  const body = data as { message?: unknown; pesan?: unknown }
  const text = [body.message, body.pesan].find((v) => typeof v === "string" && v)
  return typeof text === "string" ? text : ""
}

/* ─────────────────────  Bentuk data dari API  ─────────────────────
 * Dihasilkan dari respons nyata:
 *   { status, message, meta: { page, per_page, total, last_page }, data }
 * ─────────────────────────────────────────────────────────────── */

export interface ApiFileSK {
  url: string
  tersedia: boolean
}

export interface ApiSK {
  id: string
  idreklame: string
  no_sk: string
  berlaku_mulai: string
  berlaku_sampai: string
  nm_perusahaan: string
  naskah_reklame: string
  status?: string
  file_sk?: ApiFileSK
}

export interface ApiSKBlock {
  ada_sk: boolean
  status: string
  sk_aktif: ApiSK | null
  sk_terakhir: ApiSK | null
}

export interface ApiReklameItem {
  id: string
  idreklame?: string
  alamat: string
  panjang: string
  lebar: string
  jumlah: string
  dlm_kota?: string
  kecamatan: string
  desa: string
  koordinat: string
  is_lahan_aset_pemkab?: string
  is_permanen: string
  is_aktif: string
  nama_jenis: string
  sk: ApiSKBlock
}

export interface ApiMeta {
  page: number
  per_page: number
  total: number
  last_page: number
}

interface ApiEnvelope<T> {
  status: string
  message: string
  meta?: ApiMeta
  data: T
}

export interface PTSPListParams {
  page?: number
  per_page?: number
  search?: string
  status?: string
  kecamatan?: string
}

/** Jumlah data dimuat per permintaan untuk statistik & peta. */
export const DEFAULT_PER_PAGE = 100

/* ─────────────────────  Endpoint  ───────────────────── */

/**
 * GET /api/reklame-items
 * Daftar item reklame + status SK (paginasi & filter).
 */
export async function getReklameItems(params?: PTSPListParams): Promise<{
  items: ApiReklameItem[]
  meta: ApiMeta
}> {
  const q: Record<string, string | number> = {}
  if (params?.page) q.page = params.page
  if (params?.per_page) q.per_page = params.per_page
  if (params?.search) q.search = params.search
  if (params?.status) q.status = params.status
  if (params?.kecamatan) q.kecamatan = params.kecamatan

  const { data } = await api.get<ApiEnvelope<ApiReklameItem[]>>("/reklame-items", {
    params: q,
  })

  return {
    items: Array.isArray(data?.data) ? data.data : [],
    meta: data?.meta ?? { page: 1, per_page: 10, total: 0, last_page: 1 },
  }
}

/**
 * GET /api/reklame-items
 * Ambil seluruh data dengan pagination bertahap, agar statistik
 *dan peta mencakup semua titik (bukan hanya halaman pertama).
 */
export async function getAllReklameItems(
  params?: Omit<PTSPListParams, "page" | "per_page">,
  onProgress?: (loaded: number, total: number) => void,
): Promise<{ items: ApiReklameItem[]; meta: ApiMeta }> {
  const first = await getReklameItems({ ...params, page: 1, per_page: DEFAULT_PER_PAGE })
  const total = first.meta.total || 0
  const lastPage = Math.max(1, first.meta.last_page || 1)

  onProgress?.(first.items.length, total)

  if (lastPage <= 1) return first

  const collected: ApiReklameItem[] = [...first.items]
  const maxConcurrent = 4

  for (let batchStart = 2; batchStart <= lastPage; batchStart += maxConcurrent) {
    const pages = Array.from(
      { length: Math.min(maxConcurrent, lastPage - batchStart + 1) },
      (_, i) => batchStart + i,
    )
    let loadedInBatch = 0

    const results = await Promise.allSettled(
      pages.map((p) =>
        getReklameItems({ ...params, page: p, per_page: DEFAULT_PER_PAGE }).then((result) => {
          loadedInBatch += result.items.length
          onProgress?.(collected.length + loadedInBatch, total)
          return result
        }),
      ),
    )

    let batchError: unknown
    for (const r of results) {
      if (r.status === "fulfilled") {
        collected.push(...r.value.items)
      } else {
        batchError ??= r.reason
      }
    }
    if (batchError) throw batchError
  }

  return { items: collected, meta: { ...first.meta, total: collected.length } }
}

/** Detail satu item + SK aktif + riwayat SK. */
export async function getReklameDetail(id: string): Promise<{
  item: ApiReklameItem
  riwayat: ApiSK[]
}> {
  const { data } = await api.get<ApiEnvelope<ApiReklameItem & { riwayat?: ApiSK[] }>>(
    `/reklame-items/${id}`,
  )
  const body = data?.data as (ApiReklameItem & { riwayat?: ApiSK[] }) | undefined
  return {
    item: (body ?? {}) as ApiReklameItem,
    riwayat: Array.isArray(body?.riwayat) ? body.riwayat : [],
  }
}

/** Status & riwayat SK saja. */
export async function getReklameSK(id: string): Promise<{
  itemId: number
  sk: ApiSKBlock
  riwayat: ApiSK[]
}> {
  const { data } = await api.get<
    ApiEnvelope<{ item_id: number; sk: ApiSKBlock; riwayat?: ApiSK[] }>
  >(`/reklame-items/${id}/sk`)

  const body = data?.data
  return {
    itemId: Number(body?.item_id) || Number(id),
    sk:
      body?.sk ??
      ({
        ada_sk: false,
        status: "tidak_ada",
        sk_aktif: null,
        sk_terakhir: null,
      } as ApiSKBlock),
    riwayat: Array.isArray(body?.riwayat) ? body.riwayat : [],
  }
}
