/**
 * Service worker JANAKA.
 *
 * ## Prinsip
 * Halaman ini berisi **data operasional sensitif** — daftar izin, foto bukti,
 * berita acara. Menyimbangnya di cache peramban berarti data bisa dibaca
 * tanpa jaringan, dan data basi bisa dipakai untuk keputusan penindakan.
 * Jadi tiga strategi, dipisah tegas:
 *
 * | Permintaan                       | Strategi     | Alasan                              |
 * |----------------------------------|--------------|-------------------------------------|
 * | Navigasi (`/…`)                  | Network-first| Selalu segar; fallback ke cache     |
 * | Aset build (`/assets/*`, hashed) | Cache-first  | Nama berkode hash, aman selamanya   |
 * | `/api/*`, tile peta, Firebase     | Network-only | Tidak pernah disimpan               |
 *
 * Daftar precache ditulis plugin Vite (`vite-plugin-pwa-janaka.ts`) saat build:
 * nama berkas hasil build tidak diketahui saat penulisan, dan menebaknya
 * menghasilkan cache separuh jadi — lebih buruk daripada tidak ada.
 *
 * Placeholder versi build di baris `VERSI` (sebaris di bawah) diganti plugin
 * tersebut. Placeholder itu harus muncul **tebak sekali** di seluruh
 * berkas ini; kemunculan kedua akan ditolak `tools/cek-kontrak.mts`.
 */

const VERSI = "janaka-v__JANAKA_BUILD__"
const CACHE_SHELL = `${VERSI}-shell`
const CACHE_ASET = `${VERSI}-aset`
const CACHE_NAV = `${VERSI}-nav`

/** Permintaan yang tidak boleh pernah disentuh cache. */
const JANGAN_CACHE = [
  /\/api\//,
  /\/auth\//,
  /\/identitytoolkit/,
  /firestore/i,
  /firebase/i,
  /tile\./,
  /arcgisonline/,
  /googleapis\.com\/vt/,
  /cartocdn/,
  /opentopomap/,
]

/** Aset statis — Anything yang bukan navigasi dan bukan API. */
const ASET = /\.(?:js|mjs|css|map|png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|eot)$/i

/** Berapa lama menunggu jaringan sebelum jatuh ke cache (navigasi). */
const TIMEOUT_NAV = 4000

self.addEventListener("push", (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = { body: event.data?.text() } }
  event.waitUntil(self.registration.showNotification(data.title || "JANAKA", { body: data.body || "Pembaruan tersedia", icon: "/assets/icon-192.png", badge: "/assets/icon-48.png", data: data.data || {}, vibrate: [100, 50, 100] }))
})
self.addEventListener("notificationclick", (event) => { event.notification.close(); event.waitUntil(clients.openWindow(event.notification.data?.url || "/")) })

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_SHELL)
      /*
       * `cache: "reload"` membuang header HTTP cache saat pemuatan.
       * Tanpa itu shell bisa ikutInstall dari salinan basi.
       */
      await cache.addAll(
        ["/manifest.webmanifest", "/assets/icon-32.png"].map((u) =>
          new Request(u, { cache: "reload" }),
        ),
      )
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const semua = await caches.keys()
      await Promise.all(
        semua.filter((k) => k.startsWith("janaka-") && !k.startsWith(VERSI)).map((k) => caches.delete(k)),
      )
      await self.clients.claim()
    })(),
  )
})

/** Pesan dari halaman: "ada versi baru, terapkan sekarang". */
self.addEventListener("message", (event) => {
  if (event.data === "janaka:skip-waiting") void self.skipWaiting()
})

/**
 * Navigasi: coba jaringan dulu, lalu cache, lalu shell SPA.
 *
 * ⚠️ Tidak ada halaman `offline.html` lagi. Offline pada aplikasi ini
 * dilaporkan lewat indikator sinyal di topbar, jadi fallback-nya mengembalikan
 * **shell aplikasi** (`index.html`) agar petugas tetap masuk ke aplikasi dan
 * melihat status offline-nya. Halaman HTML statis yang cuma darkened-word
 * "offline" justru lebih buruk: ia memutus konteks, dan petugas mengira
 * aplikasi rusak.
 */
async function tanganiNavigasi(request) {
  const cache = await caches.open(CACHE_NAV)

  try {
    /*
     * `AbortController` + timer, bukan `fetch(request, { timeout })` —
     * opsi `timeout` tidak ada di spec dan diabaikan browser.
     */
    const abort = new AbortController()
    const timer = setTimeout(() => abort.abort(), TIMEOUT_NAV)
    const fresh = await fetch(request, { signal: abort.signal })
    clearTimeout(timer)
    if (fresh.ok) void cache.put(request, fresh.clone())
    return fresh
  } catch {
    return (
      (await cache.match(request)) ??
      (await caches.match("/index.html")) ??
      (await cache.match("/")) ??
      new Response("Offline", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      })
    )
  }
}

/** Aset berkode hash: aman cache-first. */
async function tanganiAset(request) {
  const cache = await caches.open(CACHE_ASET)
  const ada = await cache.match(request)
  if (ada) return ada

  const fresh = await fetch(request)
  /*
   * `opaque` = response lintas origin tanpa header CORS. Leaflet & Google
   * Fonts termasuk jenis ini; isinya tetap bisa dicache walau statusnya 0.
   */
  if (fresh.ok || fresh.type === "opaque") void cache.put(request, fresh.clone())
  return fresh
}

self.addEventListener("fetch", (event) => {
  const request = event.request
  if (request.method !== "GET") return

  const url = new URL(request.url)
  // Tile peta & CDN lain ditangani Leaflet, bukan kita.
  if (url.origin !== self.location.origin) return
  if (JANGAN_CACHE.some((p) => p.test(url.pathname))) return

  if (request.mode === "navigate") {
    event.respondWith(tanganiNavigasi(request))
    return
  }

  if (ASET.test(url.pathname)) event.respondWith(tanganiAset(request))
})
