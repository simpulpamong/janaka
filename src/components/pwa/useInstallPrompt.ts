import { useCallback, useEffect, useState } from "react"

/** Peristiwa `beforeinstallprompt` — tidak ada di tipe DOM standar. */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

const KUNCI_SEMBUNYI = "janaka-pwa-dismissed"
const KUNCI_TERPASANG = "janaka-pwa-installed"

/**
 * Pemegang satu-satunya untuk instance prompt.
 *
 * Peristiwa `beforeinstallprompt` hanya terbit **sekali** per siklus
 * pemasangan. Menyimpannya di state React berisiko hilang saat komponen
 * di-remount, dan membuat dua pemanggil hears peristiwa yang sama. Modul-level
 * holder menutup keduanya.
 */
let promptTersimpan: InstallPromptEvent | null = null

/** Listener dipasang sekali saat modul dimuat, bukan per komponen. */
const pendengar = new Set<() => void>()
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    // Simpan event agar tombol install aplikasi dapat memanggil prompt()
    // dari aksi pengguna. Banner native tidak ditampilkan otomatis.
    event.preventDefault()
    promptTersimpan = event as InstallPromptEvent
    pendengar.forEach((panggil) => panggil())
  })
}

/** Apakah aplikasi sudah berjalan lepas (standalone) dari layar utama. */
function sudahStandalone(): boolean {
  if (typeof window === "undefined") return false
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari tidak mendukung `display-mode`; pakai navigator-nya.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

function bacaKunci(kunci: string): string | null {
  try {
    return localStorage.getItem(kunci)
  } catch {
    return null
  }
}

function tulisKunci(kunci: string, nilai: string): void {
  try {
    localStorage.setItem(kunci, nilai)
  } catch {
    /* mode privat — abaikan */
  }
}

/**
 * Hoisting prompt "Pasang aplikasi".
 *
 * ## Kenapa estado dipasang permanen
 * Peristiwa `beforeinstallprompt` hanya terbit sekali per siklus pemasangan.
 * Kalau tombol Pasang muncul lagi di tempat lain setelah pengguna menutupnya,
 * aplikasi yang sama menawarkan dua tombol untuk aksi yang sama. Penanda di
 * `localStorage` menutup celah itu.
 *
 * ## Kenapa iOS ditangani terpisah
 * iOS Safari tidak pernah menerbitkan peristiwa tersebut. Di sana tidak ada
 * jalur prompt sama sekali; satu-satunya jalan adalah Bagikan → "Add to Home
 * Screen`. Karena itu UI menampilkan petunjuk, bukan tombol yang tidak
 * melakukan apa pun.
 */
export function useInstallPrompt() {
  const [adaPrompt, setAdaPrompt] = useState(promptTersimpan !== null)
  const [terpasang, setTerpasang] = useState(
    () => sudahStandalone() || bacaKunci(KUNCI_TERPASANG) === "1",
  )
  const [sembunyi, setSembunyi] = useState(() => bacaKunci(KUNCI_SEMBUNYI) === "1")
  const [sedangMemasang, setSedangMemasang] = useState(false)

  useEffect(() => {
    const perbarui = () => setAdaPrompt(promptTersimpan !== null)
    pendengar.add(perbarui)

    const onTerpasang = () => {
      setAdaPrompt(false)
      setTerpasang(true)
      tulisKunci(KUNCI_TERPASANG, "1")
      hapusKunci(KUNCI_SEMBUNYI)
    }
    window.addEventListener("appinstalled", onTerpasang)

    // Beberapa peramban baru selesai memuat halaman sudah langsung punya prompt.
    const timer = setTimeout(perbarui, 1200)

    return () => {
      pendengar.delete(perbarui)
      window.removeEventListener("appinstalled", onTerpasang)
      clearTimeout(timer)
    }
  }, [])

  const pasang = useCallback(async (): Promise<boolean> => {
    const ev = promptTersimpan
    if (!ev || sedangMemasang) return false
    setSedangMemasang(true)
    try {
      await ev.prompt()
      const pilihan = await ev.userChoice
      if (pilihan.outcome === "accepted") {
        setTerpasang(true)
        tulisKunci(KUNCI_TERPASANG, "1")
      }
      promptTersimpan = null
      setAdaPrompt(false)
      return pilihan.outcome === "accepted"
    } finally {
      setSedangMemasang(false)
    }
  }, [sedangMemasang])

  const sembunyikan = useCallback(() => {
    setSembunyi(true)
    tulisKunci(KUNCI_SEMBUNYI, "1")
  }, [])

  /** iOS: tidak ada prompt native, hanya langkah manual yang singkat. */
  const perluManual =
    typeof navigator !== "undefined" &&
    /iphone|ipad|ipod/i.test(navigator.userAgent) &&
    !sudahStandalone()

  return {
    /** Prompt native tersedia (Chrome, Edge, Android). */
    bisaPasang: adaPrompt,
    /** Perlu arahan manual (iOS Safari). */
    perluManual,
    /** Sudah terpasang atau pengguna pernah menutupnya. */
    terpasang,
    /** Banner layak ditampilkan? */
    menampilkan: !sembunyi && !terpasang && (adaPrompt || perluManual),
    sedangMemasang,
    pasang,
    sembunyikan,
  }
}

function hapusKunci(kunci: string): void {
  try {
    localStorage.removeItem(kunci)
  } catch {
    /* abaikan */
  }
}
