import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { dirname, resolve } from "node:path"
import type { Plugin } from "vite"

/**
 * Daftar asset dari `generateBundle`, dibaca lagi di `closeBundle`.
 *
 * Module-level karena kedua hook punya signature berbeda: `generateBundle`
 * yang diberi objek `bundle`, sedangkan `closeBundle` tidak. Yang di.simpan
 * hanya nama berkas + revision — bukan isi kode.
 */
let namaAssetTanpaKunci: { url: string; revision: string }[] = []

/**
 * Plugin PWA JANAKA.
 *
 * Menulis service worker ke `dist/sw.js` **saat build**, dengan nama berkas
 * hasil build yang sudah diketahui. Service worker yang menulis daftar
 * precache-nya sendiri mustahil: berkas yang baru di-build belum ada ketika
 * skrip SW dieksekusi.
 *
 * Yang di-cache:
 *  • Shell statis yang nilainya tetap — ikon & manifest.
 *  • Aset berkode hash (`assets/index-XXXX.js`) — hash ada di namanya, jadi
 *    nama baru otomatis berarti konten baru. Tidak perlu penyegaran manual.
 *
 * Yang **tidak** di-cache: `/api/*`, tile peta, dan dokumen HTML selain
 * `index.html`. Alasannya ada di kepala `src/pwa/sw-template.js`.
 *
 * `index.html` sengaja di-*precache* dengan `revision`: HTML-nya berubah tiap
 * deploy (hash aset ikut berubah), jadi isinya harus ikut dihitung ulang saat
 * digest berubah.
 */
