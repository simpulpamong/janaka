/**
 * Service untuk Format Dokumen (BA & Rekap).
 * Komunikasi dengan endpoint `/api/janaka/*` actions.
 */

import { auth } from "@/lib/firebase"
import { ambilProfilServer } from "./adminApi"
import {
  type FormatDokumen,
  type FormatDokumenFirestore,
  validasiFormatDokumen,
  tulisFormatDokumenCache,
  bacaFormatDokumenCache,
  gabungDenganDefault,
  DEFAULT_FORMAT_DOKUMEN,
} from "@/lib/formatDokumen"

/** Respons API standar. */
interface ApiResult {
  ok: boolean
  data?: FormatDokumenFirestore | null
  pesan?: string
  kode?: number
}

/** Fungsi helper untuk memanggil API actions. */
async function panggilAksi(aksi: string, body?: Record<string, unknown>): Promise<ApiResult> {
  const user = auth.currentUser
  if (!user) throw new Error("Pengguna tidak terautentikasi.")
  const token = await user.getIdToken()

  const res = await fetch("/api/janaka/" + aksi, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body ?? {}),
  })

  return (await res.json()) as ApiResult
}

/** Konversi Timestamp Firestore (atau string) menjadi string. */
function konversiUpdatedAt(value: unknown): string {
  if (typeof value === "string") return value
  if (value && typeof value === "object" && "toDate" in value) {
    return (value as { toDate: () => Date }).toDate().toISOString()
  }
  return ""
}

/** Mengambil konfigurasi format dokumen dari server. */
export async function ambilFormatDokumen(): Promise<FormatDokumen> {
  try {
    const result = await panggilAksi("format-dokumen:ambil")

    if (!result.ok) throw new Error(result.pesan ?? "Gagal memuat format dokumen.")
    if (!result.data) {
      return bacaFormatDokumenCache() ?? DEFAULT_FORMAT_DOKUMEN
    }

    /*
     * `gabungDenganDefault` penting: data di Firestore bisa berasal dari
     * versi aplikasi yang field-nya masih lama. Tanpa penggabungan,
     * `cfg.kop.posisiLogo` bisa `undefined` dan dokumen jadi tanpa logo
     * tanpa penjelasan.
     */
    const cfg = gabungDenganDefault({
      ...result.data,
      updatedAt: konversiUpdatedAt(result.data.updatedAt),
    })
    tulisFormatDokumenCache(cfg)
    return cfg
  } catch (err) {
    console.warn("[formatDokumenService] Gagal memuat dari server, pakai default/cache:", err)
    return bacaFormatDokumenCache() ?? DEFAULT_FORMAT_DOKUMEN
  }
}

/** Menyimpan konfigurasi format dokumen ke server. */
export async function simpanFormatDokumen(cfg: Partial<FormatDokumen>): Promise<FormatDokumen> {
  const errValidasi = validasiFormatDokumen(cfg)
  if (errValidasi.length > 0) {
    throw new Error(errValidasi.join("\n"))
  }

  const profil = await ambilProfilServer()
  const updatedBy = profil.data?.uid ?? "unknown"

  const payload = {
    ...cfg,
    updatedAt: new Date().toISOString(),
    updatedBy,
  }

  const result = await panggilAksi("format-dokumen:simpan", payload as Record<string, unknown>)
  if (!result.ok) throw new Error(result.pesan ?? "Gagal menyimpan format dokumen.")

  // Update cache lokal.
  const cfgBaru = gabungDenganDefault({
    ...cfg,
    updatedAt: new Date().toISOString(),
    updatedBy,
  })
  tulisFormatDokumenCache(cfgBaru)

  return cfgBaru
}
