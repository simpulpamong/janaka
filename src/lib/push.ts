import { auth } from "@/lib/firebase"

const key = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined
const url = "/api/notifications"

async function call(action: string, body?: unknown) {
  const token = await auth.currentUser?.getIdToken()
  if (!token) throw new Error("Sesi login tidak tersedia. Silakan masuk ulang.")
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), 15000)
  try {
    const response = await fetch(`${url}?action=${action}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })
    const data = await response.json().catch(() => null) as { error?: string; message?: string } | null
    if (!response.ok) throw new Error(data?.message || data?.error || `Gagal mengatur notifikasi (HTTP ${response.status})`)
    return data
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw new Error("Server notifikasi tidak merespons. Coba lagi.")
    throw error
  } finally {
    window.clearTimeout(timer)
  }
}

function base64ToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4)
  const raw = atob(normalized)
  return Uint8Array.from(raw, (character) => character.charCodeAt(0))
}

export async function activatePush() {
  if (!key || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    throw new Error("Browser ini tidak mendukung Web Push")
  }
  const permission = await Notification.requestPermission()
  if (permission !== "granted") {
    throw new Error(permission === "denied" ? "Izin notifikasi diblokir. Izinkan dari pengaturan situs browser." : "Izin notifikasi belum diberikan.")
  }
  const registration = await navigator.serviceWorker.getRegistration() ?? await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" })
  await navigator.serviceWorker.ready
  const existing = await registration.pushManager.getSubscription()
  const subscription = existing ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ToBytes(key).buffer as ArrayBuffer })
  await call("subscribe", { subscription: subscription.toJSON() })
  return subscription
}

export const testPush = () => call("test")

export async function deactivatePush() {
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (subscription) {
    await call("unsubscribe", { endpoint: subscription.endpoint })
    await subscription.unsubscribe()
  }
}
