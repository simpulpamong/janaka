/**
 * Proxy server-side ke PTSP (sprinter.ponorogo.go.id).
 *
 * Dipakai oleh **dua** runtime supaya perilakunya identik:
 *  • `api/[...path].ts`   → serverless function di Vercel
 *  • `server/index.ts`    → `npm start` (build + satu proses Node)
 *
 * ## Kenapa harus proxy
 * Server PTSP tidak mengirim header `Access-Control-Allow-Origin`, jadi
 * request langsung dari browser diblokir CORS dan dashboard menampilkan 0.
 * Proxy meneruskan lewat proses Node, sekaligus menyisipkan `X-API-Key`
 * di sisi server sehingga key tidak pernah masuk bundle browser.
 */

import type { IncomingMessage, ServerResponse } from "node:http"

/** Prefix internal hasil rewrite `vercel.json`: `/v1/*` → `/api/ptsp-v1/*`. */
export const PREFIX_PTSP_V1 = "/api/ptsp-v1"
export const PTSP_BAWAAN = "https://sprinter.ponorogo.go.id"

export function balasJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status
  res.setHeader("Content-Type", "application/json; charset=utf-8")
  res.setHeader("Cache-Control", "no-store")
  res.end(JSON.stringify(payload))
}

export function balasGagal(res: ServerResponse, status: number, pesan: string): void {
  balasJson(res, status, { ok: false, pesan })
}

/**
 * API key dibaca dari `process.env` (bukan `import.meta.env`) supaya hanya
 * ada di sisi server. `VITE_PTSP_API_KEY` tetap jadi cadangan agar project
 * yang belum punya `PTSP_API_KEY` tetap berfungsi — tapi nilainya ikut
 * terkirim ke browser, jadi untuk produksi tetap pakai `PTSP_API_KEY`.
 */
export function bacaApiKeyPtsp(): { key: string; sumber: string } {
  if (process.env.PTSP_API_KEY) return { key: process.env.PTSP_API_KEY, sumber: "PTSP_API_KEY" }
  if (process.env.VITE_PTSP_API_KEY) {
    return { key: process.env.VITE_PTSP_API_KEY, sumber: "VITE_PTSP_API_KEY" }
  }
  return { key: "", sumber: "" }
}

export function basePtsp(): URL {
  const raw = (process.env.VITE_PTSP_BASE_URL || "").trim()
  const url = new URL(raw || PTSP_BAWAAN)
  if (url.protocol !== "https:") {
    throw new Error(`Alamat server PTSP harus HTTPS, bukan "${url.protocol}//".`)
  }
  return url
}

/** Ubah path yang diterima menjadi path upstream PTSP. */
function kePathUpstream(pathname: string): string {
  return pathname.startsWith(PREFIX_PTSP_V1)
    ? `/v1${pathname.slice(PREFIX_PTSP_V1.length)}`
    : pathname
}

export async function proxyPtsp(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  search: string,
): Promise<void> {
  const method = req.method ?? "GET"
  if (method !== "GET" && method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD")
    return balasGagal(res, 405, "Method tidak diizinkan.")
  }

  const { key: apiKey } = bacaApiKeyPtsp()
  if (!apiKey) {
    return balasGagal(
      res,
      503,
      "PTSP_API_KEY belum diatur di environment server. " +
        "Tambahkan PTSP_API_KEY (tanpa prefix VITE_) di Project Settings → Environment Variables, lalu redeploy.",
    )
  }

  let base: URL
  try {
    base = basePtsp()
  } catch (err) {
    return balasGagal(res, 500, err instanceof Error ? err.message : String(err))
  }

  const pathUpstream = kePathUpstream(pathname)

  try {
    const target = new URL(`${pathUpstream}${search}`, base)
    const upstream = await fetch(target, {
      method,
      signal: AbortSignal.timeout(18_000),
      headers: {
        Accept: pathUpstream.startsWith("/v1/") ? "application/pdf,*/*" : "application/json",
        "X-API-Key": apiKey,
      },
    })

    res.statusCode = upstream.status
    res.setHeader("Cache-Control", "no-store")
    res.setHeader("X-Content-Type-Options", "nosniff")
    /*
     * `SAMEORIGIN`, bukan `DENY`: `/api/janaka/dokumen` mengirim PDF
     * untuk ditampilkan di dalam iframe. `vercel.json` juga mengecualikan
     * `/api/` dari header `DENY` supaya nilai di sini tidak tertimpa.
     */
    res.setHeader("X-Frame-Options", "SAMEORIGIN")
    for (const name of ["content-type", "content-length", "content-disposition", "last-modified"]) {
      const value = upstream.headers.get(name)
      if (value) res.setHeader(name, value)
    }

    if (method === "HEAD" || !upstream.body) {
      res.end()
      return
    }

    // Salin apa adanya — PDF besar tidak ditahan di memori sebelum dikirim.
    const reader = upstream.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) res.write(Buffer.from(value))
    }
    res.end()
  } catch (err) {
    console.error("[ptsp-proxy] upstream request failed", err)
    balasGagal(res, 502, `Tidak bisa menghubungi server PTSP (${base.origin}).`)
  }
}

