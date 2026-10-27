import { auth } from "@/lib/firebase"
const key = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined
const url = "/api/notifications"
async function call(action: string, body?: unknown) { const token = await auth.currentUser?.getIdToken(); if (!token) throw new Error("Belum masuk")
  const r = await fetch(`${url}?action=${action}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }); if (!r.ok) throw new Error("Gagal mengatur notifikasi"); return r.json() }
export async function activatePush() { if (!key || !("serviceWorker" in navigator) || !("PushManager" in window)) throw new Error("Browser tidak mendukung Web Push")
  const permission = await Notification.requestPermission(); if (permission !== "granted") throw new Error("Izin notifikasi ditolak")
  const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: Uint8Array.from(atob(key.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0)) }); await call("subscribe", { subscription: sub.toJSON() }); return sub }
export const testPush = () => call("test")
export async function deactivatePush() { const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.getSubscription(); if (sub) { await call("unsubscribe", { endpoint: sub.endpoint }); await sub.unsubscribe() } }
