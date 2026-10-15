/**
 * Handler function Vercel untuk **manajemen akun** (`/api/janaka/*`).
 *
 * Dipisah dari `api/ptsp.ts` karena hanya rute ini yang butuh
 * `firebase-admin`. Kalau keduanya digabung, function PTSP ikut membawa
 * ~15 MB SDK dan tiap cold start terasa berat.
 *
 * ── Kenapa modul di-import dinamis ─────────────────────────────────
 * `janakaAdminApi.ts` menarik `firebase-admin`. Impor dinamis membuat
 * kegagalan memuat modul (kredensial, paket, versi Node) tidak menjatuhkan
 * proses — dan `statusServer()` tetap bisa melaporkan penyebabnya lewat
 * `/api/health` tanpa melempar.
 * ──────────────────────────────────────────────────────────────────
 */

import type { IncomingMessage, ServerResponse } from "node:http"
import { balasGagal } from "./ptspProxy.js"

const PREFIX_JANAKA = "/api/janaka"

type HandlerJanaka = (
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
) => void | Promise<void>

/** Dimuat sekali, lalu dipakai seterusnya (serverless = satu proses). */
let janakaSiap: Promise<HandlerJanaka> | null = null

function apiJanaka(): Promise<HandlerJanaka> {
  janakaSiap ??= import("./janakaAdminApi.js").then((m) => m.createJanakaAdminApi())
  return janakaSiap
}

export default async function handlerJanaka(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const path = (req.url ?? "/").split("?")[0]

  if (path !== PREFIX_JANAKA && !path.startsWith(`${PREFIX_JANAKA}/`)) {
    return balasGagal(res, 404, "Rute API tidak ditemukan.")
  }

  try {
    const janaka = await apiJanaka()
    return await janaka(req, res, () => balasGagal(res, 404, "Rute API tidak ditemukan."))
  } catch (err) {
    console.error("[janaka-api] modul gagal dimuat", err)
    return balasGagal(
      res,
      503,
      `API manajemen akun gagal dimuat: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}
