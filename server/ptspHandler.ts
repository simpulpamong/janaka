/**
 * Handler function Vercel untuk **rute PTSP saja**.
 *
 * Sengaja dipisah dari `api/janaka.ts` supaya function ini tidak pernah
 * menarik `firebase-admin` — paket itu bring ~15 MB (source map-nya saja 7 MB)
 * dan membuat tiap cold start berat. Rute PTSP adalah yang paling sering
 * dipanggil, jadi ia harus yang paling ringan.
 *
 * Rute yang ditangani:
 *   /api/health → diagnostik konfigurasi (tanpa kredensial di respons)
 *   /api/*      → proxy server-side ke PTSP (reklame, dsb.)
 *   /v1/*       → proxy file SK/dokumen PTSP
 */

import type { IncomingMessage, ServerResponse } from "node:http"
import { balasGagal, healthPtsp, proxyPtsp } from "./ptspProxy.js"

export default async function handlerPtsp(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  let url: URL
  try {
    url = new URL(req.url ?? "/", `https://${req.headers.host ?? "janaka.invalid"}`)
  } catch {
    return balasGagal(res, 400, "URL permintaan tidak valid.")
  }
  const path = url.pathname

  if (path === "/api/health") {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.setHeader("Allow", "GET, HEAD")
      return balasGagal(res, 405, "Method tidak diizinkan.")
    }
    return healthPtsp(res)
  }

  if (path === "/api" || path.startsWith("/api/")) {
    return proxyPtsp(req, res, path, url.search)
  }

  if (path === "/v1" || path.startsWith("/v1/")) {
    return proxyPtsp(req, res, path, url.search)
  }

  return balasGagal(res, 404, "Rute API tidak ditemukan.")
}
