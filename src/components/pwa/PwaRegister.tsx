import { useEffect, useState } from "react"
import { Download, Share, Smartphone, X } from "lucide-react"
import { useInstallPrompt } from "./useInstallPrompt"
import { JanakaLogo } from "@/components/layout/JanakaLogo"
import { useToast } from "@/components/ui/Toast"

/**
 * Registrasi service worker + jendel install/versi baru.
 *
 * ## Kenapa hanya di produksi
 * Service worker di server pengembangan akan menyimpan hasil modul Vite yang
 * berubah setiap kali berkas disentuh. Setiap penyimpanan baru membatalkan satu
 * cache, tapi tetap tersisa satu worker yang menyajikan modul basi —
 * gejalanya "sudah hard refresh tapi kodenya tetap sama". Di produksi nama
 * asetnya berkode hash, jadi masalah itu tidak ada.
 *
 * ## Kenapa pembaruan tidak dipasang diam-diam
 * `skipWaiting()` tanpa penjelasan menghasilkan layar yang melompat-lompat:
 * aset baru masuk sementara komponen lama masih berjalan. Halaman ini
 * menunggu sampai tampilan selesai, baru menyegarkan sendiri.
 */
export function PwaRegister() {
  useServiceWorker()
  return (
    <>
      <BannerInstall />
      <BannerPembaruan />
    </>
  )
}

/** Daftarkan service worker dan kelola siklus hidupnya. */
function useServiceWorker(): void {
  const toast = useToast()

  useEffect(() => {
    if (!import.meta.env.PROD) return
    if (!("serviceWorker" in navigator)) return

    let dibatalkan = false

    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((registrasi) => {
        if (dibatalkan) return

        // Sudah ada worker terpasang sebelum halaman ini dimuat.
        if (registrasi.active && !navigator.serviceWorker.controller) {
          toast.info("Aplikasi siap untuk dipakai saat luring.")
        }

        registrasi.addEventListener("updatefound", () => {
          const baru = registrasi.installing
          if (!baru) return
          baru.addEventListener("statechange", () => {
            // `controller` berubah = worker baru benar-benar mengambil alih.
            if (baru.state === "installed" && navigator.serviceWorker.controller) {
              toast.info("Versi baru JANAKA sudah siap.", undefined)
            }
          })
        })
      })
      .catch((err) => {
        console.warn("[pwa] Gagal mendaftarkan service worker:", err)
      })

    return () => {
      dibatalkan = true
    }
  }, [toast])
}

/** Banner "Pasang aplikasi". */
function BannerInstall() {
  const { menampilkan, bisaPasang, perluManual, sedangMemasang, pasang, sembunyikan } =
    useInstallPrompt()

  if (!menampilkan) return null

  return (
    <div className="janaka-no-print pointer-events-none fixed inset-x-0 bottom-0 z-[80] flex justify-center p-3 sm:justify-end sm:p-4">
      <div className="animate-fade-in pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border border-slate-200 bg-white/95 p-3.5 shadow-2xl shadow-slate-900/15 backdrop-blur-md dark:border-slate-700 dark:bg-slate-800/95 dark:shadow-black/50">
        <div className="shrink-0 rounded-xl bg-[#0b3b2e] p-1">
          <JanakaLogo className="h-8 w-8" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-slate-800 dark:text-slate-100">
            Pasang JANAKA di layar utama
          </p>
          {perluManual && !bisaPasang ? (
            <p className="mt-1 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
              Di iPhone: ketuk{" "}
              <Share className="inline h-3 w-3 -translate-y-px" aria-hidden="true" /> Bagikan, lalu
              pilih <strong>Tambah ke Layar Utama</strong>.
            </p>
          ) : (
            <p className="mt-1 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
              Akses cepat tanpa membuka peramban, dan tetap bisa dipakai saat jaringan lambat.
            </p>
          )}

          <div className="mt-2.5 flex items-center gap-2">
            {bisaPasang ? (
              <button
                type="button"
                onClick={() => void pasang()}
                disabled={sedangMemasang}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-[11px] font-bold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
              >
                <Download className="h-3.5 w-3.5" />
                {sedangMemasang ? "Memasang…" : "Pasang"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={sembunyikan}
              className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-slate-500 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-700/60"
            >
              Nanti dulu
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={sembunyikan}
          aria-label="Tutup ajakan pasang aplikasi"
          className="shrink-0 rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

/** Banner "Versi baru tersedia". */
function BannerPembaruan() {
  const [tersedia, setTersedia] = useState(false)
  const [workerBaru, setWorkerBaru] = useState<ServiceWorker | null>(null)

  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return

    const cek = () => {
      if (!navigator.serviceWorker.controller) return
      navigator.serviceWorker.getRegistration().then((registrasi) => {
        const baru = registrasi?.waiting ?? registrasi?.installing
        if (baru) {
          setWorkerBaru(baru)
          setTersedia(true)
        }
      })
    }

    cek()
    navigator.serviceWorker.addEventListener("controllerchange", cek)
    return () => navigator.serviceWorker.removeEventListener("controllerchange", cek)
  }, [])

  if (!tersedia) return null

  return (
    <div className="janaka-no-print pointer-events-none fixed inset-x-0 top-3 z-[80] flex justify-center px-3">
      <div className="animate-fade-in pointer-events-auto flex items-center gap-3 rounded-2xl border border-blue-200 bg-white/95 px-3.5 py-2.5 shadow-2xl shadow-slate-900/10 backdrop-blur-md dark:border-blue-500/30 dark:bg-slate-800/95">
        <Smartphone className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
        <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">
          Versi baru JANAKA sudah tersedia.
        </p>
        <button
          type="button"
          onClick={() => {
            workerBaru?.postMessage("janaka:skip-waiting")
            // `location.reload` dipanggil setelah worker memberi tahu ia sudah
            // aktif, supaya tidak memuat aset yang belum ada.
            navigator.serviceWorker.addEventListener("controllerchange", () => location.reload(), {
              once: true,
            })
          }}
          className="rounded-lg bg-blue-600 px-2.5 py-1 text-[11px] font-bold text-white transition-colors hover:bg-blue-700"
        >
          Muat ulang
        </button>
        <button
          type="button"
          onClick={() => setTersedia(false)}
          aria-label="Tutup"
          className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 dark:hover:bg-slate-700"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
