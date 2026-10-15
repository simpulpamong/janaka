import { useCallback } from "react"
import { useToast as useToastUi, type ToastTone } from "@/components/ui/Toast"

type ToastType = "success" | "error" | "warning" | "info"

/**
 * Hook toast dengan identitas fungsi yang stabil.
 *
 * Penting: `showToast` dibungkus `useCallback` tanpa dependency sehingga
 * referensinya stabil antar-render. Tanpa ini, setiap pemanggilan hook
 * menghasilkan fungsi baru, komponen yang memakai `showToast` sebagai
 * dependency `useEffect` akan memicu render berulang (infinite loop).
 *
 * Toda ke `ToastProvider` milik JANAKA — bukan pustaka pihak ketiga — supaya
 * notifikasi bisa dipanggil dari dalam modal dan tetap muncul di tepi layar.
 */
export function useToast() {
  const toast = useToastUi()

  const showToast = useCallback(
    (message: string, type: ToastType = "info") => {
      switch (type) {
        case "success":
          toast.success(message)
          break
        case "error":
          toast.error(message)
          break
        case "warning":
          toast.warning(message)
          break
        default:
          toast.info(message)
      }
    },
    [toast],
  )

  return { showToast }
}

export type { ToastTone }