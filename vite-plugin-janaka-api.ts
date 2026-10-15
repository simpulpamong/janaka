import type { Plugin, ViteDevServer, PreviewServer } from "vite"
// Sudah TypeScript — `@ts-expect-error` yang dulu dipakai untuk membungkam
// "modul .mjs tidak bertipe" sudah tidak diperlukan dan HARUS dihapus:
// kalau dibiarkan, TypeScript diam-diam membiarkan berkas ini rusak total
// (ekspetasi yang tidak terpenuhi = error baru).
/*
 * `.js` wajib di impor relatif: modul ini ikut ter-bundle ke function
 * Vercel dan dijalankan sebagai ESM, yang menolak impor tanpa ekstensi.
 * TypeScript tetap menunjuk ke `server/janakaAdminApi.ts`.
 */
import { createJanakaAdminApi } from "./server/janakaAdminApi.js"

type Middleware = (
  req: never,
  res: never,
  next: (err?: unknown) => void,
) => unknown | Promise<unknown>

/**
 * Menyuntikkan API manajemen akun (`/api/janaka/*`) ke Vite dev & preview
 * server. Middleware dipasang lebih dulu — sebelum proxy PTSP — sehingga
 * `/api/reklame-items` tetap diteruskan ke PTSP, sedangkan `/api/janaka/*`
 * ditangani di sini oleh proses Node (diperlukan karena operasi
 * create/update/delete user hanya bisa lewat Firebase Admin SDK).
 */
function janakaAdminApiPlugin(): Plugin {
  const attach = (server: ViteDevServer | PreviewServer) => {
    const api = createJanakaAdminApi() as Middleware
    const stack = server.middlewares as unknown as {
      use: (fn: (req: unknown, res: unknown, next: () => void) => void) => void
    }

    stack.use((req, res, next) => {
      const url = (req as { url?: string }).url ?? ""
      if (!url.startsWith("/api/janaka")) return next()
      return api(req as never, res as never, next as never)
    })
  }

  return {
    name: "janaka:admin-api",
    configureServer: attach,
    configurePreviewServer: attach,
  }
}

export default janakaAdminApiPlugin