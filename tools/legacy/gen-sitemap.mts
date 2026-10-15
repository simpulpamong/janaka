/**
 * Generator sitemap.xml — dijalankan setelah `vite build`.
 *
 * Aplikasi SPA: rute sesungguhnya (`/mapping`, `/data-reklame`, …) digambar
 * di peramban, jadi tidak ada berkas HTML per rute. Google tetap mengindeks
 * shell SPA, tetapi konten dinamis (izin reklame, laporan) hanya muncul setelah
 * JS dijalankan. Sitemap ini hanya daftarkan halaman publik yang **benar-benar
 * ada** tanpa login: `/`, `/login`, dan offline.
 *
 * Jalankan: `npm run gen:sitemap` (otomatis di `postbuild` di package.json).
 */
import { writeFileSync } from "node:fs"
import { resolve } from "node:path"

const BASE = "https://janaka.ponorogo.go.id"
const RUTE = [
  { url: "/dashboard", changefreq: "weekly", priority: 1.0 },
  { url: "/login", changefreq: "yearly", priority: 0.3 },
]

const hariIni = new Date().toISOString().split("T")[0]

const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...RUTE.map(
    (r) =>
      `  <url>\n    <loc>${BASE}${r.url}</loc>\n    <lastmod>${hariIni}</lastmod>\n    <changefreq>${r.changefreq}</changefreq>\n    <priority>${r.priority}</priority>\n  </url>`,
  ),
  "</urlset>",
].join("\n")

const OUT = resolve(import.meta.dirname, "..", "..", "dist", "sitemap.xml")
writeFileSync(OUT, xml)
console.log(`Sitemap ditulis ke ${OUT}`)