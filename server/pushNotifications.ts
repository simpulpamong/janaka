import { initializeApp, getApps, cert, applicationDefault } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { getFirestore, FieldValue } from "firebase-admin/firestore"
import webpush from "web-push"

function sdk() {
  if (!getApps().length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT
    initializeApp(raw ? { credential: cert(JSON.parse(raw)) } : { credential: applicationDefault(), projectId: process.env.FIREBASE_PROJECT_ID })
  }
  return { auth: getAuth(), db: getFirestore() }
}
export type PushSubscription = { endpoint: string; keys: { p256dh: string; auth: string }; uid: string; createdAt?: unknown }
export function vapidReady() {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)
}
function configure() { webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@ponorogo.go.id", process.env.VAPID_PUBLIC_KEY || "", process.env.VAPID_PRIVATE_KEY || "") }
export async function verify(req: { headers: Record<string, string | string[] | undefined> }) {
  const value = req.headers.authorization
  const token = typeof value === "string" && value.startsWith("Bearer ") ? value.slice(7) : ""
  if (!token) throw new Error("unauthorized")
  return sdk().auth.verifyIdToken(token)
}
export async function saveSubscription(uid: string, sub: Omit<PushSubscription, "uid">) {
  if (!sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) throw new Error("invalid subscription")
  const id = Buffer.from(sub.endpoint).toString("base64url").slice(0, 120)
  await sdk().db.collection("pushSubscriptions").doc(id).set({ ...sub, uid, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
}
export async function removeSubscription(uid: string, endpoint: string) {
  const id = Buffer.from(endpoint).toString("base64url").slice(0, 120)
  const ref = sdk().db.collection("pushSubscriptions").doc(id)
  const snap = await ref.get(); if (snap.exists && snap.data()?.uid === uid) await ref.delete()
}
export async function sendPush(payload: Record<string, unknown>, filter?: (s: PushSubscription) => boolean) {
  if (!vapidReady()) return { sent: 0, skipped: true }
  configure(); const snap = await sdk().db.collection("pushSubscriptions").get(); let sent = 0
  await Promise.all(snap.docs.map(async d => { const s = d.data() as PushSubscription; if (filter && !filter(s)) return
    try { await webpush.sendNotification(s as webpush.PushSubscription, JSON.stringify(payload)); sent++ }
    catch (e: unknown) { if ((e as { statusCode?: number }).statusCode === 404 || (e as { statusCode?: number }).statusCode === 410) await d.ref.delete() }
  }))
  return { sent, skipped: false }
}
export async function checkExpired() {
  const db = sdk().db, now = new Date(); const snap = await db.collection("reklame").get(); let count = 0
  for (const doc of snap.docs) { const x = doc.data() as Record<string, unknown>; const date = x.tanggal_berakhir || x.tanggalBerakhir || x.expiredAt; if (!date || x.status === "expired") continue
    const parsed = date && typeof date === "object" && "toDate" in date ? (date as { toDate: () => Date }).toDate() : new Date(String(date))
    if (!Number.isNaN(parsed.getTime()) && parsed < now) { await doc.ref.set({ status: "expired", updatedAt: FieldValue.serverTimestamp() }, { merge: true }); count++ }
  }
  return count
}
