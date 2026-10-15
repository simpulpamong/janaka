import { useCallback, useEffect, useMemo, useState } from "react"
import {
  collectExecutedIds,
  countLaporanPerReklame,
  subscribeLaporan,
  subscribeTitikJanaka,
  type LaporanInput,
  createLaporan,
  createTitikJanaka,
  deleteLaporan,
  deleteTitikJanaka,
  markTitikDieksekusi,
  type TitikJanakaInput,
  bacaCacheLaporan,
  bacaCacheTitik,
} from "@/services/laporanService"
import type { LaporanPenindakan, TitikJanaka } from "@/types"

/* ══════════════════════════════════════════════════════════════════
 *  useLaporan — realtime listener seluruh laporan penindakan
 * ══════════════════════════════════════════════════════════════════ */

export interface UseLaporanResult {
  laporan: LaporanPenindakan[]
  loading: boolean
  error: string | null
  /** ID reklame yang sudah pernah ditindak */
  executedIds: Set<string>
  /** Jumlah laporan per reklame */
  laporanCount: Map<string, number>
  reload: () => void
  /** Simpan laporan baru. Mengembalikan ID dokumen. */
  simpan: (input: LaporanInput) => Promise<string>
  hapus: (id: string) => Promise<void>
}

export function useLaporan(): UseLaporanResult {
  /*
   * State awal dari cache lokal, bukan `[]`.
   *
   * Listener Firestore butuh waktu sebelum snapshot pertama datang. Dengan
   * cache, halaman sudah menampilkan laporan terakhir yang diketahui pada
   * render pertama — tabel tidak pernah tampil kosong padahal data ada.
   * Anggap saja ini "offline-first" yang sama seperti data PTSP.
   */
  const [laporan, setLaporan] = useState<LaporanPenindakan[]>(
    () => bacaCacheLaporan() ?? [],
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    const unsub = subscribeLaporan(
      (data) => {
        if (cancelled) return
        setLaporan(data)
        setLoading(false)
        setError(null)
      },
      (err) => {
        if (cancelled) return
        /*
         * Listener gagal (aturan keamanan / koneksi). Jangan kosongkan
         * tabel: data lama tetap lebih berguna daripada layar kosong, dan
         * pesan galatnya sudah menjelaskan situasinya.
         */
        setError(err.message)
        setLoading(false)
      },
    )

    return () => {
      cancelled = true
      unsub()
    }
  }, [nonce])

  const executedIds = useMemo(() => collectExecutedIds(laporan), [laporan])
  const laporanCount = useMemo(() => countLaporanPerReklame(laporan), [laporan])

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  const simpan = useCallback(async (input: LaporanInput) => {
    const id = await createLaporan(input)
    if (input.dariJANAKA && input.reklameId) {
      await markTitikDieksekusi(input.reklameId, id).catch((err) => {
        console.warn("[useLaporan] Gagal menandai titik JANAKA:", err)
      })
    }
    return id
  }, [])

  const hapus = useCallback(async (id: string) => {
    await deleteLaporan(id)
  }, [])

  return { laporan, loading, error, executedIds, laporanCount, reload, simpan, hapus }
}

/* ══════════════════════════════════════════════════════════════════
 *  useTitikJanaka — realtime listener titik reklame tanpa izin
 * ══════════════════════════════════════════════════════════════════ */

export interface UseTitikJanakaResult {
  titik: TitikJanaka[]
  loading: boolean
  error: string | null
  reload: () => void
  tambah: (input: TitikJanakaInput) => Promise<string>
  hapus: (id: string) => Promise<void>
}

export function useTitikJanaka(): UseTitikJanakaResult {
  /* Sama seperti `useLaporan`: mulai dari cache lokal supaya kisi foto dan
     daftar titik di Data Reklame langsung terisi, tidak menunggu snapshot. */
  const [titik, setTitik] = useState<TitikJanaka[]>(
    () => bacaCacheTitik() ?? [],
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    const unsub = subscribeTitikJanaka(
      (data) => {
        if (cancelled) return
        setTitik(data)
        setLoading(false)
        setError(null)
      },
      (err) => {
        if (cancelled) return
        setError(err.message)
        setLoading(false)
      },
    )

    return () => {
      cancelled = true
      unsub()
    }
  }, [nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  const tambah = useCallback(async (input: TitikJanakaInput) => {
    return createTitikJanaka(input)
  }, [])

  const hapus = useCallback(async (id: string) => {
    await deleteTitikJanaka(id)
  }, [])

  return { titik, loading, error, reload, tambah, hapus }
}