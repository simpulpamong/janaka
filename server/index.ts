/**
 * Server produksi JANAKA.
 *
 *   npm run build && npm start
 *
 * Menyajikan berkas statis dari `dist/`, API manajemen akun di
 * `/api/janaka/*`, dan proxy server-side ke PTSP di `/api/*` + `/v1/*` —
 * payout yang sama seperti Vercel, karena keduanya memakai modul yang sama
 * (`server/ptspHandler.ts` & `server/janakaHandler.ts`). Tidak ada
 * dependensi web tambahan — cukup `node:http`.
 *
 * Jalan lokal lewat `tsx` (`npm start`). Vercel memakai handler serverless
 * di `api/[...path].ts`; jangan memanggil `listen()` dari function Vercel.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { createReadStream, existsSync, statSync } from "node:fs"
import { extname, join, normalize, resolve } from "node:path"
import { fileURLToPath } from "node:url"
/*
 * `.js` wajib di impor relatif: `server/` jalan sebagai ESM, dan ESM
 * menolak impor tanpa ekstensi. TypeScript tetap menunjuk ke `.ts`.
 *
 * Entry point `api/ptsp.ts` & `api/janaka.ts` di Vercel memakai handler
 * yang sama persis — jadi `npm start` dan Vercel tidak bisa berbeda perilakunya.
 */
import { createJanakaAdminApi } from "./janakaAdminApi.js"
import ptsp from "./ptspHandler.js"

const ROOT = resolve(fileURLToPath(new URL("../dist", import.meta.url)))
const PORT = Number(process.env.PORT || 5173)
const HOST = process.env.HOST || "0.0.0.0"

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
}

const api = createJanakaAdminApi()

/**
 * Header keamanan standar.
 *
 * Diperlukan karena:
 * - X-Content-Type-Options: nosniff  → MIME sniffing (XSS via file upload)
 * - X-Frame-Options: SAMEORIGIN     → clickjacking
 * - Referrer-Policy                 → privasi, tidak bocorkan URL ke external
 * - Permissions-Policy              → batas akses kamera/GPS (hanya self)
 * - Cross-Origin-Opener-Policy      → isolasi konteks, mengurangi Spectre
 * - HSTS                            → paksa HTTPS, cegah downgrade/MITM
 * - X-Permitted-Cross-Domain-Policies → blokir kebijakan Flash/Acrobat
 * - Cross-Origin-Resource-Policy    → batas pemakai gambar/berkas lintas origin
 *
 * CSP sengaja tidak dipasang: aplikasi memuat Firebase, Cloudinary, Leaflet,
 * Google Maps, PDF.js, dan font Google — CSP yang ketat akan memutus fitur,
 * dan CSP pelonggaran hanya memberikan ilusi keamanan. Header di atas tidak
 * memutus apa pun, tapi tetap menutup celah yang paling sering dipakai.
 */
function pasangHeaderKeamanan(res: ServerResponse, aman = false): void {
  res.setHeader("X-Content-Type-Options", "nosniff")
  res.setHeader("X-Frame-Options", "SAMEORIGIN")
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin")
  res.setHeader(
    "Permissions-Policy",
    "geolocation=(self), camera=(self), microphone=()",
  )
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups")
  res.setHeader("X-Permitted-Cross-Domain-Policies", "none")
  res.setHeader("Cross-Origin-Resource-Policy", "same-site")

  /*
   * HSTS hanya boleh dikirim lewat HTTPS.
   *
   * Mengirimnya di http:// akan membuat browser mengabaikannya, dan di
   * lokal tanpa TLS header ini cuma sampah. Karena itu dibungkus
   * pemeriksaan koneksi terenkripsi.
   */
  if (aman) {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload",
    )
  }
}

function kirimFile(res: ServerResponse, filepath: string, aman = false): void {
  pasangHeaderKeamanan(res, aman)
  res.statusCode = 200
  res.setHeader("Content-Type", MIME[extname(filepath)] ?? "application/octet-stream")
  res.setHeader(
    "Cache-Control",
    /*
     * Aset bertanggal di namanya (Vite menambahkan hash), jadi aman
     * disimpan setahun. Berkas lain — terutama index.html — harus selalu
     * diperiksa ulang, kalau tidak pengguna yang kembali ke situs akan
     * memuat shell lama yang menunjuk aset yang sudah tidak ada.
     */
    filepath.includes("/assets/") ? "public, max-age=31536000, immutable" : "no-cache",
  )
  createReadStream(filepath).pipe(res)
}

const server = createServer((req, res) => {
  /* Koneksi terenkripsi? `req.socket.encrypted` hanya diis TLS langsung.
     Di belakang proxy (Vercel/Nginx) tandanya lewat header. */
  const aman = Boolean(
    (req.socket as { encrypted?: boolean }).encrypted ||
      String(req.headers["x-forwarded-proto"] ?? "").split(",")[0]?.trim() === "https",
  )

  void (async () => {
    await api(req, res, () => {
      pasangHeaderKeamanan(res, aman)
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`)

      /*
       * Rute API harus dicek SEBELUM berkas statis. Tanpa ini,
       * `/api/reklame-items` tidak ada di `dist/`, jatuh ke fallback SPA,
       * dan browser menerima `index.html` alih-alih JSON reklame.
       */
      if (url.pathname === "/api" || url.pathname.startsWith("/api/") || url.pathname.startsWith("/v1/")) {
        return void ptsp(req, res)
      }

      // Cegah path traversal: `normalize` dulu, lalu pastikan masih di bawah ROOT.
      const relatif = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "")
      let filepath = join(ROOT, relatif)

      if (!filepath.startsWith(ROOT)) {
        res.statusCode = 403
        res.end("Forbidden")
        return
      }

      if (existsSync(filepath) && statSync(filepath).isDirectory()) {
        filepath = join(filepath, "index.html")
      }

      // SPA fallback → index.html
      if (!existsSync(filepath)) filepath = join(ROOT, "index.html")

      if (!existsSync(filepath)) {
        res.statusCode = 500
        res.end("Folder dist/ belum ada. Jalankan `npm run build` lebih dahulu.")
        return
      }

      kirimFile(res, filepath, aman)
    })
  })()
})

server.listen(PORT, HOST, () => {
  console.log(`\n  JANAKA siap di http://localhost:${PORT}`)
  console.log(`  API manajemen akun: /api/janaka/*\n`)
})