export function pwaJanaka(): Plugin {
  const TEMPLATE = resolve(import.meta.dirname, "src/pwa/sw-template.js")
  const INDEX_HTML = resolve(import.meta.dirname, "dist/index.html")
  const SW_JS = resolve(import.meta.dirname, "dist/sw.js")

  return {
    name: "janaka-pwa",
    apply: "build",

    /*
     * `generateBundle` tetap dipakai untuk asset/chunk (`.code`/`.source`).
     * Daftar nama berkuncinya disimpan, lalu dipakai ulang di `closeBundle`.
     */
    generateBundle(_options, bundle) {
      const tanpaKunci: { url: string; revision: string }[] = []

      const tambah = (fileName: string) => {
        // CSS & JS sudah punya hash di namanya → revision tidak perlu.
        const tanpaHash = /\.[0-9a-z_-]{8,}\.(?:js|css)$/i.test(fileName)
        tanpaKunci.push({
          url: `/${fileName}`,
          revision: tanpaHash ? "" : hashIsi(bundle[fileName]),
        })
      }

      for (const fileName of Object.keys(bundle)) {
        // Manifest & ikon sudah ada di `public/`, jadi tidak lewat bundle.
        if (fileName.endsWith(".map")) continue
        if (/\.(?:js|css|woff2?|png|svg|webmanifest)$/i.test(fileName)) tambah(fileName)
      }
      namaAssetTanpaKunci = tanpaKunci
    },

    /*
     * `sw.js` ditulis di `closeBundle`, bukan `generateBundle`.
     *
     * Dua alasan, keduanya soal `index.html`:
     *  1. Vite memproses HTML pada pipeline `post` — `bundle["index.html"]`
     *     tidak ada (dan `undefined`) selama `generateBundle`, sehingga
     *     `revision`-nya selalu hash string kosong. Digest pun beku, cache
     *     lama tidak pernah dibersihkan, dan service worker bisa
     *     menyajikan shell versi sebelumnya selamanya.
     *  2. `emitFile` di dalam `generateBundle` diabaikan oleh HTML plugin,
     *     sehingga `sw.js` bisa tidak tertulis sama sekali.
     */
    closeBundle() {
      const template = readFileSync(TEMPLATE, "utf8")

      /** Nama berkas yang ikut precache, relatif terhadap root situs. */
      const precache = [...namaAssetTanpaKunci]

      /*
       * Baca `index.html` dari disk: di titik ini Vite sudah selesai
       * menulisnya. Isinya ikut di-hash supaya perubahan HTML/CSS selalu
       * menghasilkan versi cache baru.
       */
      const isiIndexHtml = existsSync(INDEX_HTML) ? readFileSync(INDEX_HTML, "utf8") : ""
      precache.push({ url: "/index.html", revision: hashIsi(isiIndexHtml) })

      /*
       * Digest = hash isi seluruh daftar, bukan isi SW-nya. Dua build dengan
       * aset berbeda tetapi SW sama akan tetap menghasilkan versi berbeda —
       * tanpa ini, SW lama terus aktif dan pengguna terjebak di versi
       * sebelumnya.
       */
      const build = createHash("sha256")
        .update(JSON.stringify(precache))
        .digest("hex")
        .slice(0, 12)

      /*
       * `replaceAll`, bukan `replace`.
       *
       * Placeholder-nya muncul DUA kali di template: sekali di komentar
       * (`* Placeholder __JANAKA_BUILD__ diganti plugin tersebut.`) dan
       * sekali di baris `const VERSI`. `String.replace` dengan string biasa
       * hanya mengganti occurrence PERTAMA — jadi yang kena adalah komentar,
       * sedangkan baris `VERSI` tetap memakai placeholder kosong.
       *
       * Akibatnya `VERSI` selalu bernilai sama di setiap build, cache SW
       * lama tidak pernah dibersihkan, dan service worker bisa menyajikan
       * bundle versi lama — termasuk `/api/*` yang injuring Request lama.
       */
      const isi = template
        .replaceAll("__JANAKA_BUILD__", build)
        // Sisipkan daftar precache sebagai konstanta yang dibaca `install`.
        .replace(
          "const CACHE_ASET = `${VERSI}-aset`",
          `const CACHE_ASET = \`\${VERSI}-aset\`\nconst PRECACHE = ${JSON.stringify(precache)}`,
        )
        /*
         * Sisipkan daftar precache di dalam blok `install` milik template.
         *
         * ⚠️ Substitusi Versi menyisipkan `const PRECACHE`, tapi blok
         * `cache.addAll` di template masih merujuk daftar statis yang
         * lama. Karena itu blok itu ditulis ulang di sini — dan string-nya
         * harus cocok **persis** dengan yang ada di `sw-template.js`.
         *
         * Kalau tidak cocok, `addAll` tetap jalan tanpa `PRECACHE`: shell
         * terpasang tapi tidak satu pun aset ter-cache, sehingga aplikasi
         * offline langsung rusak. Itu sebabnya `.mts` di `tools/` memeriksa
         * kedua string ini masih nyambung.
         */
        .replace(
          `      await cache.addAll(
        ["/manifest.webmanifest", "/assets/icon-32.png"].map((u) =>
          new Request(u, { cache: "reload" }),
        ),
      )`,
          `      await cache.addAll(
        ["/manifest.webmanifest", "/assets/icon-32.png", ...PRECACHE.map((entry) => entry.url)]
         .filter((u, index, urls) => urls.indexOf(u) === index)
         .map((u) =>
          new Request(u, { cache: "reload" }),
        ),
      )`,
        )

      mkdirSync(dirname(SW_JS), { recursive: true })
      writeFileSync(SW_JS, isi, "utf8")
    },
  }
}

/**
 * Hash isi berkas dari bundle Vite.
 *
 * Vite memakai dua bentuk data di `generateBundle`:
 *  • **chunk** (JS)     → punya `.code`
 *  • **asset** (CSS, HTML, gambar) → punya `.source`
 *
 * Kalau hanya `.code` yang dibaca, asset seperti `index.html` dan
 * `*.css` mendapat hash dari string kosong — selalu sama, di build
 * manapun. Digest precache lalu beku: perubahan isi HTML/CSS tidak
 * pernah menghasilkan versi cache baru, jadi `activate` tidak pernah
 * membersihkan cache lama dan service worker bisa menyajikan shell
 * versi sebelumnya selamanya.
 */
function hashIsi(chunk: unknown): string {
  const source =
    typeof chunk === "string"
      ? chunk
      : chunk && typeof chunk === "object" && "code" in chunk
        ? String((chunk as { code: string }).code)
        : chunk && typeof chunk === "object" && "source" in chunk
          ? String((chunk as { source: string }).source)
          : ""
  return createHash("sha256").update(source).digest("hex").slice(0, 10)
}
