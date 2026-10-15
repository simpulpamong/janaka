import { defineConfig, loadEnv } from "vite"
import react from "@vitejs/plugin-react"
import { fileURLToPath } from "node:url"
/*
 * `.js` wajib di impor relatif: `tsconfig.node.json` memakai
 * `moduleResolution: nodenext` supaya aturan ESM yang sama juga berlaku
 * di file yang ikut ter-deploy ke Vercel. TypeScript tetap menunjuk ke
 * sumber `.ts`-nya.
 */
import janakaAdminApi from "./vite-plugin-janaka-api.js"
import { pwaJanaka } from "./vite-plugin-pwa-janaka.js"

export default defineConfig(({ mode }) => {
  // Muat .env agar API key tersedia di sisi server (proxy), bukan hanya di browser.
  const env = loadEnv(mode, process.cwd(), "")

  // Kredensial Firebase Admin SDK dibaca oleh `server/janakaAdminApi.ts`.
  // surfaced lewat process.env supaya `vite dev`/`vite preview` ikut memakainya.
  // `PTSP_API_KEY` hanya di-surface ke proses Node agar tetap server-only.
  for (const key of [
    "FIREBASE_SERVICE_ACCOUNT",
    "GOOGLE_APPLICATION_CREDENTIALS",
    "FIREBASE_PROJECT_ID",
    "VITE_PTSP_BASE_URL",
    "PTSP_API_KEY",
    "VITE_PTSP_API_KEY",
  ]) {
    if (env[key]) process.env[key] = env[key]
  }

  const PTSP_BASE_URL = env.VITE_PTSP_BASE_URL || "https://sprinter.ponorogo.go.id"
  const PTSP_API_KEY = env.PTSP_API_KEY || env.VITE_PTSP_API_KEY || ""
  if (PTSP_API_KEY) process.env.PTSP_API_KEY = PTSP_API_KEY

  /**
   * Server PTSP (sprinter.ponorogo.go.id) tidak mengirim header
   * `Access-Control-Allow-Origin`, sehingga request langsung dari browser
   * diblokir oleh CORS. Proxy di bawah meneruskan request dari browser ke
   * server PTSP melalui proses Node (tidak terkena kebijakan CORS).
   *
   * Header `X-API-Key` ditambahkan di sisi proxy agar kredensial API tidak
   * pernah terekspos di bundle browser.
   */
  const ptspProxy = {
    target: PTSP_BASE_URL,
    changeOrigin: true,
    secure: true,
    headers: {
      ...(PTSP_API_KEY ? { "X-API-Key": PTSP_API_KEY } : {}),
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  }

  return {
    /*
     * `pwaJanaka()` menulis `dist/sw.js` saat build. Plugin ini TIDAK boleh
     * dilupakan: tanpa itu service worker tidak pernah dibuat, sehingga
     * tidak ada shell luring sama sekali — persis yang(App shell) kembali
     * begitu koneksi hilang.
     */
    plugins: [react(), pwaJanaka(), janakaAdminApi()],

    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },

    server: {
      host: true,
      port: 5173,
      strictPort: false,
      proxy: {
        // Browser → /api/reklame-items  →  PTSP /api/reklame-items
        "/api": ptspProxy,
        // Berkas SK digital (signed_dokumen) juga perlu proxy agar bisa dibuka
        "/v1": ptspProxy,
      },
    },

    preview: {
      host: true,
      port: 4173,
      proxy: {
        "/api": ptspProxy,
        "/v1": ptspProxy,
      },
    },

    build: {
      outDir: "dist",
      sourcemap: false,
      chunkSizeWarningLimit: 1500,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ["react", "react-dom", "react-router-dom"],
            firebase: ["firebase/app", "firebase/auth", "firebase/firestore"],
            maps: ["leaflet", "react-leaflet"],
            pdf: ["jspdf", "jspdf-autotable"],
          },
        },
      },
    },
  }
})