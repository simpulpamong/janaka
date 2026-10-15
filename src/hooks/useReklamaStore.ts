import { create } from "zustand"
import {
  getAllReklameItems,
  getReklameItems,
  type ApiMeta,
  type PTSPListParams,
} from "@/services/ptspservice"
import { normalizeReklameList } from "@/utils/reklame"
import type { ReklameItem } from "@/utils/reklame"

const STORAGE_KEY = "janaka-reklame-cache"
const EMPTY_META: ApiMeta = { page: 1, per_page: 100, total: 0, last_page: 1 }

interface CacheEnvelope {
  savedAt: number
  items: ReklameItem[]
}

export interface ReklamaState {
  reklameList: ReklameItem[]
  loading: boolean
  /** 0–100; hanya relevan saat `loading` true. */
  progress: number
  error: string | null
  /** true bila data berasal dari cache karena API gagal. */
  stale: boolean
  meta: ApiMeta
  lastLoadedAt: number | null
  loadReklamaList: (params?: PTSPListParams, force?: boolean) => Promise<void>
  refreshReklamaList: () => Promise<void>
  clearCache: () => void
}

/* ─────────────────────  Cache lokal (localStorage)  ───────────────────── */

function readCache(): CacheEnvelope | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CacheEnvelope
    if (!parsed || !Array.isArray(parsed.items)) return null
    return parsed
  } catch {
    return null
  }
}

function writeCache(items: ReklameItem[]): void {
  if (typeof window === "undefined") return
  try {
    const envelope: CacheEnvelope = { savedAt: Date.now(), items }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope))
  } catch {
    /* abaikan quota exceeded */
  }
}

/* Inisialisasi awal langsung dari cache lokal agar halaman tampil instan tanpa loading kosong */
const initialCache = readCache()

/* ─────────────────────  Store  ───────────────────── */

export const useReklamaStore = create<ReklamaState>((set, get) => ({
  reklameList: initialCache?.items ?? [],
  loading: false,
  progress: 0,
  error: null,
  stale: false,
  meta: initialCache
    ? { ...EMPTY_META, total: initialCache.items.length }
    : EMPTY_META,
  lastLoadedAt: initialCache?.savedAt ?? null,

  loadReklamaList: async (params, force = false) => {
    // Cegah permintaan bersamaan yang saling menimpa.
    if (get().loading) return

    const currentList = get().reklameList
    const isFiltered = Boolean(params && Object.values(params).some(Boolean))

    /*
     * Bila sudah ada cache lokal dan bukan pemanggilan 'force' atau parameter filter:
     * Lakukan pengecekan ringan (1 item) ke PTSP. Bila total & item teratas tidak berubah,
     * tidak perlu mengunduh ulang seluruh halaman PTSP.
     */
    if (!force && !isFiltered && currentList.length > 0) {
      const now = Date.now()
      const last = get().lastLoadedAt ?? 0

      // Jika belum lewat 60 detik dari pengecekan terakhir, skip untuk hemat bandwidth
      if (now - last < 60_000) {
        return
      }

      // Probe ringan juga harus tampak sebagai aktivitas, tetapi memakai
      // cache yang ada sampai server memastikan datanya berubah.
      set({ loading: true, progress: 5, error: null, stale: false })

      try {
        const check = await getReklameItems({ page: 1, per_page: 1 })
        const totalBaru = check.meta.total
        const idTeratas = check.items[0]?.id
        const idTeratasSekarang = currentList[0]?.id

        // Bila total dan item teratas sama persis, data PTSP masih identik!
        if (totalBaru === currentList.length && idTeratas === idTeratasSekarang) {
          set({ loading: false, progress: 0, lastLoadedAt: now, stale: false, error: null })
          return
        }
      } catch (checkErr) {
        console.warn("[useReklamaStore] Pengecekan sinkronisasi PTSP gagal, memakai cache:", checkErr)
        set({
          loading: false,
          progress: 0,
          stale: true,
          error: "Pengecekan pembaruan PTSP gagal. Data cache tetap ditampilkan.",
        })
        return
      }
    }

    set({ loading: true, error: null, progress: 10, stale: false })

    try {
      const { items, meta } = await getAllReklameItems(params, (loaded, total) => {
        const pct = total > 0 ? Math.min(98, Math.round((loaded / total) * 100)) : 50
        set({ progress: pct })
      })

      const normalized = normalizeReklameList(items)
      writeCache(normalized)

      set({
        reklameList: normalized,
        meta,
        loading: false,
        progress: 100,
        stale: false,
        error: null,
        lastLoadedAt: Date.now(),
      })
    } catch (err) {
      console.error("[useReklamaStore] Gagal memuat data reklame:", err)

      const cache = readCache()
      const fallbackItems = cache?.items ?? currentList
      const detailError = err instanceof Error ? err.message : ""
      const pesanGagal = detailError || "Periksa koneksi jaringan dan konfigurasi PTSP_API_KEY."

      set({
        reklameList: fallbackItems,
        meta: fallbackItems.length > 0
          ? { ...EMPTY_META, total: fallbackItems.length }
          : EMPTY_META,
        loading: false,
        progress: 0,
        stale: true,
        lastLoadedAt: cache?.savedAt ?? get().lastLoadedAt,
        error: fallbackItems.length > 0
          ? `${pesanGagal} Data cache lokal tetap ditampilkan.`
          : `Gagal memuat data dari PTSP. ${pesanGagal}`,
      })
    }
  },

  refreshReklamaList: async () => {
    await get().loadReklamaList(undefined, true)
  },

  clearCache: () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEY)
    }
    set({ reklameList: [], meta: EMPTY_META, lastLoadedAt: null, stale: false })
  },
}))