/**
 * Diagnostik runtime untuk `GET /api/health`.
 *
 * Hanya melaporkan **keberadaan** nilai env var, bukan nilainya, jadi aman
 * dibuka langsung di browser. Inilah jawaban cepat dari "di Vercel kok data
 * PTSP-nya gabisa sama sekali": satu URL, langsung ketahuan env mana yang
 * belum ter-deploy.
 */
export async function healthPtsp(res: ServerResponse): Promise<void> {
  const { key, sumber } = bacaApiKeyPtsp()

  let baseUrl = PTSP_BAWAAN
  let baseValid = true
  try {
    baseUrl = basePtsp().origin
  } catch {
    baseValid = false
  }

  const ptsp: Record<string, unknown> = {
    baseUrl,
    baseUrlPtsValid: baseValid,
    apiKey: { ada: Boolean(key), panjang: key.length, sumber: sumber || null },
    jangkauan: null,
  }

  if (key && baseValid) {
    try {
      const upstream = await fetch(new URL("/api/reklame-items?page=1&per_page=1", basePtsp()), {
        signal: AbortSignal.timeout(15_000),
        headers: { Accept: "application/json", "X-API-Key": key },
      })
      let total: number | null = null
      try {
        const body = (await upstream.json()) as { meta?: { total?: number } }
        total = typeof body?.meta?.total === "number" ? body.meta.total : null
      } catch {
        /* tubuh bukan JSON — status HTTP sudah cukup untuk diagnosa */
      }
      ptsp.jangkauan = { ok: upstream.ok, status: upstream.status, total }
    } catch (err) {
      ptsp.jangkauan = { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  balasJson(res, 200, {
    ok: Boolean(key) && (ptsp.jangkauan as { ok?: boolean } | null)?.ok === true,
    waktu: new Date().toISOString(),
    node: process.version,
    region: process.env.VERCEL_REGION || null,
    ptsp,
    /*
     * Status Firebase sengaja TIDAK dihitung di sini.
     *
     * Memanggilnya berarti mengimpor `janakaAdminApi` → menarik
     * `firebase-admin` (~15 MB) ke dalam function PTSP yang jauh lebih
     * sering dipanggil. Rincian Firebase dicek lewat
     * `/api/janaka/server:status`, yang memang hidup di function terpisah.
     */
    firebaseAdmin: {
      dicekDi: "/api/janaka/server:status",
      kredensialAda: Boolean((process.env.FIREBASE_SERVICE_ACCOUNT || "").trim()),
    },
    petunjuk: petunjukPtsp(key, ptsp),
  })
}

/** Satu baris penunjuk perbaikan, supaya tidak perlu membaca JSON. */
function petunjukPtsp(key: string, ptsp: Record<string, unknown>): string {
  if (!key) return "Isi PTSP_API_KEY di Vercel → Settings → Environment Variables → redeploy."
  if (!ptsp.baseUrlPtsValid) return "VITE_PTSP_BASE_URL bukan URL HTTPS yang valid."
  if ((ptsp.jangkauan as { ok?: boolean } | null)?.ok !== true) {
    return "PTSP_API_KEY ada tapi upstream tidak menjawab — cek PTSP_API_KEY & VITE_PTSP_BASE_URL."
  }
  return "PTSP siap. Bila data tetap kosong, periksa VITE_PTSP_API_PROXY_PATH di sisi klien."
}
